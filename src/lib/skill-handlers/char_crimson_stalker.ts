import type {
  BattleState,
  Team,
  CharacterState,
  SkillHandler,
  PassiveHandler,
} from '../../types';
import { calcDamage } from '../damage';
import { applyEffect } from '../effects';
import { triggerPassives } from '../passives';

// ============================================================
// ユーティリティ
// ============================================================

function getActive(state: BattleState, team: Team): CharacterState {
  return state[team].characters[state[team].activeIndex];
}

function getEnemy(state: BattleState, actorTeam: Team): CharacterState {
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  return getActive(state, enemyTeam);
}

function getResource(char: CharacterState, id: string): number {
  const res = char.customResources.find((r) => r.id === id);
  return res?.value ?? 0;
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

function updateActiveChar(
  state: BattleState,
  team: Team,
  updater: (c: CharacterState) => CharacterState
): BattleState {
  const teamState = state[team];
  return {
    ...state,
    [team]: {
      ...teamState,
      characters: teamState.characters.map((c, i) =>
        i === teamState.activeIndex ? updater(c) : c
      ),
    },
  };
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

function addLog(
  state: BattleState,
  description: string,
  actor: 'team1' | 'team2' | 'system' = 'system'
): BattleState {
  const entry = { turn: state.turn, actor, description };
  return { ...state, log: [...state.log, entry].slice(-50) };
}

function dealDamage(
  state: BattleState,
  actorTeam: Team,
  damage: number
): BattleState {
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  const enemy = getActive(state, enemyTeam);
  const newHp = Math.max(0, enemy.hp - damage);
  return updateActiveChar(state, enemyTeam, (c) => ({ ...c, hp: newHp }));
}

function dealDamageToAll(
  state: BattleState,
  actorTeam: Team,
  damage: number
): BattleState {
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  const allyTeam: Team = actorTeam;
  
  let s = state;
  
  // 敵チーム全員にダメージ
  s = {
    ...s,
    [enemyTeam]: {
      ...s[enemyTeam],
      characters: s[enemyTeam].characters.map(c => ({
        ...c,
        hp: Math.max(0, c.hp - damage),
        isAlive: c.hp - damage > 0
      }))
    }
  };
  
  // 味方チーム全員（自分以外）にダメージ
  s = {
    ...s,
    [allyTeam]: {
      ...s[allyTeam],
      characters: s[allyTeam].characters.map(c => {
        if (c.id === getActive(s, actorTeam).id) return c; // 自分は除外
        return {
          ...c,
          hp: Math.max(0, c.hp - damage),
          isAlive: c.hp - damage > 0
        };
      })
    }
  };
  
  return s;
}

// 宿敵マークの対象を取得
function getNemesisTargetId(char: CharacterState): string | null {
  return (char.battleFlags.nemesis_mark_target as string) || null;
}

// 宿敵マークの対象を設定
function setNemesisTarget(char: CharacterState, targetId: string): CharacterState {
  // customResources の数値を1にする（UI表示用など。0より大きければ何でも良い）
  const charWithResource = setResource(char, 'nemesis_mark_target', 1, true);
  return {
    ...charWithResource,
    battleFlags: {
      ...charWithResource.battleFlags,
      nemesis_mark_target: targetId,
    },
  };
}

// 狂乱状態かどうか
function isInFrenzy(char: CharacterState): boolean {
  return getResource(char, 'frenzy_counter') > 0;
}

// ============================================================
// スキルハンドラ
// ============================================================

/** S1: 追跡の銀弾 */
const crimson_s1_silver_bullet: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  
  // 狂乱状態なら使用不可
  if (isInFrenzy(actor)) {
    return state;
  }
  
  // 宿敵マークの確認
  const nemesisTargetId = getNemesisTargetId(actor);
  let multiplier = 1.5;
  
  if (nemesisTargetId === enemy.id) {
    multiplier *= 1.25; // 執着の照準
  } else if (nemesisTargetId !== null) {
    multiplier *= 0.5; // 宿敵マークなしの敵への攻撃は50%低下
  }
  
  const dmg = calcDamage(actor, enemy, { multiplier });
  let s = dealDamage(state, actorTeam, dmg);
  
  s = addLog(s, `${actor.name}の「追跡の銀弾」→ ${enemy.name}に${dmg}ダメージ`);
  return s;
};

/** S2: 報復の大鎌 */
const crimson_s2_scythe: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  
  // 狂乱状態なら使用不可
  if (isInFrenzy(actor)) {
    return state;
  }
  
  // 宿敵マークの確認
  const nemesisTargetId = getNemesisTargetId(actor);
  let multiplier = 1.9;
  
  if (nemesisTargetId === enemy.id) {
    multiplier *= 1.25; // 執着の照準
  } else if (nemesisTargetId !== null) {
    multiplier *= 0.5; // 宿敵マークなしの敵への攻撃は50%低下
  }
  
  const dmg = calcDamage(actor, enemy, { multiplier });
  let s = dealDamage(state, actorTeam, dmg);
  
  s = addLog(s, `${actor.name}の「報復の大鎌」→ ${enemy.name}に${dmg}ダメージ`);
  return s;
};

/** S3: 復讐の研磨 */
const crimson_s3_polish: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  
  // 狂乱状態なら使用不可
  if (isInFrenzy(actor)) {
    return state;
  }
  
  let s = updateActiveChar(state, actorTeam, (c) =>
    applyEffect(c, {
      id: 'crimson_s3_atk_up',
      name: '攻撃力上昇',
      category: 'stat',
      stat: 'atk',
      value: 0.15,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 1,
    })
  );
  
  s = addLog(s, `${actor.name}の「復讐の研磨」→ 次のターンATK15%上昇`);
  return s;
};

export const char_crimson_stalker_skill_handlers: Record<string, SkillHandler> = {
  char_crimson_s1_silver_bullet: crimson_s1_silver_bullet,
  char_crimson_s2_scythe: crimson_s2_scythe,
  char_crimson_s3_polish: crimson_s3_polish,
};

// ============================================================
// パッシブハンドラ
// ============================================================

/** on_battle_start: 不倶戴天のマーク */
const passive_mark_on_battle_start: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char) return state;
  
  const enemyTeam: Team = ownerTeam === 'team1' ? 'team2' : 'team1';
  const enemyChars = state[enemyTeam].characters.filter(c => c.isAlive);
  
  if (enemyChars.length === 0) return state;
  
  // ランダムな敵1人を選択
  const randomIndex = Math.floor(Math.random() * enemyChars.length);
  const targetEnemy = enemyChars[randomIndex];
  
  let s = updateChar(state, ownerTeam, ownerCharId, (c) => setNemesisTarget(c, targetEnemy.id));
  
  s = addLog(s, `${char.name}の「不倶戴天のマーク」発動 → ${targetEnemy.name}に宿敵マークを付与`);
  return s;
};

/** passive_while_active: 執着の照準 */
const passive_damage_bonus: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;
  
  const nemesisTargetId = getNemesisTargetId(char);
  if (!nemesisTargetId) return state;
  
  // ダメージボーナスはスキルハンドラ内で適用
  return state;
};

/** on_ally_skill_damage: 私の視界に入るな */
const passive_counter_attack: PassiveHandler = (state, ownerTeam, ownerCharId, context) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;
  
  // 狂乱状態なら発動しない
  if (isInFrenzy(char)) return state;
  
  const counterCount = getResource(char, 'counter_attack_count');
  if (counterCount >= 2) return state; // 1ターン2回まで
  
  // 宿敵マークの対象がダメージを受けたか確認
  const nemesisTargetId = getNemesisTargetId(char);
  if (!nemesisTargetId) return state;
  
  const targetCharId = context?.targetCharId;
  if (targetCharId !== nemesisTargetId) return state;
  
  // 攻撃者が自分以外の味方であるか確認
  const attackerId = getActive(state, ownerTeam).id;
  if (attackerId === ownerCharId) return state; // 自分の攻撃なら発動しない
  
  // カウンターアタックを実行
  const damage = Math.floor(char.atk * 1.0);
  let s = updateChar(state, ownerTeam, attackerId, (c) => ({
    ...c,
    hp: Math.max(0, c.hp - damage)
  }));
  
  // カウンター回数を増加
  s = updateChar(s, ownerTeam, ownerCharId, (c) => setResource(c, 'counter_attack_count', counterCount + 1));
  
  s = addLog(s, `${char.name}の「私の視界に入るな」発動 → ${getActive(state, ownerTeam).name}に${damage}ダメージ`);
  return s;
};

/** on_turn_start: カウンターアタック回数リセット */
const passive_reset_counter_count: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char) return state;
  
  return updateChar(state, ownerTeam, ownerCharId, (c) => setResource(c, 'counter_attack_count', 0, true));
};

/** on_nemesis_death_by_ally: 終焉の狂乱 */
const passive_frenzy_trigger: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char) return state;
  
  // 既に狂乱状態なら発動しない
  if (isInFrenzy(char)) return state;
  
  // 宿敵マークの対象が死亡したか確認
  const nemesisTargetId = getNemesisTargetId(char);
  if (!nemesisTargetId) return state;
  
  const enemyTeam: Team = ownerTeam === 'team1' ? 'team2' : 'team1';
  const targetEnemy = state[enemyTeam].characters.find(c => c.id === nemesisTargetId);
  
  if (targetEnemy && targetEnemy.isAlive) return state; // まだ生きている
  
  // 他の味方によって撃破されたか？
  // 自分の攻撃で倒した場合は発動しない
  const activeChar = getActive(state, ownerTeam);
  if (state.currentTurn === ownerTeam && activeChar.id === ownerCharId) {
    return state; // 自分が倒した
  }
  
  // 宿敵が死亡したので狂乱発動
  let s = state;
  
  if (!char.isActive) {
    // 控えにいる場合、強制出場
    const allyTeam = ownerTeam;
    
    // スイッチ処理
    s = triggerPassives(s, 'on_switch_out');
    
    // 深紅の追跡者のインデックスを探す
    const stalkerIndex = s[allyTeam].characters.findIndex(c => c.id === ownerCharId);
    if (stalkerIndex === -1) return s;
    
    s = {
      ...s,
      [allyTeam]: {
        ...s[allyTeam],
        activeIndex: stalkerIndex,
        characters: s[allyTeam].characters.map((c, i) => ({
          ...c,
          isActive: i === stalkerIndex
        }))
      }
    };
    
    s = triggerPassives(s, 'on_switch_in');
    s = addLog(s, `${char.name}の「終焉の狂乱」発動 → 控えから強制出場！`);
  } else {
    s = addLog(s, `${char.name}の「終焉の狂乱」発動！`);
  }
  
  // 狂乱カウンターをセット
  s = updateChar(s, ownerTeam, ownerCharId, (c) => setResource(c, 'frenzy_counter', 2, true));
  
  return s;
};

/** on_turn_end: 狂乱の猛攻 */
const passive_frenzy_attack: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;
  
  let frenzyCounter = getResource(char, 'frenzy_counter');
  if (frenzyCounter === 0) return state; // 狂乱状態ではない
  
  let s = state;
  
  // 無差別広域攻撃
  const dmg = Math.floor(char.atk * 1.5);
  s = dealDamageToAll(s, ownerTeam, dmg);
  
  s = addLog(s, `${char.name}の「狂乱の猛攻」→ 敵味方全員に${dmg}ダメージ`);
  
  // カウンターを減らす
  frenzyCounter--;
  s = updateChar(s, ownerTeam, ownerCharId, (c) => setResource(c, 'frenzy_counter', frenzyCounter, true));
  
  // カウンターが0になったらショック死
  if (frenzyCounter === 0) {
    s = updateChar(s, ownerTeam, ownerCharId, (c) => ({
      ...c,
      hp: 0,
      isAlive: false
    }));
    s = addLog(s, `${char.name}は狂乱の果てにショック死した...`);
  }
  
  return s;
};

export const char_crimson_stalker_passive_handlers: Record<string, PassiveHandler> = {
  char_crimson_passive_mark_on_battle_start_on_battle_start: passive_mark_on_battle_start,
  char_crimson_passive_damage_bonus_passive_while_active: passive_damage_bonus,
  char_crimson_passive_counter_attack_on_ally_skill_damage: passive_counter_attack,
  char_crimson_passive_reset_counter_count_on_turn_start: passive_reset_counter_count,
  char_crimson_passive_frenzy_trigger_on_nemesis_death_by_ally: passive_frenzy_trigger,
  char_crimson_passive_frenzy_attack_on_turn_end: passive_frenzy_attack,
};
