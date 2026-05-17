import type { BattleState, Team } from '../types';
import { getSkillHandlerRegistry } from './skill-handlers/index';

// ============================================================
// パッシブ発火管理
// ============================================================

export type PassiveTrigger =
  | 'on_turn_start'
  | 'on_turn_end'
  | 'on_skill_used'
  | 'on_skill_use'
  | 'on_enemy_skill_used'
  | 'on_damage_received'
  | 'on_ally_death'
  | 'on_enemy_death'
  | 'on_self_death'
  | 'on_switch_in'
  | 'on_switch_out'
  | 'on_ally_switch'
  | 'on_cost_gained'
  | 'passive_always'
  | 'passive_while_active'
  | 'passive_while_bench'
  | 'passive_while_buff'
  | 'passive_while_resource_above'
  | 'on_hp_threshold'
  | 'on_death'
  | 'on_battle_start'
  | 'on_ally_skill_damage'
  | 'on_nemesis_death_by_ally';

/**
 * 指定トリガーに対応するパッシブを全キャラ分発火する。
 * ownerTeam/ownerCharId は各パッシブハンドラに渡す。
 */
export function triggerPassives(
  state: BattleState,
  trigger: PassiveTrigger,
  context?: {
    /** on_ally_death / on_enemy_death 等で死亡キャラIDを渡す場合 */
    dyingCharId?: string;
    /** on_damage_received で被ダメキャラを絞る場合 */
    targetCharId?: string;
    /** 被ダメージ値 */
    damage?: number;
  }
): BattleState {
  const registry = getSkillHandlerRegistry();
  let s = state;

  for (const team of ['team1', 'team2'] as Team[]) {
    for (const char of s[team].characters) {
      if (!char.isAlive && trigger !== 'on_ally_death') continue;

      // on_damage_received は対象キャラのみ
      if (context?.targetCharId && trigger === 'on_damage_received') {
        if (char.id !== context.targetCharId) continue;
      }

      const passiveRegistry = registry.passiveHandlers[char.id] ?? {};

      for (const [passiveId, handler] of Object.entries(passiveRegistry)) {
        // トリガーが一致するか確認するにはキャラデータを参照する必要があるが、
        // ハンドラ側でトリガーチェックを内包する設計にする
        // （ハンドラのキーが `${charId}_${trigger}` 規則に従う）
        if (!passiveId.includes(trigger)) continue;

        // passive_while_* は条件チェックをハンドラ内で行われる
        s = handler(s, team, char.id, context);
      }
    }
  }

  return s;
}

/**
 * passive_always / passive_while_active / passive_while_bench などの
 * 「常時系」パッシブを再評価して状態を更新する。
 * ターン開始・スキル使用後・交代後などに呼ぶ。
 */
export function evaluateAlwaysPassives(state: BattleState): BattleState {
  let s = state;
  for (const trigger of [
    'passive_always',
    'passive_while_active',
    'passive_while_bench',
    'passive_while_buff',
    'passive_while_resource_above',
  ] as PassiveTrigger[]) {
    s = triggerPassives(s, trigger);
  }
  return s;
}
