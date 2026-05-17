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
// 武器定義
// ============================================================
type WeaponId = 0 | 1 | 2 | 3 | 4; // 0:ハンドガン, 1:アサルトライフル, 2:ロケットランチャー, 3:サブマシンガン, 4:銃剣

interface WeaponConfig {
  id: WeaponId;
  name: string;
  hits: number;
  multiplier: number;
  defIgnorePercent?: number;
  onHitEffect?: (state: BattleState, actorTeam: Team, enemyTeam: Team) => BattleState;
  specialCondition?: (actor: CharacterState, enemy: CharacterState) => boolean;
}

const WEAPONS: Record<WeaponId, WeaponConfig> = {
  0: {
    id: 0,
    name: 'ハンドガン',
    hits: 1,
    multiplier: 1.3,
  },
  1: {
    id: 1,
    name: 'アサルトライフル',
    hits: 4,
    multiplier: 0.3,
    defIgnorePercent: 0.8,
  },
  2: {
    id: 2,
    name: 'ロケットランチャー',
    hits: 1,
    multiplier: 1.6,
    onHitEffect: (currentState, _actorTeam, enemyTeam) => {
      // 相手DEFを2ターン10%ダウン
      return updateActiveChar(currentState, enemyTeam, (c) =>
        applyEffect(c, {
          id: 'indicate_rocket_def_down',
          name: 'DEF低下',
          category: 'stat',
          stat: 'def',
          value: -0.1,
          mode: 'mul',
          isStackable: false,
          turnsRemaining: 2,
        })
      );
    },
  },
  3: {
    id: 3,
    name: 'サブマシンガン',
    hits: 6,
    multiplier: 0.2,
    defIgnorePercent: 1.0, // 完全無視
  },
  4: {
    id: 4,
    name: '銃剣',
    hits: 1,
    multiplier: 1.25,
    specialCondition: (_actor, enemy) => enemy.hp <= enemy.maxHp * 0.5,
  },
};

// 連射武器
const RAPID_FIRE_WEAPONS: Set<WeaponId> = new Set([1, 3]); // アサルトライフル, サブマシンガン

// ============================================================
// ユーティリティ
// ============================================================
function getActive(state: BattleState, team: Team): CharacterState {
  return state[team].characters[state[team].activeIndex];
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
  damage: number,
  targetTeam?: Team
): BattleState {
  const enemyTeam: Team = targetTeam || (actorTeam === 'team1' ? 'team2' : 'team1');
  const enemy = getActive(state, enemyTeam);
  const newHp = Math.max(0, enemy.hp - damage);
  return updateActiveChar(state, enemyTeam, (c) => ({ ...c, hp: newHp }));
}

function dealDamageToBench(
  state: BattleState,
  _actorTeam: Team,
  damage: number,
  targetTeam: Team,
  targetIndex: number
): BattleState {
  const teamState = state[targetTeam];
  const target = teamState.characters[targetIndex];
  const newHp = Math.max(0, target.hp - damage);
  return updateChar(state, targetTeam, target.id, (c) => ({ ...c, hp: newHp }));
}

// 武器を取得
function getCurrentWeapon(char: CharacterState): WeaponId {
  return getResource(char, 'current_weapon') as WeaponId;
}

// 武器で攻撃
function attackWithWeapon(
  state: BattleState,
  actorTeam: Team,
  weaponId: WeaponId,
  damageMultiplier: number = 1.0,
  targetTeam?: Team,
  targetIndex?: number
): BattleState {
  const actor = getActive(state, actorTeam);
  const enemyTeam: Team = targetTeam || (actorTeam === 'team1' ? 'team2' : 'team1');
  const weapon = WEAPONS[weaponId];

  let currentState = state;
  let totalDamage = 0;

  for (let i = 0; i < weapon.hits; i++) {
    const dmg = calcDamage(actor, getActive(currentState, enemyTeam), {
      multiplier: weapon.multiplier * damageMultiplier,
      piercing: weapon.defIgnorePercent ? weapon.defIgnorePercent > 0 : false,
    });

    if (targetIndex !== undefined) {
      currentState = dealDamageToBench(currentState, actorTeam, dmg, enemyTeam, targetIndex);
    } else {
      currentState = dealDamage(currentState, actorTeam, dmg, enemyTeam);
    }

    totalDamage += dmg;

    // 銃剣の特殊条件：相手HPが50%以下なら再度攻撃
    if (weapon.specialCondition && weapon.specialCondition(actor, getActive(currentState, enemyTeam))) {
      const extraDmg = calcDamage(actor, getActive(currentState, enemyTeam), {
        multiplier: weapon.multiplier * damageMultiplier,
        piercing: weapon.defIgnorePercent ? weapon.defIgnorePercent > 0 : false,
      });

      if (targetIndex !== undefined) {
        currentState = dealDamageToBench(currentState, actorTeam, extraDmg, enemyTeam, targetIndex);
      } else {
        currentState = dealDamage(currentState, actorTeam, extraDmg, enemyTeam);
      }

      totalDamage += extraDmg;
    }
  }

  // ヒット時効果（ロケットランチャーのDEFダウンなど）
  if (weapon.onHitEffect) {
    currentState = weapon.onHitEffect(currentState, actorTeam, enemyTeam);
  }

  const targetName = targetIndex !== undefined
    ? state[enemyTeam].characters[targetIndex].name
    : getActive(state, enemyTeam).name;
  currentState = addLog(currentState, `${actor.name}の「${weapon.name}」→ ${targetName}に${totalDamage}ダメージ`);

  return currentState;
}

// ============================================================
// スキルハンドラ
// ============================================================

/** S1: 射撃 */
const s1_fire: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const weaponId = getCurrentWeapon(actor);
  const s1UsageCount = getResource(actor, 's1_usage_count');

  // 当ターン使用数に応じてダメージ-15%
  const damageMultiplier = 1 - (s1UsageCount * 0.15);

  let s = attackWithWeapon(state, actorTeam, weaponId, damageMultiplier);

  // 使用した武器を記録（重量制限パッシブ用）
  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    battleFlags: {
      ...c.battleFlags,
      last_used_weapon: weaponId,
    },
  }));

  // S1使用回数を増加
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 's1_usage_count', 1));

  return s;
};

/** S2: 掃討射撃 */
const s2_sweep: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const weaponId = getCurrentWeapon(actor);
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';

  let s = state;

  // アクティブキャラに攻撃
  s = attackWithWeapon(s, actorTeam, weaponId, 1.0);

  // 控えキャラ全員に攻撃（ダメージ-60%）
  const enemyTeamState = state[enemyTeam];
  for (let i = 0; i < enemyTeamState.characters.length; i++) {
    if (i === enemyTeamState.activeIndex) continue; // アクティブはスキップ
    if (!enemyTeamState.characters[i].isAlive) continue; // 死亡キャラはスキップ

    s = attackWithWeapon(s, actorTeam, weaponId, 0.4, enemyTeam, i);
  }

  // 使用した武器を記録（重量制限パッシブ用）
  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    battleFlags: {
      ...c.battleFlags,
      last_used_weapon: weaponId,
    },
  }));

  return s;
};

/** S3: 大乱射 */
const s3_barrage: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const currentWeapon = getCurrentWeapon(actor);

  let s = state;

  // 最初の攻撃
  s = attackWithWeapon(s, actorTeam, currentWeapon, 1.0);

  // 使用した武器を記録（重量制限パッシブ用）
  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    battleFlags: {
      ...c.battleFlags,
      last_used_weapon: currentWeapon,
      used_s3_this_turn: true,
    },
  }));

  // 次の武器に持ち替え
  const nextWeapon = (currentWeapon + 1) % 5 as WeaponId;
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'current_weapon', nextWeapon, true));
  s = addLog(s, `${actor.name}は武器を「${WEAPONS[nextWeapon].name}」に持ち替えた`);

  // 持ち替えた武器で攻撃
  s = attackWithWeapon(s, actorTeam, nextWeapon, 1.0);

  // 持ち替えた先が連射武器なら、もう一方の連射武器に持ち替えて攻撃
  if (RAPID_FIRE_WEAPONS.has(nextWeapon)) {
    const otherRapidFire = nextWeapon === 1 ? 3 : 1; // 1↔3を切り替え

    s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'current_weapon', otherRapidFire, true));
    s = addLog(s, `${actor.name}は武器を「${WEAPONS[otherRapidFire].name}」に持ち替えた`);

    // ダメージ-30%で攻撃
    s = attackWithWeapon(s, actorTeam, otherRapidFire, 0.7);
  }

  return s;
};

/** S4: 持ち替え */
const s4_switch: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const currentWeapon = getCurrentWeapon(actor);
  const nextWeapon = (currentWeapon + 1) % 5 as WeaponId;

  let s = updateActiveChar(state, actorTeam, (c) => setResource(c, 'current_weapon', nextWeapon, true));
  s = addLog(s, `${actor.name}は武器を「${WEAPONS[nextWeapon].name}」に持ち替えた`);

  // ダメージ-40%で攻撃
  s = attackWithWeapon(s, actorTeam, nextWeapon, 0.6);

  // 使用した武器を記録（重量制限パッシブ用）
  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    battleFlags: {
      ...c.battleFlags,
      last_used_weapon: nextWeapon,
    },
  }));

  return s;
};

/** S4-1: 体勢修正 */
const s4_1_adjust: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);

  let s = updateActiveChar(state, actorTeam, (c) => ({
    ...c,
    hp: Math.min(c.maxHp, c.hp + Math.round(c.maxHp * 0.15)),
  }));

  // DEF+10% for 2 turns
  s = updateActiveChar(s, actorTeam, (c) =>
    applyEffect(c, {
      id: 'indicate_adjust_def_up',
      name: 'DEF上昇',
      category: 'stat',
      stat: 'def',
      value: 0.1,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 2,
    })
  );

  s = addLog(s, `${actor.name}の「体勢修正」→ HP+15%、DEF+10%(2T)`);

  return s;
};

/** S5: 次は何が出るかな？ */
const s5_random: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const randomWeapon = Math.floor(Math.random() * 5) as WeaponId;

  let s = updateActiveChar(state, actorTeam, (c) => setResource(c, 'current_weapon', randomWeapon, true));
  s = addLog(s, `${actor.name}は武器を「${WEAPONS[randomWeapon].name}」に持ち替えた`);

  // ダメージ+10%で攻撃
  s = attackWithWeapon(s, actorTeam, randomWeapon, 1.1);

  // 使用した武器を記録（重量制限パッシブ用）
  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    battleFlags: {
      ...c.battleFlags,
      last_used_weapon: randomWeapon,
    },
  }));

  return s;
};

// ============================================================
// パッシブハンドラ
// ============================================================

/** on_turn_start: 持ちきれない荷物 - 毎ターン次の武器に持ち替える */
const passive_weapon_cycle: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive || state.currentTurn !== ownerTeam) return state;

  const nextWeapon = (getCurrentWeapon(char) + 1) % 5 as WeaponId;
  let s = updateChar(state, ownerTeam, ownerCharId, (c) => setResource(c, 'current_weapon', nextWeapon, true));
  s = addLog(s, `${char.name}の「持ちきれない荷物」→ 武器を「${WEAPONS[nextWeapon].name}」に持ち替えた`);

  // S1使用回数をリセット
  s = updateChar(s, ownerTeam, ownerCharId, (c) =>
    setResource(c, 's1_usage_count', 0, true)
  );

  // S3使用フラグをリセット
  s = updateChar(s, ownerTeam, ownerCharId, (c) => ({
    ...c,
    battleFlags: {
      ...c.battleFlags,
      used_s3_this_turn: false,
    },
  }));

  return s;
};

/** passive_always: 武器庫 - 武器効果の説明（機械的効果なし） */
const passive_weapon_effects: PassiveHandler = (state) => {
  // このパッシブは説明のみで機械的効果を持たない
  return state;
};

/** on_skill_used: 重量制限 - ロケットランチャー使用後、次の武器に持ち替える（S3と重複しない） */
const passive_rocket_weight: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  // S3を使用した場合は発動しない
  if (char.battleFlags['used_s3_this_turn'] as boolean) {
    return state;
  }

  // ロケットランチャー（武器ID: 2）を使用したかチェック
  const usedRocket = char.battleFlags['last_used_weapon'] === 2;
  if (!usedRocket) {
    return state;
  }

  const nextWeapon = (getCurrentWeapon(char) + 1) % 5 as WeaponId;
  let s = updateChar(state, ownerTeam, ownerCharId, (c) => setResource(c, 'current_weapon', nextWeapon, true));
  s = addLog(s, `${char.name}の「重量制限」→ 武器を「${WEAPONS[nextWeapon].name}」に持ち替えた`);

  return s;
};

// ============================================================
// エクスポート
// ============================================================
export const char_indicate_skill_handlers: Record<string, SkillHandler> = {
  char_indicate_s1_fire: s1_fire,
  char_indicate_s2_sweep: s2_sweep,
  char_indicate_s3_barrage: s3_barrage,
  char_indicate_s4_switch: s4_switch,
  char_indicate_s4_1_adjust: s4_1_adjust,
  char_indicate_s5_random: s5_random,
};

export const char_indicate_passive_handlers: Record<string, PassiveHandler> = {
  char_indicate_passive_weapon_effects_passive_always: passive_weapon_effects,
  char_indicate_passive_weapon_cycle_on_turn_start: passive_weapon_cycle,
  char_indicate_passive_rocket_weight_on_skill_used: passive_rocket_weight,
};
