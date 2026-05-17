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

function checkClockCycle(char: CharacterState): { char: CharacterState; cycleGained: boolean } {
  const clockHand = getResource(char, 'clock_hand');
  if (clockHand >= 12) {
    // 時計針が12以上の場合、時計の一循を獲得して時計針を0に
    let nc = setResource(char, 'clock_hand', 0, true);
    nc = setResource(nc, 'clock_cycle', 1);
    return { char: nc, cycleGained: true };
  }
  return { char, cycleGained: false };
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

// ============================================================
// スキルハンドラ
// ============================================================

/** S1: 時の刻み */
const s1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const dmg = calcDamage(actor, enemy, { multiplier: 1.0 });

  let s = dealDamage(state, actorTeam, dmg);
  
  // 時計針+1
  s = updateActiveChar(s, actorTeam, (c) => {
    const nc = setResource(c, 'clock_hand', 1);
    const { char: updatedChar, cycleGained } = checkClockCycle(nc);
    if (cycleGained) {
      s = addLog(s, `${actor.name}の「時計の一循」獲得！`);
    }
    return updatedChar;
  });
  
  s = addLog(s, `${actor.name}の「時の刻み」→ ${enemy.name}に${dmg}ダメージ、時計針+1`);

  return s;
};

/** S1派生: 時の加速 */
const s1d1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const clockHand = getResource(actor, 'clock_hand');

  if (clockHand < 5) {
    return state; // 時計針不足
  }

  // 時計針を5消費
  let s = updateActiveChar(state, actorTeam, (c) => setResource(c, 'clock_hand', -5));

  // 残コスト+2
  s = { ...s, remainingCost: s.remainingCost + 2 };

  // 優先度+2
  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    priority: c.priority + 2,
  }));

  // 優先度が変化したことをマーク
  s = { ...s, battleFlags: { ...s.battleFlags, priorityChanged: true } };

  s = addLog(s, `${actor.name}の「時の加速」→ 残コスト+2、優先度+2、時計針-5`);
  return s;
};

/** S1派生: 時の逆流 */
const s1d2: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const clockHand = getResource(actor, 'clock_hand');
  
  const consumeCount = Math.min(clockHand, 2);
  if (consumeCount === 0) {
    return state; // 時計針不足
  }

  // 時計針を消費（消費できる分だけ）
  let s = updateActiveChar(state, actorTeam, (c) => setResource(c, 'clock_hand', -consumeCount));
  
  // HP回復（消費数に応じて）
  const healPercent = 0.15 * consumeCount; // 1消費: 15%, 2消費: 30%
  const healAmount = Math.round(actor.maxHp * healPercent);
  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    hp: Math.min(c.maxHp, c.hp + healAmount),
  }));

  s = addLog(s, `${actor.name}の「時の逆流」→ HP${healAmount}回復、時計針-${consumeCount}`);
  return s;
};

/** S2: 時間停止 */
const s2: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const clockHand = getResource(actor, 'clock_hand');
  
  // 時計針を消費（最大4消費）
  const consumeCount = Math.min(clockHand, 4);
  const multiplier = 1.5 + (consumeCount * 0.5); // 基礎1.5 + 消費数×0.5
  
  const dmg = calcDamage(actor, enemy, { multiplier });
  
  let s = dealDamage(state, actorTeam, dmg);
  
  // 時計針を消費
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'clock_hand', -consumeCount));
  
  s = addLog(
    s,
    `${actor.name}の「時間停止」→ ${enemy.name}に${dmg}ダメージ(時計針${consumeCount}消費)、時計針-${consumeCount}`
  );
  return s;
};

/** S2派生: 時空断裂 */
const s2d1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  const clockHand = getResource(actor, 'clock_hand');
  
  const consumeCount = Math.min(clockHand, 4);
  if (consumeCount === 0) {
    return state; // 時計針不足
  }
  
  // ダメージ倍率（消費数×0.5）
  const multiplier = consumeCount * 0.5;
  const dmg = calcDamage(actor, enemy, { multiplier });
  
  let s = dealDamage(state, actorTeam, dmg);
  
  // 時計針を消費
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'clock_hand', -consumeCount));
  
  // 相手優先度-5
  s = updateActiveChar(s, enemyTeam, (c) => ({
    ...c,
    priority: c.priority - 5,
  }));

  // 優先度が変化したことをマーク
  s = { ...s, battleFlags: { ...s.battleFlags, priorityChanged: true } };

  s = addLog(
    s,
    `${actor.name}の「時空断裂」→ ${enemy.name}に${dmg}ダメージ(時計針${consumeCount}消費)、相手優先度-5、時計針-${consumeCount}`
  );
  return s;
};

/** S3: 因果律操作 */
const s3: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const clockHand = getResource(actor, 'clock_hand');
  
  const consumeCount = Math.min(clockHand, 3);
  if (consumeCount === 0) {
    return state; // 時計針不足
  }
  
  // 消費数に応じた効果
  const healPercent = 0.2 * (consumeCount / 3); // 消費数に比例
  const atkBoost = 0.25 * (consumeCount / 3); // 消費数に比例
  
  let s = updateActiveChar(state, actorTeam, (c) => setResource(c, 'clock_hand', -consumeCount));
  
  // HP回復
  const healAmount = Math.round(actor.maxHp * healPercent);
  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    hp: Math.min(c.maxHp, c.hp + healAmount),
  }));
  
  // ATKバフ（2ターン）
  s = updateActiveChar(s, actorTeam, (c) =>
    applyEffect(c, {
      id: 'chrono_witch_atk_up',
      name: 'ATK上昇',
      category: 'stat',
      stat: 'atk',
      value: atkBoost,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 2,
    })
  );
  
  s = addLog(
    s,
    `${actor.name}の「因果律操作」→ HP${healAmount}回復、ATK+${Math.round(atkBoost * 100)}%(2T)、時計針-${consumeCount}`
  );
  return s;
};

// ============================================================
// パッシブハンドラ
// ============================================================

/** on_turn_start: 時の刻印 - 時計針の値に応じて効果発動 */
const passive_on_turn_start: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive || state.currentTurn !== ownerTeam) return state;

  const clockHand = getResource(char, 'clock_hand');
  const clockCycle = getResource(char, 'clock_cycle');
  
  let s = state;
  
  // 時計の一循に応じたステータス上昇（永続）
  const cycleBonus = clockCycle * 0.03; // 1循につき3%
  if (cycleBonus > 0) {
    s = updateChar(s, ownerTeam, ownerCharId, (c) => {
      let nc = c;
      // ATK上昇
      nc = applyEffect(nc, {
        id: 'chrono_witch_cycle_atk',
        name: '時計の一循(ATK)',
        category: 'stat',
        stat: 'atk',
        value: cycleBonus,
        mode: 'mul',
        isStackable: false,
        turnsRemaining: -1,
      });
      // DEF上昇
      nc = applyEffect(nc, {
        id: 'chrono_witch_cycle_def',
        name: '時計の一循(DEF)',
        category: 'stat',
        stat: 'def',
        value: cycleBonus,
        mode: 'mul',
        isStackable: false,
        turnsRemaining: -1,
      });
      return nc;
    });
  }
  
  if (clockHand >= 0 && clockHand <= 2) {
    // 0-2: 時計針+1
    s = updateChar(s, ownerTeam, ownerCharId, (c) => {
      const nc = setResource(c, 'clock_hand', 1);
      const { char: updatedChar, cycleGained } = checkClockCycle(nc);
      if (cycleGained) {
        s = addLog(s, `${char.name}の「時計の一循」獲得！`);
      }
      return updatedChar;
    });
  } else if (clockHand >= 3 && clockHand <= 5) {
    // 3-5: ATK+10%(1T)
    s = updateChar(s, ownerTeam, ownerCharId, (c) =>
      applyEffect(c, {
        id: 'chrono_witch_atk_up',
        name: 'ATK上昇',
        category: 'stat',
        stat: 'atk',
        value: 0.1,
        mode: 'mul',
        isStackable: false,
        turnsRemaining: 1,
      })
    );
  } else if (clockHand >= 6 && clockHand <= 8) {
    // 6-8: DEF+15%(1T)
    s = updateChar(s, ownerTeam, ownerCharId, (c) =>
      applyEffect(c, {
        id: 'chrono_witch_def_up',
        name: 'DEF上昇',
        category: 'stat',
        stat: 'def',
        value: 0.15,
        mode: 'mul',
        isStackable: false,
        turnsRemaining: 1,
      })
    );
  } else if (clockHand >= 9 && clockHand <= 12) {
    // 9-12: 時計針+2
    s = updateChar(s, ownerTeam, ownerCharId, (c) => {
      const nc = setResource(c, 'clock_hand', 2);
      const { char: updatedChar, cycleGained } = checkClockCycle(nc);
      if (cycleGained) {
        s = addLog(s, `${char.name}の「時計の一循」獲得！`);
      }
      return updatedChar;
    });
  }

  return s;
};

/** on_ally_death: 逆行 - 時計針+4、HP25%回復 */
const passive_on_ally_death: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isAlive) return state;

  let s = updateChar(state, ownerTeam, ownerCharId, (c) => {
    let nc = setResource(c, 'clock_hand', 4);
    const healAmount = Math.round(c.maxHp * 0.25);
    nc = { ...nc, hp: Math.min(c.maxHp, c.hp + healAmount) };
    return nc;
  });

  s = addLog(s, `${char.name}の「逆行」発動 → 時計針+4、HP25%回復`);
  return s;
};

/** passive_while_active: 永劫 - ダメージを与えるたびに時計針+1 */
const passive_while_active: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  // ダメージを与えたかチェック（battleFlagsで管理）
  const dealtDamage = (char.battleFlags['dealt_damage_this_turn'] as boolean) ?? false;
  if (!dealtDamage) return state;

  let s = updateChar(state, ownerTeam, ownerCharId, (c) => {
    let nc = setResource(c, 'clock_hand', 1);
    const { char: updatedChar, cycleGained } = checkClockCycle(nc);
    if (cycleGained) {
      s = addLog(s, `${char.name}の「時計の一循」獲得！`);
    }
    nc = {
      ...updatedChar,
      battleFlags: {
        ...updatedChar.battleFlags,
        dealt_damage_this_turn: false,
      },
    };
    return nc;
  });

  return s;
};

// ============================================================
// エクスポート
// ============================================================
export const char_chrono_witch_skill_handlers: Record<string, SkillHandler> = {
  char_chrono_witch_s1: s1,
  char_chrono_witch_s1_d1: s1d1,
  char_chrono_witch_s1_d2: s1d2,
  char_chrono_witch_s2: s2,
  char_chrono_witch_s2_d1: s2d1,
  char_chrono_witch_s3: s3,
};

export const char_chrono_witch_passive_handlers: Record<string, PassiveHandler> = {
  char_chrono_witch_passive_turn_start_on_turn_start: passive_on_turn_start,
  char_chrono_witch_passive_ally_death_on_ally_death: passive_on_ally_death,
  char_chrono_witch_passive_while_active_passive_while_active: passive_while_active,
};
