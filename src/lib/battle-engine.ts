import type {
  BattleState,
  TeamState,
  CharacterState,
  PlayerAction,
  BattleLogEntry,
  Team,
  CharacterData,
  DerivedSkillAvailability,
} from '../types';
import { getSkillHandler } from './skill-handlers/index';
import { triggerPassives, evaluateAlwaysPassives } from './passives';
import { runDeathCheck, runCostCarry } from './interceptors';
import charactersJson from '../data/characters.json';
import { calcDoTDamage } from './damage';
import { tickEffects } from './effects';

const COST_PER_TURN = 3;
const LOG_MAX = 50;

// ============================================================
// 初期化
// ============================================================

export function createCharacterState(data: CharacterData): CharacterState {
  return {
    id: data.id,
    name: data.name,
    element: data.element,
    hp: data.hp,
    maxHp: data.hp,
    atk: data.atk,
    def: data.def,
    customResources: data.custom_resources.map((r) => ({
      id: r.id,
      name: r.name,
      value: r.initial_value,
      min: r.min,
      max: r.max,
      display: r.display,
    })),
    effects: [],
    unlockedDerivedSkills: [],
    priority: 0,
    isAlive: true,
    isActive: false,
    battleFlags: {},
    disabledSkills: [],
    skillUsagePerTurn: {},
  };
}

export function getCharacterDataById(id: string): CharacterData | undefined {
  return (charactersJson as CharacterData[]).find((c) => c.id === id);
}

export function getAllCharacterData(): CharacterData[] {
  return charactersJson as CharacterData[];
}

/** 編成（charIdの配列）からTeamStateを生成する */
export function createTeamState(
  playerId: string,
  charIds: string[]
): TeamState {
  const characters = charIds.map((id) => {
    const data = getCharacterDataById(id);
    if (!data) throw new Error(`Unknown character: ${id}`);
    return createCharacterState(data);
  });
  return { playerId, activeIndex: 0, characters };
}

/** 初期BattleStateを生成（先頭選択フェーズ前） */
export function createInitialBattleState(
  team1: TeamState,
  team2: TeamState
): BattleState {
  // コイントスで初期の先行後攻を決定
  const coinToss = Math.random() < 0.5 ? 'team1' : 'team2';

  const initialState: BattleState = {
    team1,
    team2,
    turn: 0,
    currentTurn: coinToss,
    phase: 'selecting_first',
    remainingCost: 0,
    usedSkillThisTurn: false,
    winner: null,
    log: [{ turn: 0, actor: 'system', description: `バトル開始 - ${coinToss === 'team1' ? 'team1' : 'team2'}が先行` }],
    pendingSelectionNext: [],
    battleFlags: {
      initialFirstTurn: coinToss, // 初期の先行を保存
      priorityChanged: false,    // 優先度が変化したか
    },
  };

  // on_battle_startトリガーを発火
  return triggerPassives(initialState, 'on_battle_start');
}

// ============================================================
// ユーティリティ
// ============================================================

export function getActive(state: BattleState, team: Team): CharacterState {
  return state[team].characters[state[team].activeIndex];
}

export function getEnemyTeam(team: Team): Team {
  return team === 'team1' ? 'team2' : 'team1';
}

function addLog(
  state: BattleState,
  description: string,
  actor: BattleLogEntry['actor'] = 'system'
): BattleState {
  const entry: BattleLogEntry = { turn: state.turn, actor, description };
  return { ...state, log: [...state.log, entry].slice(-LOG_MAX) };
}

function updateChar(
  state: BattleState,
  team: Team,
  charId: string,
  updater: (c: CharacterState) => CharacterState
): BattleState {
  return {
    ...state,
    [team]: {
      ...state[team],
      characters: state[team].characters.map((c) =>
        c.id === charId ? updater(c) : c
      ),
    },
  };
}

// ============================================================
// 派生スキル管理
// ============================================================

function processUnlocks(
  state: BattleState,
  skillId: string,
  actorTeam: Team
): BattleState {
  const data = getAllCharacterData();
  const activeChar = getActive(state, actorTeam);
  const charData = data.find((d) => d.id === activeChar.id);
  if (!charData) return state;

  const skill = [...charData.skills, ...charData.derived_skills].find((s) => s.id === skillId);
  if (!skill || !('unlocks' in skill) || !skill.unlocks || skill.unlocks.length === 0) return state;

  const unlocks = skill.unlocks;

  return updateChar(state, actorTeam, activeChar.id, (c) => {
    const existing = c.unlockedDerivedSkills.map((u) => u.skillId);
    const newUnlocks = unlocks.filter(
      (u) => !existing.includes(u.skillId)
    );
    return {
      ...c,
      unlockedDerivedSkills: [...c.unlockedDerivedSkills, ...newUnlocks],
    };
  });
}

/** same_turn 派生スキルをクリア */
function clearSameTurnUnlocks(state: BattleState): BattleState {
  let s = state;
  for (const team of ['team1', 'team2'] as Team[]) {
    for (const char of s[team].characters) {
      s = updateChar(s, team, char.id, (c) => ({
        ...c,
        unlockedDerivedSkills: c.unlockedDerivedSkills.filter(
          (u) => u.available !== 'same_turn'
        ),
      }));
    }
  }
  return s;
}

/** next_turn 派生スキルを「解放済み」に昇格（next_turn → permanent扱いで残す） */
function promoteNextTurnUnlocks(state: BattleState): BattleState {
  let s = state;
  for (const team of ['team1', 'team2'] as Team[]) {
    for (const char of s[team].characters) {
      s = updateChar(s, team, char.id, (c) => ({
        ...c,
        unlockedDerivedSkills: c.unlockedDerivedSkills.map((u) =>
          u.available === 'next_turn'
            ? { ...u, available: 'permanent' as DerivedSkillAvailability }
            : u
        ),
      }));
    }
  }
  return s;
}

// ============================================================
// 死亡・勝利判定
// ============================================================

function processDeathCheck(state: BattleState): BattleState {
  let s = state;
  for (const team of ['team1', 'team2'] as Team[]) {
    for (const char of s[team].characters) {
      if (char.isAlive && char.hp <= 0) {
        // 死亡時パッシブ発動（控えに下がる時と同様の処理）
        if (char.isActive) {
          s = triggerPassives(s, 'on_switch_out');
        }
        s = runDeathCheck(s, char.id, team);
        if (!s[team].characters.find((c) => c.id === char.id)!.isAlive) {
          s = addLog(s, `${char.name}が戦闘不能になった`);
          s = triggerPassives(s, 'on_ally_death', { dyingCharId: char.id });
          s = triggerPassives(s, 'on_enemy_death', { dyingCharId: char.id });
          s = triggerPassives(s, 'on_nemesis_death_by_ally', { dyingCharId: char.id });
        }
      }
    }
  }
  return s;
}

/** 死亡による交代フェーズの解決 */
function resolveDeathPhases(state: BattleState): BattleState {
  const s = state;
  const t1Active = getActive(s, 'team1');
  const t2Active = getActive(s, 'team2');

  const t1Dead = !t1Active.isAlive;
  const t2Dead = !t2Active.isAlive;

  if (t1Dead || t2Dead) {
    const battleFlags = s.phase !== 'selecting_next'
      ? {
          ...s.battleFlags,
          resumeTurn: s.currentTurn,
          resumeUsedSkill: s.usedSkillThisTurn,
        }
      : s.battleFlags;
    const sWithFlags = { ...s, battleFlags };

    // 両チーム死亡（相打ち）
    if (t1Dead && t2Dead) {
      // まず両チームの生存キャラを確認
      const t1HasNext = s.team1.characters.some((c) => c.isAlive);
      const t2HasNext = s.team2.characters.some((c) => c.isAlive);

      // どちらかのチームが全滅している場合は即座に勝利判定
      if (!t1HasNext && !t2HasNext) {
        return { ...sWithFlags, phase: 'finished', winner: null };
      }
      if (!t1HasNext) {
        return { ...sWithFlags, phase: 'finished', winner: 'team2' };
      }
      if (!t2HasNext) {
        return { ...sWithFlags, phase: 'finished', winner: 'team1' };
      }

      // 両チームに生存キャラがいる場合のみ選択フェーズへ
      const attacker = s.currentTurn;
      const defender = getEnemyTeam(attacker);
      // キューに [守備側, 攻撃側] を積み、守備側から選ばせる
      return {
        ...sWithFlags,
        phase: 'selecting_next',
        pendingSelectionNext: [defender, attacker],
        attackerAtDeath: attacker,
        currentTurn: defender,
      };
    } else {
      // 片方のみ死亡
      const deadTeam = t1Dead ? 'team1' : 'team2';
      const hasNext = s[deadTeam].characters.some((c) => c.isAlive);
      if (hasNext) {
        return {
          ...sWithFlags,
          phase: 'selecting_next',
          currentTurn: deadTeam,
          pendingSelectionNext: [],
        };
      } else {
        const winner = getEnemyTeam(deadTeam);
        return { ...sWithFlags, phase: 'finished', winner };
      }
    }
  }
  return s;
}

function processWinCheck(state: BattleState): BattleState {
  const team1Alive = state.team1.characters.some((c) => c.isAlive);
  const team2Alive = state.team2.characters.some((c) => c.isAlive);

  if (!team1Alive && !team2Alive) {
    return { ...state, phase: 'finished', winner: null };
  }
  if (!team1Alive) {
    return addLog(
      { ...state, phase: 'finished', winner: 'team2' },
      'チーム2の勝利！'
    );
  }
  if (!team2Alive) {
    return addLog(
      { ...state, phase: 'finished', winner: 'team1' },
      'チーム1の勝利！'
    );
  }
  return state;
}



// ============================================================
// ターン終了処理
// ============================================================

function applyDoTs(state: BattleState): BattleState {
  let s = state;
  for (const team of ['team1', 'team2'] as Team[]) {
    const active = getActive(s, team);
    if (!active.isAlive) continue;

    const dots = active.effects.filter(e => e.category === 'dot');
    for (const dot of dots) {
      const dmg = calcDoTDamage(dot, active);
      s = updateChar(s, team, active.id, (c) => {
        let newEffects = c.effects;
        if (dot.id === 'burn') {
          newEffects = c.effects
            .map(e => {
              if (e.id === 'burn') {
                return { ...e, value: Math.floor(e.value / 2) };
              }
              return e;
            })
            .filter(e => e.id !== 'burn' || e.value > 0);
        }
        return {
          ...c,
          hp: Math.max(0, c.hp - dmg),
          effects: newEffects,
        };
      });
      s = addLog(s, `${active.name}が「${dot.name}」で${dmg}ダメージ`);
      s = triggerPassives(s, 'on_damage_received', { targetCharId: active.id });
    }
  }
  return s;
}

function applyRegens(state: BattleState): BattleState {
  let s = state;
  for (const team of ['team1', 'team2'] as Team[]) {
    const active = getActive(s, team);
    if (!active.isAlive) continue;

    const regens = active.effects.filter(e => e.category === 'regen');
    for (const regen of regens) {
      const heal = Math.round(regen.value);
      s = updateChar(s, team, active.id, (c) => ({
        ...c,
        hp: Math.min(c.maxHp, c.hp + heal),
      }));
      s = addLog(s, `${active.name}が「${regen.name}」で${heal}回復`);
    }
  }
  return s;
}

function decrementBuffsAndDebuffs(state: BattleState): BattleState {
  let s = state;
  const team = state.currentTurn; // 行動を終えたチームのみ
  for (const char of s[team].characters) {
    if (!char.isAlive) continue;
    s = updateChar(s, team, char.id, (c) => tickEffects(c));
  }
  return s;
}



function switchTurn(state: BattleState): BattleState {
  // 優先度が変化している場合はresolveTurnOrderを呼ぶ
  if (state.battleFlags.priorityChanged) {
    const p1 = getActive(state, 'team1').priority;
    const p2 = getActive(state, 'team2').priority;
    if (p1 === p2) {
      // 同値の場合はトグル
      const next: Team = state.currentTurn === 'team1' ? 'team2' : 'team1';
      return { ...state, currentTurn: next, turn: state.turn + 1 };
    }
    return { ...state, currentTurn: p1 > p2 ? 'team1' : 'team2', turn: state.turn + 1 };
  }

  // 優先度が変化していない場合は初期の順序を維持（トグル）
  const next: Team = state.currentTurn === 'team1' ? 'team2' : 'team1';
  return { ...state, currentTurn: next, turn: state.turn + 1 };
}

export function processEndTurn(state: BattleState): BattleState {
  let s = state;

  // 1. on_turn_end パッシブ（生存キャラのみ） - 死の宣告判定はここで行われる
  s = triggerPassives(s, 'on_turn_end');

  if (s.phase === 'selecting_next') {
    return s;
  }

  // スキル使用回数と took_damage フラグのクリア
  for (const team of ['team1', 'team2'] as Team[]) {
    for (const char of s[team].characters) {
      s = updateChar(s, team, char.id, c => {
        const bf = { ...c.battleFlags };
        delete bf.took_damage_this_turn;
        return { ...c, battleFlags: bf, skillUsagePerTurn: {} };
      });
    }
  }

  // 2. DoT適用
  s = applyDoTs(s);

  // 3. DoTによる on_damage_received
  // （applyDoTs内で発火済み）

  // 4. 死亡判定
  s = processDeathCheck(s);

  // 5. 勝利判定
  s = processWinCheck(s);
  if (s.phase === 'finished') return s;

  // 6. リジェネ適用
  s = applyRegens(s);

  // 7. バフ・デバフ持続ターン減算
  s = decrementBuffsAndDebuffs(s);

  // 8. next_turn派生スキル昇格
  s = promoteNextTurnUnlocks(s);

  // 9. same_turn派生スキルクリア
  s = clearSameTurnUnlocks(s);

  // 10. ターン交代
  s = switchTurn(s);

  // 12. コスト付与
  const { carryOver } = runCostCarry(s, s.remainingCost, s.currentTurn);
  s = { ...s, remainingCost: COST_PER_TURN + carryOver };

  // 13. on_cost_gained
  s = triggerPassives(s, 'on_cost_gained');

  // 14. on_turn_start
  s = triggerPassives(s, 'on_turn_start');

  // 15. always系パッシブ再評価
  s = evaluateAlwaysPassives(s);

  s = { ...s, usedSkillThisTurn: false };

  // 最後に死亡による交代フェーズ (DoTやパッシブで死んだ場合の解決)
  s = resolveDeathPhases(s);

  return s;
}

// ============================================================
// 先頭キャラ選択・交代
// ============================================================

function processSelectFirst(
  state: BattleState,
  actorTeam: Team,
  characterIndex: number
): BattleState {
  // 選択されたキャラが生存しているか確認
  const selectedChar = state[actorTeam].characters[characterIndex];
  if (!selectedChar || !selectedChar.isAlive) {
    throw new Error('選択されたキャラは生存していません');
  }

  let s = {
    ...state,
    [actorTeam]: {
      ...state[actorTeam],
      activeIndex: characterIndex,
      characters: state[actorTeam].characters.map((c, i) => ({
        ...c,
        isActive: i === characterIndex,
      })),
    },
  };
  s = triggerPassives(s, 'on_switch_in');

  // 両者が選択完了したらバトル開始
  const team1Ready = s.team1.characters.some((c) => c.isActive);
  const team2Ready = s.team2.characters.some((c) => c.isActive);
  if (team1Ready && team2Ready) {
    // コスト付与・ターン開始
    s = { ...s, phase: 'action', remainingCost: COST_PER_TURN };
    s = triggerPassives(s, 'on_turn_start');
    s = evaluateAlwaysPassives(s);
    s = addLog(s, `ターン${s.turn + 1}開始 — ${s.currentTurn}の行動`);
  }
  return s;
}

function processSwitchAndEndTurn(
  state: BattleState,
  actorTeam: Team,
  characterIndex: number
): BattleState {
  // on_switch_out 発火（敵陣突破バフのpending登録など）
  let s = triggerPassives(state, 'on_switch_out');

  // 更新後のステートから元のキャラを取得（battleFlagsの更新を拾うため）
  const prevActive = getActive(s, actorTeam);
  const pendingBreakthrough = prevActive.battleFlags['pending_breakthrough'] as number | undefined;

  // activeIndex 更新
  s = {
    ...s,
    [actorTeam]: {
      ...s[actorTeam],
      activeIndex: characterIndex,
      characters: s[actorTeam].characters.map((c, i) => ({
        ...c,
        isActive: i === characterIndex,
      })),
    },
  };

  // 敵陣突破バフを次のキャラに付与
  if (pendingBreakthrough && pendingBreakthrough > 0) {
    // 元のキャラのフラグを掃除
    s = updateChar(s, actorTeam, prevActive.id, (c) => {
      const newFlags = { ...c.battleFlags };
      delete newFlags.pending_breakthrough;
      return { ...c, battleFlags: newFlags };
    });

    const newActive = getActive(s, actorTeam);
    s = updateChar(s, actorTeam, newActive.id, (c) => ({
      ...c,
      effects: [
        ...c.effects.filter((e) => e.id !== 'enemy_breakthrough'),
        {
          id: 'enemy_breakthrough',
          name: '敵陣突破',
          category: 'stat',
          stat: 'atk',
          value: pendingBreakthrough * 0.1,
          mode: 'mul' as const,
          isStackable: false,
          turnsRemaining: -1,
          currentStacks: 1,
        },
      ],
    }));
    s = addLog(s, `${newActive.name}に「敵陣突破」バフ(威力:${pendingBreakthrough})を付与`);

    // 7以上なら優先度+999（必ず先行）
    if (pendingBreakthrough >= 7) {
      s = updateChar(s, actorTeam, newActive.id, (c) => ({
        ...c,
        priority: c.priority + 999,
      }));
    }
  }

  s = triggerPassives(s, 'on_switch_in');
  s = triggerPassives(s, 'on_ally_switch');
  s = addLog(s, `${prevActive.name} → ${getActive(s, actorTeam).name}に交代`);

  // 交代後ターン終了
  return processEndTurn(s);
}

function processSelectNext(
  state: BattleState,
  actorTeam: Team,
  characterIndex: number
): BattleState {
  // 選択されたキャラが生存しているか確認
  const selectedChar = state[actorTeam].characters[characterIndex];
  if (!selectedChar || !selectedChar.isAlive) {
    // 生存していないキャラを選択した場合はエラー
    throw new Error('選択されたキャラは生存していません');
  }

  let s: BattleState = {
    ...state,
    [actorTeam]: {
      ...state[actorTeam],
      activeIndex: characterIndex,
      characters: state[actorTeam].characters.map((c, i) => ({
        ...c,
        isActive: i === characterIndex,
      })),
    },
  };

  // 敵陣突破バフのpending処理
  const prevActive = state[actorTeam].characters[state[actorTeam].activeIndex];
  const pendingBreakthrough = prevActive?.battleFlags['pending_breakthrough'] as number | undefined;
  // 敵陣突破バフを次のキャラに付与
  if (pendingBreakthrough && pendingBreakthrough > 0) {
    const newActive = getActive(s, actorTeam);
    s = updateChar(s, actorTeam, newActive.id, (c) => ({
      ...c,
      effects: [
        ...c.effects.filter((e) => e.id !== 'enemy_breakthrough'),
        {
          id: 'enemy_breakthrough',
          name: '敵陣突破',
          category: 'stat',
          stat: 'atk',
          value: pendingBreakthrough * 0.1,
          mode: 'mul',
          isStackable: false,
          turnsRemaining: -1,
          currentStacks: 1,
        },
      ],
    }));
  }

  // キューのチェック
  if (s.pendingSelectionNext && s.pendingSelectionNext.length > 0) {
    const nextInQueue = s.pendingSelectionNext[0];
    const remainingQueue = s.pendingSelectionNext.slice(1);
    return {
      ...s,
      phase: 'selecting_next',
      currentTurn: nextInQueue,
      pendingSelectionNext: remainingQueue,
    };
  }

  // キューが空ならバトル再開
  const resumeTurn = s.battleFlags['resumeTurn'] as Team | undefined;
  const resumeUsedSkill = s.battleFlags['resumeUsedSkill'] as boolean | undefined;

  const finalTurn = resumeTurn ?? (s.attackerAtDeath ? getEnemyTeam(s.attackerAtDeath) : getEnemyTeam(actorTeam));
  const finalUsedSkill = resumeUsedSkill ?? true;

  const newFlags = { ...s.battleFlags };
  delete newFlags['resumeTurn'];
  delete newFlags['resumeUsedSkill'];

  s = {
    ...s,
    phase: 'action',
    currentTurn: finalTurn,
    attackerAtDeath: undefined,
    usedSkillThisTurn: finalUsedSkill,
    battleFlags: newFlags,
  };

  s = triggerPassives(s, 'on_switch_in');
  s = triggerPassives(s, 'on_turn_start');
  s = evaluateAlwaysPassives(s);
  s = addLog(s, `${getActive(s, actorTeam).name}が登場！`);
  return s;
}

// ============================================================
// メインエントリ: processAction
// ============================================================

export function processAction(
  state: BattleState,
  action: PlayerAction,
  actorTeam: Team
): BattleState {
  if (state.phase === 'finished') return state;

  switch (action.type) {
    case 'select_first': {
      return processSelectFirst(state, actorTeam, action.characterIndex);
    }

    case 'use_skill': {
      const { skillId } = action;
      const active = getActive(state, actorTeam);

      // 使用不可チェック
      if (active.disabledSkills.includes(skillId)) {
        throw new Error(`スキル「${skillId}」はこの戦闘中使用不可`);
      }

      // コスト取得
      const allData = getAllCharacterData();
      const charData = allData.find((d) => d.id === active.id);
      if (!charData) throw new Error(`Character data not found: ${active.id}`);
      const allSkills = [...charData.skills, ...charData.derived_skills];
      const skillData = allSkills.find((s) => s.id === skillId);
      if (!skillData) throw new Error(`Unknown skill: ${skillId}`);

      if (skillData.cost > state.remainingCost) {
        throw new Error('コスト不足');
      }

      // 派生スキル利用可能チェック
      const isDerived = charData.derived_skills.some((s) => s.id === skillId);
      if (isDerived) {
        const unlocked = active.unlockedDerivedSkills.find(
          (u) => u.skillId === skillId
        );
        if (!unlocked || unlocked.available === 'next_turn') throw new Error('このスキルはまだ解放されていない');
      }

      const handler = getSkillHandler(skillId);
      if (!handler) throw new Error(`No handler for skill: ${skillId}`);

      let s = handler(state, actorTeam);

      // ダメージ発生検知とフラグ付与
      for (const team of ['team1', 'team2'] as Team[]) {
        for (const char of s[team].characters) {
          const oldChar = state[team].characters.find(c => c.id === char.id);
          if (oldChar && char.hp < oldChar.hp) {
            const dmgDealt = oldChar.hp - char.hp;
            s = { ...s, battleFlags: { ...s.battleFlags, last_damage_dealt: dmgDealt } };
            s = updateChar(s, team, char.id, c => {
              const bf = { ...c.battleFlags };
              delete bf.damage_increase_percent;
              return {
                ...c,
                battleFlags: { ...bf, took_damage_this_turn: true }
              };
            });
            const activeId = getActive(s, actorTeam).id;
            s = updateChar(s, actorTeam, activeId, c => ({
              ...c,
              battleFlags: { ...c.battleFlags, dealt_damage_this_turn: true }
            }));
            s = triggerPassives(s, 'on_damage_received', { targetCharId: char.id, damage: dmgDealt });
            
            // on_hp_thresholdトリガーを発火（HPが閾値を下回った場合）
            if (char.hp <= 500 && oldChar.hp > 500) {
              s = triggerPassives(s, 'on_hp_threshold', { targetCharId: char.id, damage: dmgDealt });
            }
            
            // on_ally_skill_damageトリガーを発火（攻撃側と異なるチームのキャラがダメージを受けた場合）
            if (team !== actorTeam) {
              s = triggerPassives(s, 'on_ally_skill_damage', { targetCharId: char.id, damage: dmgDealt });
            }
          }
        }
      }

      s = {
        ...s,
        remainingCost: s.remainingCost - skillData.cost,
        usedSkillThisTurn: true,
      };

      // 派生スキルの場合は使用後にリストから削除（消費）
      if (isDerived) {
        s = updateChar(s, actorTeam, active.id, (c) => ({
          ...c,
          unlockedDerivedSkills: c.unlockedDerivedSkills.filter((u) => u.skillId !== skillId),
        }));
      }

      s = processUnlocks(s, skillId, actorTeam);
      s = triggerPassives(s, 'on_skill_used');
      s = triggerPassives(s, 'on_enemy_skill_used');
      s = evaluateAlwaysPassives(s);

      s = resolveDeathPhases(s);
      if (s.phase === 'selecting_next' || s.phase === 'finished') {
        return s;
      }
      return s;
    }

    case 'switch_character': {
      if (state.usedSkillThisTurn) {
        throw new Error('スキル使用後は交代不可');
      }
      return processSwitchAndEndTurn(state, actorTeam, action.characterIndex);
    }

    case 'end_turn': {
      return processEndTurn(state);
    }

    case 'select_next': {
      return processSelectNext(state, actorTeam, action.characterIndex);
    }
  }
}
