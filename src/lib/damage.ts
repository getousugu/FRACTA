import type { CharacterState, Element, StatusEffect } from '../types';

// ============================================================
// 属性相性テーブル
// ============================================================
const ELEMENT_ADVANTAGE: Partial<Record<Element, Element>> = {
  fire: 'grass',
  water: 'fire',
  grass: 'water',
  light: 'dark',
  dark: 'light',
};
const ELEMENT_BONUS = 1.2;

export function getElementMultiplier(
  attackerElement: Element,
  defenderElement: Element
): number {
  return ELEMENT_ADVANTAGE[attackerElement] === defenderElement
    ? ELEMENT_BONUS
    : 1.0;
}

import { getStatMultiplier } from './effects';

type StatKey = 'atk' | 'def' | 'priority';

export function getEffectiveStat(
  char: CharacterState,
  stat: StatKey
): number {
  const base = char[stat as keyof CharacterState] as number;
  return base * getStatMultiplier(char, stat);
}

// ============================================================
// 基本ダメージ計算
// ============================================================
export type DamageOptions = {
  /** スキル倍率 (例: 1.5 = ATK×1.5) */
  multiplier: number;
  /** 属性補正を適用するか */
  applyElement?: boolean;
  /** DEFを無視するか（貫通ダメージ） */
  piercing?: boolean;
  /** 追加の補正倍率（スキル固有） */
  extraMultiplier?: number;
  /** 固定ダメージ加算（スキル固有） */
  fixedDamage?: number;
};

export function calcDamage(
  attacker: CharacterState,
  defender: CharacterState,
  options: DamageOptions
): number {
  const {
    multiplier,
    applyElement = true,
    piercing = false,
    extraMultiplier = 1,
  } = options;

  const atk = getEffectiveStat(attacker, 'atk');
  const def = piercing ? 0 : getEffectiveStat(defender, 'def');

  const elementMult = applyElement
    ? getElementMultiplier(attacker.element, defender.element)
    : 1.0;

  // 敵陣突破バフチェック
  const attackerBreakthrough = attacker.effects.find(
    (e) => e.id === 'enemy_breakthrough'
  );
  const breakthroughMult = attackerBreakthrough
    ? 1 + attackerBreakthrough.value
    : 1.0;

  // 敵陣膠着による被ダメ軽減（defender側のcustomResourceで計算）
  const stagnation = defender.customResources.find(
    (r) => r.id === 'enemy_stagnation'
  );
  const stagnationReduction = stagnation
    ? Math.min(stagnation.value * 0.01, 0.1)
    : 0;

  // キャラクター固有の被ダメ補正（battleFlags）
  const flagReduction = (defender.battleFlags.damage_reduction_percent as number) ?? 0;
  const flagIncrease = (defender.battleFlags.damage_increase_percent as number) ?? 0;

  // special effects (被ダメージ軽減・増加)
  let specialReduction = 0;
  let specialIncrease = 0;
  for (const e of defender.effects) {
    if (e.category === 'special') {
      if (e.name === '被ダメージ軽減' || e.id.includes('reduction') || e.id.includes('reduce')) {
        specialReduction += e.value * e.currentStacks;
      } else if (e.name === '被ダメージ増加' || e.id.includes('damage_taken_up') || e.id.includes('increase')) {
        specialIncrease += e.value * e.currentStacks;
      }
    }
  }

  const raw = atk * multiplier - def / 2;
  const damage = Math.max(
    1,
    Math.round(
      raw *
      elementMult *
      extraMultiplier *
      breakthroughMult *
      (1 - stagnationReduction) *
      Math.max(0, 1 - flagReduction - specialReduction) *
      (1 + flagIncrease + specialIncrease)
    )
  );

  // 固定ダメージ加算と固定値減少の適用
  const attackerFixedAdd = (attacker.battleFlags.damage_addition_fixed as number) ?? 0;
  const defenderFixedRed = (defender.battleFlags.damage_reduction_fixed as number) ?? 0;
  const skillFixedAdd = options.fixedDamage ?? 0;

  const finalDamage = Math.max(
    1,
    damage + attackerFixedAdd + skillFixedAdd - defenderFixedRed
  );

  return finalDamage;
}

/** 敵陣突破バフを消費する（攻撃後に呼ぶ） */
export function consumeBreakthroughBuff(
  char: CharacterState
): CharacterState {
  return {
    ...char,
    effects: char.effects.filter((e) => e.id !== 'enemy_breakthrough'),
  };
}

// ============================================================
// DoTダメージ計算（ターン終了時に使用）
// ============================================================
export function calcDoTDamage(
  effect: StatusEffect,
  defender: CharacterState
): number {
  if (effect.id === 'burn' && defender.effects.some(e => e.id === 'pyro_burn_immune')) {
    return 0; // 火傷耐性
  }

  // metadata等で貫通フラグを持つ想定（現状は簡略化）
  const isPiercing = effect.id === 'poison_pierce';
  if (isPiercing) return Math.max(1, effect.value);
  const def = getEffectiveStat(defender, 'def');
  return Math.max(1, Math.round(effect.value - def / 4));
}
