// ============================================================
// 基本型
// ============================================================
export type Element = 'fire' | 'water' | 'grass' | 'light' | 'dark' | 'none';
export type ResourceDisplay = 'stack' | 'gauge';

export const ELEMENT_EMOJI: Record<Element, string> = {
  fire: '🔥',
  water: '💧',
  grass: '🌿',
  light: '✨',
  dark: '🌑',
  none: '⬜',
};
export type CustomResource = {
  id: string;
  name: string;
  value: number;
  min: number;
  max: number;
  display: ResourceDisplay;
  display_value?: string;
};

export type EffectCategory = 'stat' | 'dot' | 'regen' | 'cc' | 'special';

export type StatusEffect = {
  id: string;
  name: string;
  category: EffectCategory;
  stat?: 'atk' | 'def' | 'priority' | 'hp';
  value: number;
  mode: 'add' | 'mul';
  turnsRemaining: number; // -1 for permanent
  isStackable: boolean;
  maxStacks?: number;
  currentStacks: number;
};

export type DerivedSkillAvailability = 'same_turn' | 'next_turn' | 'permanent';

export type UnlockedSkill = {
  skillId: string;
  available: DerivedSkillAvailability;
};

// ============================================================
// キャラクター状態
// ============================================================
export type CharacterState = {
  id: string;
  name: string;
  element: Element;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  customResources: CustomResource[];
  effects: StatusEffect[]; // 統合されたステータス効果
  unlockedDerivedSkills: UnlockedSkill[];
  priority: number;
  isAlive: boolean;
  isActive: boolean;
  /** スキルハンドラが使うキャラ固有の一時フラグ（型はキャラごとに自由） */
  battleFlags: Record<string, unknown>;
  /** この戦闘中使用不可になったスキルID一覧 */
  disabledSkills: string[];
  /** 1ターン内のスキル使用回数 */
  skillUsagePerTurn: Record<string, number>;
};

export type TeamState = {
  playerId: string;
  activeIndex: number;
  characters: CharacterState[];
};

// ============================================================
// バトル状態
// ============================================================
export type BattlePhase =
  | 'waiting'
  | 'selecting_first'
  | 'action'
  | 'selecting_next'
  | 'finished';

export type BattleLogEntry = {
  turn: number;
  actor: 'team1' | 'team2' | 'system';
  description: string;
};

export type BattleState = {
  team1: TeamState;
  team2: TeamState;
  turn: number;
  currentTurn: 'team1' | 'team2';
  phase: BattlePhase;
  remainingCost: number;
  usedSkillThisTurn: boolean;
  winner: 'team1' | 'team2' | null;
  /** 直近50件のみ保持 */
  log: BattleLogEntry[];
  /** 次にキャラ選択が必要なチームのキュー */
  pendingSelectionNext: Team[];
  /** 死亡判定が起きた時の攻撃側チーム（相打ち解決用） */
  attackerAtDeath?: Team;
  /** バトル全体のフラグ（コイントス結果など） */
  battleFlags: {
    initialFirstTurn: 'team1' | 'team2';
    priorityChanged: boolean;
    resumeTurn?: Team;
    resumeUsedSkill?: boolean;
    [key: string]: unknown;
  };
};

// ============================================================
// プレイヤーアクション
// ============================================================
export type PlayerAction =
  | { type: 'select_first'; characterIndex: number }
  | { type: 'use_skill'; skillId: string }
  | { type: 'switch_character'; characterIndex: number }
  | { type: 'end_turn' }
  | { type: 'select_next'; characterIndex: number };

// ============================================================
// キャラクターマスターデータ（JSON由来）
// ============================================================
export type SkillUnlock = {
  skillId: string;
  available: DerivedSkillAvailability;
};

export type SkillData = {
  id: string;
  name: string;
  cost: number;
  description: string;
  flavor_text?: string;
  max_uses_per_turn?: number;
  unlocks: SkillUnlock[];
};

export type DerivedSkillData = {
  id: string;
  name: string;
  cost: number;
  description: string;
  flavor_text?: string;
  max_uses_per_turn?: number;
  unlocked_by: string;
  available: DerivedSkillAvailability;
  unlocks?: SkillUnlock[];
};

export type PassiveCondition =
  | { buffId: string }
  | { resourceId: string; threshold: number };

export type PassiveData = {
  id: string;
  name: string;
  trigger: string;
  description: string;
  flavor_text?: string;
  condition?: PassiveCondition;
};

export type CustomResourceData = {
  id: string;
  name: string;
  initial_value: number;
  min: number;
  max: number;
  display: ResourceDisplay;
};

export type CharacterData = {
  id: string;
  name: string;
  element: Element;
  hp: number;
  atk: number;
  def: number;
  flavor_text?: string;
  custom_resources: CustomResourceData[];
  passives: PassiveData[];
  skills: SkillData[];
  derived_skills: DerivedSkillData[];
};

// ============================================================
// ハンドラ型
// ============================================================
export type SkillHandler = (
  state: BattleState,
  actorTeam: 'team1' | 'team2'
) => BattleState;

export type PassiveHandler = (
  state: BattleState,
  ownerTeam: 'team1' | 'team2',
  ownerCharId: string,
  context?: {
    dyingCharId?: string;
    targetCharId?: string;
    damage?: number;
  }
) => BattleState;

export type DeathInterceptor = (
  state: BattleState,
  dyingCharId: string,
  ownerTeam: 'team1' | 'team2'
) => { prevent: boolean; newState: BattleState };

export type CostCarryInterceptor = (
  state: BattleState,
  remainingCost: number,
  ownerTeam: 'team1' | 'team2'
) => { carryOver: number; newState: BattleState };

// ============================================================
// P2P メッセージ型
// ============================================================
export type P2PMessageType =
  | 'lobby_team_locked'
  | 'lobby_team_cancel'
  | 'select_first'
  | 'action'
  | 'state_update'
  | 'timer_tick'
  | 'error';

export type P2PMessage = {
  type: P2PMessageType;
  payload: unknown;
};

// ============================================================
// ユーティリティ
// ============================================================
export type Team = 'team1' | 'team2';
export function oppositeTeam(team: Team): Team {
  return team === 'team1' ? 'team2' : 'team1';
}
