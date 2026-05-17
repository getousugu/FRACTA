import { describe, it, expect } from 'vitest';
import { createCharacterState, createTeamState, createInitialBattleState } from './battle-engine';

describe('バトルエンジン', () => {
  it('キャラクターステートを作成できる', () => {
    const charData = {
      id: 'test_char',
      name: 'テストキャラ',
      element: 'fire' as const,
      hp: 1000,
      atk: 100,
      def: 50,
      custom_resources: [],
      passives: [],
      skills: [],
      derived_skills: [],
    };

    const state = createCharacterState(charData);

    expect(state.id).toBe('test_char');
    expect(state.name).toBe('テストキャラ');
    expect(state.hp).toBe(1000);
    expect(state.maxHp).toBe(1000);
    expect(state.atk).toBe(100);
    expect(state.def).toBe(50);
    expect(state.isAlive).toBe(true);
    expect(state.isActive).toBe(false);
  });

  it('チームステートを作成できる', () => {
    const teamState = createTeamState('player', ['char_fighter', 'char_mage']);

    expect(teamState.playerId).toBe('player');
    expect(teamState.characters).toHaveLength(2);
    expect(teamState.activeIndex).toBe(0);
  });

  it('初期バトルステートを作成できる', () => {
    const team1 = createTeamState('team1', ['char_fighter']);
    const team2 = createTeamState('team2', ['char_mage']);
    const battleState = createInitialBattleState(team1, team2);

    expect(battleState.phase).toBe('selecting_first');
    expect(battleState.turn).toBe(0);
    expect(battleState.remainingCost).toBe(0);
    expect(battleState.winner).toBe(null);
  });
});
