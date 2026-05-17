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

function getBurnValue(char: CharacterState): number {
  const effect = char.effects.find((e) => e.id === 'burn');
  return effect?.value ?? 0;
}

function setBurnValue(char: CharacterState, value: number): CharacterState {
  const existingEffect = char.effects.find((e) => e.id === 'burn');
  if (existingEffect) {
    return {
      ...char,
      effects: char.effects.map((e) =>
        e.id === 'burn' ? { ...e, value } : e
      ),
    };
  }
  if (value > 0) {
    return {
      ...char,
      effects: [
        ...char.effects,
        {
          id: 'burn',
          name: '火傷',
          category: 'dot',
          value: value,
          mode: 'add',
          turnsRemaining: -1,
          isStackable: false,
          currentStacks: 1,
        },
      ],
    };
  }
  return char;
}

function clearBurn(char: CharacterState): CharacterState {
  return {
    ...char,
    effects: char.effects.filter((e) => e.id !== 'burn'),
  };
}

function inflictBurn(state: BattleState, actorTeam: Team, targetTeam: Team, targetId: string, baseAmount: number, isSkill: boolean = true): { state: BattleState, finalAmount: number } {
  const actor = getActive(state, actorTeam);
  
  let modifier = 0;
  if (isSkill) {
    const hpPercent = actor.hp / actor.maxHp;
    if (hpPercent >= 0.7) modifier = 5;
    else if (hpPercent >= 0.5) modifier = 2;
    else modifier = -2;
  }
  
  const finalAmount = Math.max(0, baseAmount + modifier);
  if (finalAmount === 0) return { state, finalAmount: 0 };
  
  const target = state[targetTeam].characters.find(c => c.id === targetId);
  if (!target) return { state, finalAmount: 0 };
  
  const currentBurn = getBurnValue(target);
  const newState = updateChar(state, targetTeam, targetId, c => setBurnValue(c, currentBurn + finalAmount));
  
  return { state: newState, finalAmount };
}

// ============================================================
// スキルハンドラ
// ============================================================

/** S1: 炎の爪痕 */
const pyro_s1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const heat = getResource(actor, 'heat');
  
  const dmg = calcDamage(actor, enemy, { multiplier: 1.2 });
  
  // 火傷計算: 8 + 熱量/10（切り捨て）
  const baseBurn = 8 + Math.floor(heat / 10);
  
  let s = dealDamage(state, actorTeam, dmg);
  const enemyTeam = actorTeam === 'team1' ? 'team2' : 'team1';
  const { state: s2, finalAmount } = inflictBurn(s, actorTeam, enemyTeam, getActive(s, enemyTeam).id, baseBurn, true);
  s = s2;
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'heat', 15));
  
  s = addLog(s, `${actor.name}の「炎の爪痕」→ ${enemy.name}に${dmg}ダメージ、火傷${finalAmount}付与、熱量+15`);
  return s;
};

/** S1派生: 熱波放出 */
const pyro_s1_d1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const heat = getResource(actor, 'heat');
  
  const dmg = calcDamage(actor, enemy, { multiplier: 0.8 });
  
  // 火傷計算: 5 + 熱量/15（切り捨て）
  const baseBurn = 5 + Math.floor(heat / 15);
  
  let s = dealDamage(state, actorTeam, dmg);
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  const { state: s2, finalAmount } = inflictBurn(s, actorTeam, enemyTeam, getActive(s, enemyTeam).id, baseBurn, true);
  s = s2;
  
  // 相手のATKを2ターンの間10%低下させる
  s = updateActiveChar(s, enemyTeam, (c) =>
    applyEffect(c, {
      id: 'pyro_s1_d1_atk_down',
      name: 'ATK低下',
      category: 'stat',
      stat: 'atk',
      value: -0.1,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 2,
    })
  );
  
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'heat', 10));
  
  s = addLog(s, `${actor.name}の「熱波放出」→ ${enemy.name}に${dmg}ダメージ、火傷${finalAmount}付与、ATK10%低下（2ターン）、熱量+10`);
  return s;
};

/** S2: 拡散熱源 */
const pyro_s2: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  
  const dmg = calcDamage(actor, enemy, { multiplier: 1.0 });
  
  let s = dealDamage(state, actorTeam, dmg);
  const { state: s2, finalAmount } = inflictBurn(s, actorTeam, enemyTeam, getActive(s, enemyTeam).id, 12, true);
  s = s2;
  
  // 相手の控えランダム1名にも火傷6を付与
  const benchChars = state[enemyTeam].characters.filter((c) => !c.isActive && c.isAlive);
  if (benchChars.length > 0) {
    const randomIndex = Math.floor(Math.random() * benchChars.length);
    const randomBench = benchChars[randomIndex];
    const { state: s3, finalAmount: benchAmount } = inflictBurn(s, actorTeam, enemyTeam, randomBench.id, 6, true);
    s = s3;
    s = addLog(s, `${randomBench.name}にも火傷${benchAmount}を付与`);
  }
  
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'heat', 20));
  
  s = addLog(s, `${actor.name}の「拡散熱源」→ ${enemy.name}に${dmg}ダメージ、火傷${finalAmount}付与、熱量+20`);
  return s;
};

/** S2派生: 集中熱線 */
const pyro_s2_d1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  
  const dmg = calcDamage(actor, enemy, { multiplier: 1.3 });
  
  let s = dealDamage(state, actorTeam, dmg);
  const { state: s2, finalAmount } = inflictBurn(s, actorTeam, enemyTeam, getActive(s, enemyTeam).id, 15, true);
  s = s2;
  
  // 相手の優先度を-2にする
  s = updateActiveChar(s, enemyTeam, (c) => ({
    ...c,
    priority: c.priority - 2,
  }));
  
  // 優先度が変化したことをマーク
  s = { ...s, battleFlags: { ...s.battleFlags, priorityChanged: true } };
  
  // 相手のDEFを2ターンの間15%低下させる
  s = updateActiveChar(s, enemyTeam, (c) =>
    applyEffect(c, {
      id: 'pyro_s2_d1_def_down',
      name: 'DEF低下',
      category: 'stat',
      stat: 'def',
      value: -0.15,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 2,
    })
  );
  
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'heat', 25));
  
  s = addLog(s, `${actor.name}の「集中熱線」→ ${enemy.name}に${dmg}ダメージ、火傷${finalAmount}付与、相手優先度-2、DEF15%低下（2ターン）、熱量+25`);
  return s;
};

/** S3: 冷却循環 */
const pyro_s3: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  
  // 敵の火傷を取得
  const burnValue = getBurnValue(enemy);
  
  if (burnValue <= 0) {
    return state; // 火傷がない場合は効果なし
  }
  
  // 敵の火傷を消滅させる
  let s = updateActiveChar(state, enemyTeam, (c) => clearBurn(c));
  
  // 消滅させた値×2だけ自身のHPを回復する
  const healAmount = burnValue * 2;
  s = heal(s, actorTeam, healAmount);
  
  // 熱量-30
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'heat', -30));
  
  s = addLog(s, `${actor.name}の「冷却循環」→ 敵の火傷${burnValue}を消滅、HP${healAmount}回復、熱量-30`);
  return s;
};

/** S4: 熱暴走 */
const pyro_s4: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const heat = getResource(actor, 'heat');
  
  const dmg = calcDamage(actor, enemy, { multiplier: 1.2 });
  
  // 火傷計算: 25 + 熱量/5（切り捨て）
  const baseBurn = 25 + Math.floor(heat / 5);
  
  let s = dealDamage(state, actorTeam, dmg);
  const enemyTeam = actorTeam === 'team1' ? 'team2' : 'team1';
  const { state: s2, finalAmount } = inflictBurn(s, actorTeam, enemyTeam, getActive(s, enemyTeam).id, baseBurn, true);
  s = s2;
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'heat', 30));
  
  s = addLog(s, `${actor.name}の「熱暴走」→ ${enemy.name}に${dmg}ダメージ、火傷${finalAmount}付与、熱量+30`);
  return s;
};

/** S4派生: 臨界突破 */
const pyro_s4_d1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const heat = getResource(actor, 'heat');
  
  if (heat <= 0) {
    return state; // 熱量がない場合は効果なし
  }
  
  // 熱量をすべて消費
  const consumedHeat = heat;
  
  // 火傷計算: 40 + 消費熱量/2（切り捨て）
  const baseBurn = 40 + Math.floor(consumedHeat / 2);
  
  // ATK×1.5のダメージ、DEF30%無視
  const dmg = calcDamage(actor, enemy, { multiplier: 1.5, defIgnore: 0.3 });
  
  let s = dealDamage(state, actorTeam, dmg);
  const enemyTeam = actorTeam === 'team1' ? 'team2' : 'team1';
  const { state: s2, finalAmount } = inflictBurn(s, actorTeam, enemyTeam, getActive(s, enemyTeam).id, baseBurn, true);
  s = s2;
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'heat', 0, true)); // 熱量を0に
  
  s = addLog(s, `${actor.name}の「臨界突破」→ ${enemy.name}に${dmg}ダメージ（DEF30%無視）、火傷${finalAmount}付与、熱量${consumedHeat}消費`);
  return s;
};

export const char_pyro_test_subject_skill_handlers: Record<string, SkillHandler> = {
  char_pyro_s1: pyro_s1,
  char_pyro_s1_d1: pyro_s1_d1,
  char_pyro_s2: pyro_s2,
  char_pyro_s2_d1: pyro_s2_d1,
  char_pyro_s3: pyro_s3,
  char_pyro_s4: pyro_s4,
  char_pyro_s4_d1: pyro_s4_d1,
};

// ============================================================
// パッシブハンドラ
// ============================================================

/** passive_while_active: 火傷増幅 - 敵の火傷1につき、与ダメージが0.8%上昇 */
const passive_burn_bonus: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  const enemyTeam: Team = ownerTeam === 'team1' ? 'team2' : 'team1';
  const enemy = getActive(state, enemyTeam);
  const burnValue = getBurnValue(enemy);
  
  if (burnValue <= 0) {
    return updateChar(state, ownerTeam, ownerCharId, (c) => ({
      ...c,
      effects: c.effects.filter((e) => e.id !== 'pyro_burn_bonus'),
    }));
  }
  
  const damageBonus = burnValue * 0.008; // 0.8% per burn
  
  return updateChar(state, ownerTeam, ownerCharId, (c) =>
    applyEffect(c, {
      id: 'pyro_burn_bonus',
      name: '火傷増幅',
      category: 'stat',
      stat: 'atk',
      value: damageBonus,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: -1,
    })
  );
};

/** passive_while_active: 火傷耐性 - 火傷によるダメージを受けない */
const passive_burn_immune: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  // 火傷耐性はバフとして適用（DoT計算時に参照される）
  return updateChar(state, ownerTeam, ownerCharId, (c) =>
    applyEffect(c, {
      id: 'pyro_burn_immune',
      name: '火傷耐性',
      category: 'special',
      value: 1, // フラグとして使用
      mode: 'mul',
      isStackable: false,
      turnsRemaining: -1,
    })
  );
};

/** passive_while_active: 実験体の反応 - HPに応じて火傷付与値が変化 */
const passive_hp_conditional: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  const hpPercent = char.hp / char.maxHp;
  let burnModifier = 0;
  
  if (hpPercent >= 0.7) {
    burnModifier = 5;
  } else if (hpPercent >= 0.5) {
    burnModifier = 2;
  } else {
    burnModifier = -2;
  }
  
  // battleFlagsに保存（スキル使用時に参照）
  return updateChar(state, ownerTeam, ownerCharId, (c) => ({
    ...c,
    battleFlags: {
      ...c.battleFlags,
      burn_modifier: burnModifier,
    },
  }));
};

/** on_turn_start: 熱量加速 - 熱量50以上で、敵の火傷+3 */
const passive_heat_50: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive || state.currentTurn !== ownerTeam) return state;

  const heat = getResource(char, 'heat');
  if (heat < 50) return state;
  
  const enemyTeam: Team = ownerTeam === 'team1' ? 'team2' : 'team1';
  const enemy = getActive(state, enemyTeam);
  const currentBurn = getBurnValue(enemy);
  
  let s = updateActiveChar(state, enemyTeam, (c) => setBurnValue(c, currentBurn + 3));
  
  s = addLog(s, `${char.name}の「熱量加速」発動 → 敵の火傷+3`);
  return s;
};

/** passive_while_active: 過熱状態 - 熱量80以上で、与ダメージ+20% */
const passive_heat_80: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  const heat = char.customResources.find((r) => r.id === 'heat')?.value ?? 0;
  if (heat < 80) {
    return updateChar(state, ownerTeam, ownerCharId, (c) => ({
      ...c,
      effects: c.effects.filter((e) => e.id !== 'pyro_heat_80'),
    }));
  }
  
  return updateChar(state, ownerTeam, ownerCharId, (c) =>
    applyEffect(c, {
      id: 'pyro_heat_80',
      name: '過熱状態',
      category: 'stat',
      stat: 'atk',
      value: 0.2,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: -1,
    })
  );
};

/** on_turn_start: 熱暴走 - 熱量90以上で、自身のHP-5% */
const passive_overheat: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive || state.currentTurn !== ownerTeam) return state;

  const heat = getResource(char, 'heat');
  if (heat < 90) return state;
  
  const damageAmount = Math.floor(char.maxHp * 0.05);
  let s = updateChar(state, ownerTeam, ownerCharId, (c) => ({
    ...c,
    hp: Math.max(0, c.hp - damageAmount),
  }));
  
  s = addLog(s, `${char.name}の「熱暴走」発動 → HP${damageAmount}ダメージ`);
  return s;
};

/** on_turn_start: 炎の浸透 - 敵の火傷15以上で、敵の火傷+3 */
const passive_burn_15: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive || state.currentTurn !== ownerTeam) return state;

  const enemyTeam: Team = ownerTeam === 'team1' ? 'team2' : 'team1';
  const enemy = getActive(state, enemyTeam);
  const burnValue = getBurnValue(enemy);
  
  if (burnValue < 15) return state;
  
  let s = updateActiveChar(state, enemyTeam, (c) => setBurnValue(c, burnValue + 3));
  
  s = addLog(s, `${char.name}の「炎の浸透」発動 → 敵の火傷+3`);
  return s;
};

/** passive_while_active: 炎の猛威 - 火傷30以上の敵に対する与ダメージ+15% */
const passive_burn_30: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  const enemyTeam: Team = ownerTeam === 'team1' ? 'team2' : 'team1';
  const enemy = getActive(state, enemyTeam);
  const burnValue = getBurnValue(enemy);
  if (burnValue < 30) {
    return updateChar(state, ownerTeam, ownerCharId, (c) => ({
      ...c,
      effects: c.effects.filter((e) => e.id !== 'pyro_burn_30'),
    }));
  }
  
  return updateChar(state, ownerTeam, ownerCharId, (c) =>
    applyEffect(c, {
      id: 'pyro_burn_30',
      name: '炎の猛威',
      category: 'stat',
      stat: 'atk',
      value: 0.15,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: -1,
    })
  );
};

export const char_pyro_test_subject_passive_handlers: Record<string, PassiveHandler> = {
  char_pyro_passive_burn_bonus_passive_while_active: passive_burn_bonus,
  char_pyro_passive_burn_immune_passive_while_active: passive_burn_immune,
  char_pyro_passive_hp_conditional_passive_while_active: passive_hp_conditional,
  char_pyro_passive_heat_50_on_turn_start: passive_heat_50,
  char_pyro_passive_heat_80_passive_while_active: passive_heat_80,
  char_pyro_passive_overheat_on_turn_start: passive_overheat,
  char_pyro_passive_burn_15_on_turn_start: passive_burn_15,
  char_pyro_passive_burn_30_passive_while_active: passive_burn_30,
};
