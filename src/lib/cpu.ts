import type { BattleState, PlayerAction, Team } from '../types';
import {
  getActive,
  getAllCharacterData,
  processAction,
} from './battle-engine';

// ============================================================
// CPU ロジック（ランダム・ソロモード用）
// ============================================================

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 使用可能なスキルID一覧を返す */
function getAvailableSkillIds(state: BattleState, team: Team): string[] {
  const active = getActive(state, team);
  const charData = getAllCharacterData().find((d) => d.id === active.id);
  if (!charData) return [];

  const baseSkillIds = charData.skills
    .filter(
      (s) =>
        s.cost <= state.remainingCost &&
        !active.disabledSkills.includes(s.id)
    )
    .map((s) => s.id);

  const unlockedDerivedIds = active.unlockedDerivedSkills
    .filter((u) => u.available !== 'next_turn')
    .map((u) => u.skillId)
    .filter((id) => {
      const ds = charData.derived_skills.find((d) => d.id === id);
      return (
        ds &&
        ds.cost <= state.remainingCost &&
        !active.disabledSkills.includes(id)
      );
    });

  return [...baseSkillIds, ...unlockedDerivedIds];
}

/** 先頭選択（ランダム） */
export function cpuSelectFirst(state: BattleState, cpuTeam: Team): BattleState {
  const aliveIndices = state[cpuTeam].characters
    .map((c, i) => (c.isAlive ? i : -1))
    .filter((i) => i >= 0);
  const idx = aliveIndices[randomInt(0, aliveIndices.length - 1)];
  const action: PlayerAction = { type: 'select_first', characterIndex: idx };
  return processAction(state, action, cpuTeam);
}

/** 次キャラ選択（ランダム） */
export function cpuSelectNext(state: BattleState, cpuTeam: Team): BattleState {
  const aliveIndices = state[cpuTeam].characters
    .map((c, i) => (c.isAlive && !c.isActive ? i : -1))
    .filter((i) => i >= 0);
  const idx = aliveIndices[randomInt(0, aliveIndices.length - 1)];
  const action: PlayerAction = { type: 'select_next', characterIndex: idx };
  return processAction(state, action, cpuTeam);
}

/**
 * CPUの1アクションを処理する。
 * コストが0になるまで or ランダムにスキルを使い、終了する。
 */
export function cpuTakeTurn(
  state: BattleState,
  cpuTeam: Team
): BattleState {
  let s = state;

  // 1. キャラクター選出フェーズ
  if (s.phase === 'selecting_first') {
    return cpuSelectFirst(s, cpuTeam);
  }
  if (s.phase === 'selecting_next') {
    return cpuSelectNext(s, cpuTeam);
  }

  // 2. アクションフェーズ
  while (s.phase === 'action' && s.currentTurn === cpuTeam) {
    const availableSkills = getAvailableSkillIds(s, cpuTeam);

    // コストが0 or 使えるスキルなし → ターン終了
    if (s.remainingCost === 0 || availableSkills.length === 0) {
      s = processAction(s, { type: 'end_turn' }, cpuTeam);
      break;
    }

    // 確率でターン終了する処理を削除し、必ずスキルを使えるだけ使うようにする

    // ランダムにスキル使用
    const skillId = availableSkills[randomInt(0, availableSkills.length - 1)];
    try {
      s = processAction(s, { type: 'use_skill', skillId }, cpuTeam);
    } catch {
      // コスト不足などでスキル使用失敗 → ターン終了
      s = processAction(s, { type: 'end_turn' }, cpuTeam);
      break;
    }

    // 敵を倒した or フェーズが変わった
    if (s.phase !== 'action' || s.currentTurn !== cpuTeam) break;
  }

  return s;
}
