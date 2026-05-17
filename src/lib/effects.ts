import type { StatusEffect, CharacterState } from '../types';

/**
 * ステータス効果（バフ・デバフ・DoT等）を付与する
 */
export function applyEffect(
  char: CharacterState,
  effect: Omit<StatusEffect, 'currentStacks'>
): CharacterState {
  if (char.battleFlags.immune_to_effects) {
    return char;
  }
  const existingIdx = char.effects.findIndex((e) => e.id === effect.id);

  if (existingIdx >= 0) {
    const existing = char.effects[existingIdx];
    if (effect.isStackable) {
      const newStacks = Math.min(
        effect.maxStacks ?? 99,
        existing.currentStacks + 1
      );
      const newEffects = [...char.effects];
      newEffects[existingIdx] = {
        ...existing,
        currentStacks: newStacks,
        turnsRemaining: effect.turnsRemaining, // 期間更新
      };
      return { ...char, effects: newEffects };
    } else {
      // 重複不可なら内容を上書き（期間や値の更新）
      const newEffects = [...char.effects];
      newEffects[existingIdx] = {
        ...effect,
        currentStacks: 1,
      };
      return { ...char, effects: newEffects };
    }
  }

  // 新規付与
  return {
    ...char,
    effects: [...char.effects, { ...effect, currentStacks: 1 }],
  };
}

/**
 * ターン経過による効果の更新（残りターン減少、期限切れ削除）
 */
export function tickEffects(char: CharacterState): CharacterState {
  const newEffects = char.effects
    .map((e) => ({
      ...e,
      turnsRemaining: e.turnsRemaining === -1 ? -1 : e.turnsRemaining - 1,
    }))
    .filter((e) => e.turnsRemaining !== 0);

  return { ...char, effects: newEffects };
}

/**
 * 指定したステータス（atk, def等）の補正倍率を計算する
 */
export function getStatMultiplier(
  char: CharacterState,
  stat: 'atk' | 'def' | 'priority'
): number {
  let addSum = 0;
  let mulSum = 1;

  for (const e of char.effects) {
    if (e.category !== 'stat' || e.stat !== stat) continue;

    const effectValue = e.value * e.currentStacks;
    if (e.mode === 'add') {
      addSum += effectValue;
    } else {
      // mulの場合、(1 + value)^stacks ではなく (1 + value * stacks) で計算（簡略化）
      // またはスタックごとに乗算するかはゲーム設計次第
      mulSum *= (1 + effectValue);
    }
  }

  // デバフ（マイナス値）も同様に計算される
  return Math.max(0, (1 + addSum) * mulSum);
}

/**
 * 全ての効果からDoT/Regenを抽出する
 */
export function getTurnlyEffects(char: CharacterState) {
  return char.effects.filter(e => e.category === 'dot' || e.category === 'regen');
}
