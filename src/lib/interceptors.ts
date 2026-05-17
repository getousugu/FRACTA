import type {
  BattleState,
  Team,
  DeathInterceptor,
  CostCarryInterceptor,
} from '../types';

// ============================================================
// インターセプター レジストリ
// ============================================================

const deathInterceptors: Record<string, DeathInterceptor> = {};
const costCarryInterceptors: Record<string, CostCarryInterceptor> = {};

export function registerDeathInterceptor(
  charId: string,
  interceptor: DeathInterceptor
) {
  deathInterceptors[charId] = interceptor;
}

export function registerCostCarryInterceptor(
  charId: string,
  interceptor: CostCarryInterceptor
) {
  costCarryInterceptors[charId] = interceptor;
}

/**
 * 死亡判定処理。DeathInterceptorが登録されていれば先に呼ぶ。
 * prevent=true なら死亡を回避して newState を返す。
 */
export function runDeathCheck(
  state: BattleState,
  dyingCharId: string,
  ownerTeam: Team
): BattleState {
  const interceptor = deathInterceptors[dyingCharId];
  if (interceptor) {
    const { prevent, newState } = interceptor(state, dyingCharId, ownerTeam);
    if (prevent) return newState;
  }

  // デフォルト: isAlive = false にする
  return setCharDead(state, dyingCharId, ownerTeam);
}

function setCharDead(
  state: BattleState,
  charId: string,
  team: Team
): BattleState {
  const teamState = state[team];
  const newChars = teamState.characters.map((c) =>
    c.id === charId ? { ...c, hp: 0, isAlive: false, isActive: false, effects: [] } : c
  );
  return { ...state, [team]: { ...teamState, characters: newChars } };
}

/**
 * ターン終了時の残コスト処理。
 * CostCarryInterceptorが登録されていれば呼ぶ。
 */
export function runCostCarry(
  state: BattleState,
  remainingCost: number,
  ownerTeam: Team
): { carryOver: number; newState: BattleState } {
  const activeChar = state[ownerTeam].characters[state[ownerTeam].activeIndex];
  // アクティブキャラが死亡している場合はインターセプターを呼ばない
  if (!activeChar || !activeChar.isAlive) {
    return { carryOver: 0, newState: state };
  }
  
  const interceptor = costCarryInterceptors[activeChar.id];

  if (interceptor) {
    return interceptor(state, remainingCost, ownerTeam);
  }

  return { carryOver: 0, newState: state };
}
