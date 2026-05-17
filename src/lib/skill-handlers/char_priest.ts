import type {
  BattleState,
  Team,
  CharacterState,
  SkillHandler,
  PassiveHandler,
  DeathInterceptor,
} from '../../types';
import { calcDamage } from '../damage';
import {
  registerDeathInterceptor,
} from '../interceptors';
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

/** S1: 連撃 */
const s1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  
  const usage = (actor.battleFlags.s1_usage as number) ?? 0;
  const newUsage = usage + 1;

  const sin = getResource(actor, 'sin');
  const baseFixed = 10;
  const sinBonus = Math.floor(sin / 10) * 1.2;
  const totalFixed = Math.floor(baseFixed + sinBonus);

  let s = dealDamage(state, actorTeam, totalFixed);
  s = addLog(s, `${actor.name}の「連撃」→ ${enemy.name}に${totalFixed}の固定ダメージ`);
  
  s = updateActiveChar(s, actorTeam, (c) => {
    const nc = { ...c, battleFlags: { ...c.battleFlags, s1_usage: newUsage } };
    if (newUsage >= 2) {
      nc.disabledSkills = [...nc.disabledSkills, 'char_priest_s1_combo'];
    }
    return nc;
  });

  return s;
};

/** S2-神父: 神罰-代行 */
const s2_priest: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  
  // 闇属性として扱う（光→闇への有利判定を模擬するために elementMult を 1.2 に固定）
  const dmg = calcDamage(actor, enemy, { multiplier: 1.0, applyElement: false, extraMultiplier: 1.2 });
  
  let s = dealDamage(state, actorTeam, dmg);
  s = addLog(s, `${actor.name}の「神罰-代行」→ ${enemy.name}に${dmg}ダメージ`);
  return s;
};

/** S2-神: 神罰 */
const s2_god: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  
  const dmg = Math.floor(enemy.maxHp * 0.5);
  
  let s = dealDamage(state, actorTeam, dmg);
  s = addLog(s, `${actor.name}の「神罰」→ ${enemy.name}の最大HPの50%分（${dmg}）のダメージ`);
  return s;
};

/** S3-神父: あるべきところへ */
const s3_priest: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  const enemy = getEnemy(state, actorTeam);
  
  const dmg = calcDamage(actor, enemy, { multiplier: 1.2 });
  let s = dealDamage(state, actorTeam, dmg);
  
  // 相手のATK+10%(次ターン)、被ダメ+25%(次1回)
  s = updateActiveChar(s, enemyTeam, (c) => {
    let nc = applyEffect(c, {
      id: 'priest_atk_up_penalty',
      name: 'ATK上昇(代償)',
      category: 'stat',
      stat: 'atk',
      value: 0.1,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 1,
    });
    nc = {
      ...nc,
      battleFlags: {
        ...nc.battleFlags,
        damage_increase_percent: 0.25
      }
    };
    return nc;
  });
  
  s = addLog(s, `${actor.name}の「あるべきところへ」→ ${enemy.name}に${dmg}ダメージ、被ダメ25%増加付与`);
  return s;
};

/** S3-神: 還元 */
const s3_god: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);

  
  const sin = getResource(actor, 'sin');
  let s = dealDamage(state, actorTeam, sin);
  s = addLog(s, `${actor.name}の「還元」→ 罪を全て解き放ち、${sin}ダメージ`);
  
  // 罪をリセット
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'sin', 0, true));
  
  if (sin <= 400) {
    const extraDmg = Math.floor(sin * 0.3);
    s = dealDamage(s, actorTeam, extraDmg);
    s = addLog(s, `さらに追撃で${extraDmg}ダメージ`);
  }
  
  return s;
};

/** S4-神父: 精算 */
const s4_priest: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  
  const dmg = calcDamage(actor, enemy, { multiplier: 1.5 });
  let s = dealDamage(state, actorTeam, dmg);
  
  s = updateActiveChar(s, actorTeam, (c) => {
    let nc = setResource(c, 'sin', 100);
    nc = { ...nc, hp: Math.min(nc.maxHp, nc.hp + Math.floor(nc.maxHp * 0.1)) };
    return nc;
  });
  
  s = addLog(s, `${actor.name}の「精算」→ ${enemy.name}に${dmg}ダメージ、罪+100、HP回復`);
  return s;
};

/** S4-神: 不完全 */
const s4_god: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  
  let s = updateActiveChar(state, actorTeam, (c) => ({
    ...c,
    name: "神父",
    element: "light" as const,
    maxHp: 800,
    hp: Math.floor(800 * 0.5),
    atk: 102,
    unlockedDerivedSkills: c.unlockedDerivedSkills.filter(u => 
      u.skillId !== 'char_priest_s2_god_punishment' &&
      u.skillId !== 'char_priest_s3_reduction' &&
      u.skillId !== 'char_priest_s4_incomplete'
    ),
    disabledSkills: c.disabledSkills.filter(id => 
      id !== 'char_priest_s2_punishment_proxy' &&
      id !== 'char_priest_s3_to_where_it_belongs' &&
      id !== 'char_priest_s4_liquidation'
    ),
    battleFlags: {
      ...c.battleFlags,
      is_god_mode: false,
      immune_to_effects: false,
      is_god_used: true, // Re-ascension prevented
    }
  }));
  
  s = addLog(s, `${actor.name}は「不完全」なまま人の姿へと戻った……`);
  return s;
};

// 分岐用ハンドラ
const s2_dispatch: SkillHandler = (state, actorTeam) => {
  return getActive(state, actorTeam).battleFlags.is_god_mode ? s2_god(state, actorTeam) : s2_priest(state, actorTeam);
};
const s3_dispatch: SkillHandler = (state, actorTeam) => {
  return getActive(state, actorTeam).battleFlags.is_god_mode ? s3_god(state, actorTeam) : s3_priest(state, actorTeam);
};
const s4_dispatch: SkillHandler = (state, actorTeam) => {
  return getActive(state, actorTeam).battleFlags.is_god_mode ? s4_god(state, actorTeam) : s4_priest(state, actorTeam);
};

// ============================================================
// パッシブハンドラ
// ============================================================

/** 加護？: ターン開始時5%回復 */
const passive_protection: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find(c => c.id === ownerCharId);
  if (!char || !char.isActive || state.currentTurn !== ownerTeam) return state;
  if (char.battleFlags.is_god_mode) return state;

  const healAmount = Math.floor(char.maxHp * 0.05);
  const s = updateChar(state, ownerTeam, ownerCharId, (c) => ({
    ...c,
    hp: Math.min(c.maxHp, c.hp + healAmount)
  }));
  return addLog(s, `${char.name}の「加護？」→ HPが${healAmount}回復`);
};

/** 神殺し & 断罪 (常時評価) */
const passive_always: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  return updateChar(state, ownerTeam, ownerCharId, (c) => {
    const isGod = c.battleFlags.is_god_mode;
    const sin = getResource(c, 'sin');
    return {
      ...c,
      battleFlags: {
        ...c.battleFlags,
        damage_reduction_fixed: isGod ? 0 : 20,
        damage_addition_fixed: Math.floor(sin / 10)
      }
    };
  });
};

/** 断罪: ダメージを受けた際に罪を加算 */
const passive_on_damage: PassiveHandler = (state, ownerTeam, ownerCharId, context) => {
  const char = state[ownerTeam].characters.find(c => c.id === ownerCharId);
  if (!char) return state;
  
  // 自身がダメージを受けているかチェック
  if (context?.targetCharId && context.targetCharId !== ownerCharId) return state;
  
  const damageTaken = context?.damage ?? 0;
  if (damageTaken <= 0) return state;

  return updateChar(state, ownerTeam, ownerCharId, (c) => setResource(c, 'sin', damageTaken));
};

/** 神: ターン数チェック */
const passive_god_timer: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find(c => c.id === ownerCharId);
  if (!char || !char.isActive || !char.battleFlags.is_god_mode || state.currentTurn !== ownerTeam) return state;

  const godTurns = (char.battleFlags.god_turns as number) ?? 0;
  const nextGodTurns = godTurns + 1;

  if (nextGodTurns >= 3) {
     let s = updateChar(state, ownerTeam, ownerCharId, (c) => ({ ...c, hp: 0 }));
     s = addLog(s, `神としての器が限界を迎え、崩壊した……`);
     // 味方全体に100ダメージ
     for (const c of s[ownerTeam].characters) {
       if (c.isAlive && c.id !== ownerCharId) {
         s = updateChar(s, ownerTeam, c.id, (target) => ({ ...target, hp: Math.max(0, target.hp - 100) }));
         // 被ダメージパッシブを発火
         s = triggerPassives(s, 'on_damage_received', { targetCharId: c.id, damage: 100 });
       }
     }
     return s;
  }
  
  return updateChar(state, ownerTeam, ownerCharId, (c) => ({
    ...c,
    battleFlags: { ...c.battleFlags, god_turns: nextGodTurns }
  }));
};

/** ターン終了時のリセット処理 */
const passive_reset: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  if (state.currentTurn !== ownerTeam) return state;
  return updateChar(state, ownerTeam, ownerCharId, (c) => {
    const bf = { ...c.battleFlags };
    delete bf.s1_usage;
    return {
      ...c,
      battleFlags: bf,
      disabledSkills: c.disabledSkills.filter(id => id !== 'char_priest_s1_combo')
    };
  });
};

// ============================================================
// DeathInterceptor
// ============================================================
const deathInterceptor: DeathInterceptor = (state, dyingCharId, ownerTeam) => {
  const char = state[ownerTeam].characters.find(c => c.id === dyingCharId);
  if (!char || char.battleFlags.is_god_used) return { prevent: false, newState: state };

  let s = updateChar(state, ownerTeam, dyingCharId, (c) => ({
    ...c,
    name: "神",
    element: "none",
    maxHp: 500,
    hp: 500,
    atk: 0,
    effects: [],
    disabledSkills: [
      ...c.disabledSkills,
      'char_priest_s2_punishment_proxy',
      'char_priest_s3_to_where_it_belongs',
      'char_priest_s4_liquidation'
    ],
    battleFlags: {
      ...c.battleFlags,
      is_god_mode: true,
      is_god_used: true,
      immune_to_effects: true,
      god_turns: 0, // ターン数カウントをリセットして開始
    },
    unlockedDerivedSkills: [
      ...c.unlockedDerivedSkills,
      { skillId: 'char_priest_s2_god_punishment', available: 'permanent' as const },
      { skillId: 'char_priest_s3_reduction', available: 'permanent' as const },
      { skillId: 'char_priest_s4_incomplete', available: 'permanent' as const }
    ]
  }));
  
  s = addLog(s, `「神」へと昇華した！ 全ての束縛から解き放たれる。`);
  return { prevent: true, newState: s };
};

// ============================================================
// エクスポート
// ============================================================
export const char_priest_skill_handlers: Record<string, SkillHandler> = {
  char_priest_s1_combo: s1,
  char_priest_s1_second: s1,
  char_priest_s2_punishment_proxy: s2_dispatch,
  char_priest_s3_to_where_it_belongs: s3_dispatch,
  char_priest_s4_liquidation: s4_dispatch,
  // 神のスキルIDも登録しておく
  char_priest_s2_god_punishment: s2_dispatch,
  char_priest_s3_reduction: s3_dispatch,
  char_priest_s4_incomplete: s4_dispatch,
};

export const char_priest_passive_handlers: Record<string, PassiveHandler> = {
  char_priest_passive_protection_on_turn_start: passive_protection,
  char_priest_passive_godslayer_passive_while_active: passive_always,
  char_priest_passive_condemnation_on_damage_received: passive_on_damage,
  char_priest_passive_god_on_turn_end: passive_god_timer,
  char_priest_passive_condemnation_on_turn_end: passive_reset,
};

registerDeathInterceptor('char_priest', deathInterceptor);
