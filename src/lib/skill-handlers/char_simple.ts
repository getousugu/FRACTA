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

function heal(state: BattleState, team: Team, amount: number): BattleState {
  const char = getActive(state, team);
  const newHp = Math.min(char.maxHp, char.hp + amount);
  return updateActiveChar(state, team, (c) => ({ ...c, hp: newHp }));
}

// ============================================================
// 戦士（炎の剣士）のスキルハンドラ
// ============================================================

/** S1: 通常攻撃 */
const fighter_s1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);

  const dmg = calcDamage(actor, enemy, { multiplier: 1.2 });

  let s = dealDamage(state, actorTeam, dmg);

  s = addLog(s, `${actor.name}の「通常攻撃」→ ${enemy.name}に${dmg}ダメージ`);
  return s;
};

/** S1派生: 連撃 */
const fighter_s1_d1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);

  const dmg1 = calcDamage(actor, enemy, { multiplier: 0.8 });
  const dmg2 = calcDamage(actor, enemy, { multiplier: 0.8 });

  let s = dealDamage(state, actorTeam, dmg1 + dmg2);

  s = addLog(s, `${actor.name}の「連撃」→ ${enemy.name}に${dmg1 + dmg2}ダメージ`);
  return s;
};

/** S2: 渾身の斬撃 */
const fighter_s2: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);

  const dmg = calcDamage(actor, enemy, { multiplier: 2.0 });

  let s = dealDamage(state, actorTeam, dmg);

  s = addLog(s, `${actor.name}の「渾身の斬撃」→ ${enemy.name}に${dmg}ダメージ`);
  return s;
};

/** S2派生: 致命の一撃 */
const fighter_s2_d1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);

  const dmg = calcDamage(actor, enemy, { multiplier: 2.5, piercing: true });

  let s = dealDamage(state, actorTeam, dmg);

  s = addLog(s, `${actor.name}の「致命の一撃」→ ${enemy.name}に${dmg}ダメージ（DEF無視）`);
  return s;
};

/** S3: 鉄壁の構え */
const fighter_s3: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);

  let s = updateActiveChar(state, actorTeam, (c) =>
    applyEffect(c, {
      id: 'fighter_s3_def_up',
      name: 'DEF上昇',
      category: 'stat',
      stat: 'def',
      value: 0.5,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 2,
    })
  );

  // 次のターンまで受けるダメージを30%軽減する
  s = updateActiveChar(s, actorTeam, (c) =>
    applyEffect(c, {
      id: 'fighter_s3_damage_reduce',
      name: '被ダメージ軽減',
      category: 'special',
      value: 0.3,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 1,
    })
  );

  s = addLog(s, `${actor.name}の「鉄壁の構え」→ DEF50%上昇（2ターン）、被ダメージ30%軽減（1ターン）`);
  return s;
};

export const char_fighter_skill_handlers: Record<string, SkillHandler> = {
  char_fighter_s1: fighter_s1,
  char_fighter_s1_d1: fighter_s1_d1,
  char_fighter_s2: fighter_s2,
  char_fighter_s2_d1: fighter_s2_d1,
  char_fighter_s3: fighter_s3,
};

// ============================================================
// 戦士（炎の剣士）のパッシブハンドラ
// ============================================================

/** on_turn_end: 反撃の意志 */
const fighter_passive_counter: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  // そのターンにダメージを受けたかチェック（battleFlagsで管理）
  const tookDamage = (char.battleFlags['took_damage_this_turn'] as boolean) ?? false;
  if (!tookDamage) return state;

  const enemyTeam: Team = ownerTeam === 'team1' ? 'team2' : 'team1';
  const enemy = getActive(state, enemyTeam);
  const actor = getActive(state, ownerTeam);
  const dmg = calcDamage(actor, enemy, { multiplier: 0.5 });

  let s = dealDamage(state, ownerTeam, dmg);
  s = addLog(s, `${actor.name}の「反撃の意志」発動 → ${enemy.name}に${dmg}反撃ダメージ`);
  
  // battleFlagsをリセット
  s = updateChar(s, ownerTeam, ownerCharId, (c) => ({
    ...c,
    battleFlags: {
      ...c.battleFlags,
      took_damage_this_turn: false,
    },
  }));

  return s;
};

const fighter_passive_berserk: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  const hpPercent = char.hp / char.maxHp;
  if (hpPercent > 0.5) {
    return updateChar(state, ownerTeam, ownerCharId, (c) => ({
      ...c,
      effects: c.effects.filter((e) => e.id !== 'fighter_berserk'),
    }));
  }

  // HP50%以下でATK+40%バフ
  return updateChar(state, ownerTeam, ownerCharId, (c) =>
    applyEffect(c, {
      id: 'fighter_berserk',
      name: '狂戦士',
      category: 'stat',
      stat: 'atk',
      value: 0.4,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: -1,
    })
  );
};

export const char_fighter_passive_handlers: Record<string, PassiveHandler> = {
  char_fighter_passive_counter_on_turn_end: fighter_passive_counter,
  char_fighter_passive_berserk_passive_while_active: fighter_passive_berserk,
};

// ============================================================
// 魔法使い（氷の魔導士）のスキルハンドラ
// ============================================================

/** S1: アイススパイク */
const mage_s1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);

  const dmg = calcDamage(actor, enemy, { multiplier: 0.9 });

  let s = dealDamage(state, actorTeam, dmg);
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'mana', 1));

  s = addLog(s, `${actor.name}の「アイススパイク」→ ${enemy.name}に${dmg}ダメージ、マナ+1`);
  return s;
};

/** S1派生: アイスストーム */
const mage_s1_d1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);

  const dmg1 = calcDamage(actor, enemy, { multiplier: 0.6 });
  const dmg2 = calcDamage(actor, enemy, { multiplier: 0.6 });

  let s = dealDamage(state, actorTeam, dmg1 + dmg2);
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'mana', 1));

  s = addLog(s, `${actor.name}の「アイスストーム」→ ${enemy.name}に${dmg1 + dmg2}ダメージ、マナ+1`);
  return s;
};

/** S2: フロストバリア */
const mage_s2: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);

  let s = updateActiveChar(state, actorTeam, (c) =>
    applyEffect(c, {
      id: 'mage_s2_def_up',
      name: 'DEF上昇',
      category: 'stat',
      stat: 'def',
      value: 0.3,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 2,
    })
  );
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'mana', 2));

  s = addLog(s, `${actor.name}の「フロストバリア」→ DEF30%上昇（2ターン）、マナ+2`);
  return s;
};

/** S2派生: 絶対零度 */
const mage_s2_d1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);

  const dmg = calcDamage(actor, enemy, { multiplier: 1.2 });

  let s = dealDamage(state, actorTeam, dmg);
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'mana', 2));

  // 相手のATKを2ターンの間15%低下させる
  s = updateActiveChar(s, actorTeam === 'team1' ? 'team2' : 'team1', (c) =>
    applyEffect(c, {
      id: 'mage_s2_d1_atk_down',
      name: 'ATK低下',
      category: 'stat',
      stat: 'atk',
      value: -0.15,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 2,
    })
  );

  s = addLog(s, `${actor.name}の「絶対零度」→ ${enemy.name}に${dmg}ダメージ、ATK15%低下（2ターン）、マナ+2`);
  return s;
};

/** S3: マナバースト */
const mage_s3: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const mana = getResource(actor, 'mana');

  if (mana <= 0) return state;

  const multiplier = 0.8 + mana * 0.15;
  const dmg = calcDamage(actor, enemy, { multiplier });

  let s = dealDamage(state, actorTeam, dmg);
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'mana', 0, true));

  s = addLog(s, `${actor.name}の「マナバースト」→ ${enemy.name}に${dmg}ダメージ、マナ全消費`);
  return s;
};

/** S4: ヒーリング */
const mage_s4: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const mana = getResource(actor, 'mana');

  if (mana < 2) return state;

  const healAmount = Math.floor(actor.maxHp * 0.3);

  let s = heal(state, actorTeam, healAmount);
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'mana', -2));

  s = addLog(s, `${actor.name}の「ヒーリング」→ ${healAmount}HP回復、マナ-2`);
  return s;
};

export const char_mage_skill_handlers: Record<string, SkillHandler> = {
  char_mage_s1: mage_s1,
  char_mage_s1_d1: mage_s1_d1,
  char_mage_s2: mage_s2,
  char_mage_s2_d1: mage_s2_d1,
  char_mage_s3: mage_s3,
  char_mage_s4: mage_s4,
};

// ============================================================
// 魔法使い（氷の魔導士）のパッシブハンドラ
// ============================================================

/** on_turn_start: 魔力回復 */
const mage_passive_mana_regen: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  const mana = getResource(char, 'mana');
  if (mana >= 10) return state;

  let s = updateChar(state, ownerTeam, ownerCharId, (c) => setResource(c, 'mana', 2));

  s = addLog(s, `${char.name}の「魔力回復」発動 → マナ+2`);
  return s;
};

/** passive_while_active: 魔力増幅 */
const mage_passive_mana_bonus: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  const mana = getResource(char, 'mana');
  if (mana <= 0) {
    return updateChar(state, ownerTeam, ownerCharId, (c) => ({
      ...c,
      effects: c.effects.filter((e) => e.id !== 'mage_mana_bonus'),
    }));
  }

  const atkBonus = mana * 0.03;

  return updateChar(state, ownerTeam, ownerCharId, (c) =>
    applyEffect(c, {
      id: 'mage_mana_bonus',
      name: '魔力増幅',
      category: 'stat',
      stat: 'atk',
      value: atkBonus,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: -1,
    })
  );
};

export const char_mage_passive_handlers: Record<string, PassiveHandler> = {
  char_mage_passive_mana_regen_on_turn_start: mage_passive_mana_regen,
  char_mage_passive_mana_bonus_passive_while_active: mage_passive_mana_bonus,
};
