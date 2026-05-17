import type {
  BattleState,
  Team,
  CharacterState,
  SkillHandler,
  PassiveHandler,
} from '../../types';
import { calcDamage } from '../damage';
import { applyEffect } from '../effects';

// ============================================================
// ユーティリティ
// ============================================================
function getActive(state: BattleState, team: Team): CharacterState {
  return state[team].characters[state[team].activeIndex];
}

function getEnemy(state: BattleState, actorTeam: Team): CharacterState {
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  return state[enemyTeam].characters[state[enemyTeam].activeIndex];
}

function updateChar(
  state: BattleState,
  team: Team,
  charId: string,
  updater: (c: CharacterState) => CharacterState
): BattleState {
  const teamState = state[team];
  return {
    ...state,
    [team]: {
      ...teamState,
      characters: teamState.characters.map((c) =>
        c.id === charId ? updater(c) : c
      ),
    },
  };
}

function updateActiveChar(
  state: BattleState,
  team: Team,
  updater: (c: CharacterState) => CharacterState
): BattleState {
  const active = getActive(state, team);
  return updateChar(state, team, active.id, updater);
}

function addLog(state: BattleState, description: string): BattleState {
  const entry = { turn: state.turn, actor: state.currentTurn, description };
  const log = [...state.log, entry].slice(-50);
  return { ...state, log };
}

function getResource(char: CharacterState, id: string): number {
  return char.customResources.find((r) => r.id === id)?.value ?? 0;
}

function setResource(
  char: CharacterState,
  id: string,
  delta: number,
  absolute?: boolean
): CharacterState {
  return {
    ...char,
    customResources: char.customResources.map((r) => {
      if (r.id !== id) return r;
      const newVal = absolute ? delta : Math.min(r.max, Math.max(r.min, r.value + delta));
      return { ...r, value: newVal };
    }),
  };
}

// ============================================================
// スキルハンドラ
// ============================================================

/** S1: 光波符 */
const s1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);

  const dmg = calcDamage(actor, enemy, { multiplier: 0.65 });
  
  let s = state;
  const enemyTeam = actorTeam === 'team1' ? 'team2' : 'team1';
  s = updateActiveChar(s, enemyTeam, (c) => ({ ...c, hp: Math.max(0, c.hp - dmg) }));
  
  // 護符+1
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'talisman', 1));
  
  s = addLog(s, `${actor.name}の「光波符」→ ${enemy.name}に${dmg}ダメージ、護符を1枚獲得`);
  return s;
};

/** S2: 五行加護陣 */
const s2: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);

  const dmg = calcDamage(actor, enemy, { multiplier: 1.0 });
  
  let s = state;
  const enemyTeam = actorTeam === 'team1' ? 'team2' : 'team1';
  s = updateActiveChar(s, enemyTeam, (c) => ({ ...c, hp: Math.max(0, c.hp - dmg) }));
  
  // 自分にダメージ軽減付与
  s = updateActiveChar(s, actorTeam, (c) => {
    let nc = applyEffect(c, {
      id: 'shin_five_elements_reduction',
      name: '五行の結界',
      category: 'special',
      value: 0.15,
      mode: 'add',
      isStackable: false,
      turnsRemaining: 1,
    });
    // 護符+3
    nc = setResource(nc, 'talisman', 3);
    return nc;
  });
  
  s = addLog(s, `${actor.name}の「五行加護陣」→ ${enemy.name}に${dmg}ダメージ、結界を展開し護符を3枚獲得`);
  return s;
};

/** S3: 聚気法 */
const s3: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);

  let s = state;
  s = updateActiveChar(s, actorTeam, (c) => {
    // 防御力15%上昇
    let nc = applyEffect(c, {
      id: 'shin_gathering_def_up',
      name: '精神統一',
      category: 'stat',
      stat: 'def',
      value: 0.15,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 1,
    });
    // 護符+2
    nc = setResource(nc, 'talisman', 2);
    return nc;
  });
  
  s = addLog(s, `${actor.name}の「聚気法」→ 精神を統一し防御力を強化、護符を2枚獲得`);
  return s;
};

/** S4: 帰命頂礼・極光破 */
const s4: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const talismans = getResource(actor, 'talisman');

  // 発動条件チェック
  if (talismans < 3) {
    return addLog(state, `護符が足りないため「帰命頂礼・極光破」を発動できない！`);
  }

  const dmg = calcDamage(actor, enemy, { multiplier: 1.5 });
  
  let s = state;
  const enemyTeam = actorTeam === 'team1' ? 'team2' : 'team1';
  s = updateActiveChar(s, enemyTeam, (c) => ({ ...c, hp: Math.max(0, c.hp - dmg) }));
  
  // 味方全体を130回復
  for (const char of s[actorTeam].characters) {
    if (char.isAlive) {
      s = updateChar(s, actorTeam, char.id, (c) => ({
        ...c,
        hp: Math.min(c.maxHp, c.hp + 130)
      }));
    }
  }
  
  // 護符を全消費
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'talisman', 0, true));
  
  s = addLog(s, `${actor.name}の奥義「帰命頂礼・極光破」！ ${enemy.name}に${dmg}ダメージ、味方全員のHPを130回復`);
  return s;
};

// ============================================================
// パッシブハンドラ
// ============================================================

/** 符術の陣: 護符の数に応じて味方ATKアップ */
const passive_buff: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const shin = state[ownerTeam].characters.find(c => c.id === ownerCharId);
  if (!shin || !shin.isAlive) return state;

  const talismans = getResource(shin, 'talisman');
  let buffValue = 0;
  if (talismans >= 6) buffValue = 0.15;
  else if (talismans >= 4) buffValue = 0.1;
  else if (talismans >= 2) buffValue = 0.05;

  let s = state;
  for (const char of s[ownerTeam].characters) {
    if (char.isAlive) {
      s = updateChar(s, ownerTeam, char.id, (c) => {
        const nc = { ...c };

        // 自身の場合、奥義の発動条件チェック
        if (c.id === ownerCharId) {
          if (talismans < 3) {
            if (!nc.disabledSkills.includes('char_shin_s4_aurora')) {
              nc.disabledSkills = [...nc.disabledSkills, 'char_shin_s4_aurora'];
            }
          } else {
            nc.disabledSkills = nc.disabledSkills.filter(id => id !== 'char_shin_s4_aurora');
          }
        }

        // 既存のバフを除去して新しい値を適用
        const otherEffects = c.effects.filter(e => e.id !== 'shin_talisman_atk_buff');
        if (buffValue === 0) return { ...nc, effects: otherEffects };
        
        return {
          ...nc,
          effects: [
            ...otherEffects,
            {
              id: 'shin_talisman_atk_buff',
              name: '符術の陣',
              category: 'stat',
              stat: 'atk',
              value: buffValue,
              mode: 'mul',
              isStackable: false,
              currentStacks: 1,
              turnsRemaining: 1, // evaluateAlwaysPassivesで毎ターン更新される想定
            }
          ]
        };
      });
    }
  }
  return s;
};

/** 神仙の加護: HP500以下で一度だけ護符獲得 */
const passive_protection: PassiveHandler = (state, ownerTeam, ownerCharId, context) => {
  const shin = state[ownerTeam].characters.find(c => c.id === ownerCharId);
  if (!shin || !shin.isAlive || shin.hp > 500 || shin.battleFlags.divine_protection_used) return state;

  // ダメージを受けた時のトリガーの場合、自身がダメージを受けているかチェック
  if (context?.targetCharId && context.targetCharId !== ownerCharId) return state;

  let s = updateChar(state, ownerTeam, ownerCharId, (c) => {
    let nc = setResource(c, 'talisman', 3);
    nc = {
      ...nc,
      battleFlags: { ...nc.battleFlags, divine_protection_used: true }
    };
    return nc;
  });

  s = addLog(s, `${shin.name}の「神仙の加護」発動！ 大気から霊力を吸収し、護符を3枚獲得`);
  return s;
};

/** 後方での調息: 控えで2ターンごとに護符+1 */
const passive_meditation: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const team = state[ownerTeam];
  const shinIndex = team.characters.findIndex(c => c.id === ownerCharId);
  if (shinIndex === -1) return state;
  
  const shin = team.characters[shinIndex];
  if (!shin.isAlive || team.activeIndex === shinIndex) {
    // 表に出ている間はカウントリセット
    if (shin.battleFlags.meditation_count) {
       return updateChar(state, ownerTeam, ownerCharId, (c) => ({
         ...c,
         battleFlags: { ...c.battleFlags, meditation_count: 0 }
       }));
    }
    return state;
  }

  // ターン終了時に自分のチームの行動が終わった時のみカウント（簡易化のためstate.currentTurnチェック）
  if (state.currentTurn !== ownerTeam) return state;

  const count = (shin.battleFlags.meditation_count as number ?? 0) + 1;
  let s = state;
  if (count >= 2) {
    s = updateChar(s, ownerTeam, ownerCharId, (c) => {
      let nc = setResource(c, 'talisman', 1);
      nc = { ...nc, battleFlags: { ...nc.battleFlags, meditation_count: 0 } };
      return nc;
    });
    s = addLog(s, `${shin.name}の「後方での調息」→ 護符を1枚獲得`);
  } else {
    s = updateChar(s, ownerTeam, ownerCharId, (c) => ({
      ...c,
      battleFlags: { ...c.battleFlags, meditation_count: count }
    }));
  }

  return s;
};

// ============================================================
// エクスポート
// ============================================================
export const char_shin_skill_handlers: Record<string, SkillHandler> = {
  char_shin_s1_light_wave: s1,
  char_shin_s2_five_elements: s2,
  char_shin_s3_gathering: s3,
  char_shin_s4_aurora: s4,
};

export const char_shin_passive_handlers: Record<string, PassiveHandler> = {
  char_shin_passive_buff_passive_always: passive_buff,
  char_shin_passive_protection_on_hp_threshold: passive_protection,
  char_shin_passive_protection_on_damage_received: passive_protection,
  char_shin_passive_meditation_on_turn_end: passive_meditation,
};
