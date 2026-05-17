import { describe, it, expect } from 'vitest';
import { createTeamState, createInitialBattleState, processAction } from './battle-engine';
import { getActive } from './battle-engine';

describe('ディール (Deal) キャラクターテスト', () => {
  it('ディールを編成して初期ステートを作成し、先頭選択できる', () => {
    const team1 = createTeamState('player1', ['char_deal', 'char_fighter', 'char_mage']);
    const team2 = createTeamState('player2', ['char_fighter', 'char_mage', 'char_deal']);
    let state = createInitialBattleState(team1, team2);

    expect(state.phase).toBe('selecting_first');

    // 先頭キャラ選択
    state = processAction(state, { type: 'select_first', characterIndex: 0 }, 'team1');
    state = processAction(state, { type: 'select_first', characterIndex: 0 }, 'team2');

    expect(state.phase).toBe('action');

    const activeTeam1 = getActive(state, 'team1');
    expect(activeTeam1.id).toBe('char_deal');
    
    // 手札が3枚あることを確認
    const hand = activeTeam1.battleFlags['hand_cards'] as any[];
    expect(hand).toBeDefined();
    expect(hand.length).toBe(3);

    // 引き直し回数がデフォルトで1であることを確認
    const redrawRes = activeTeam1.customResources.find(r => r.id === 'redraw_count');
    expect(redrawRes?.value).toBe(1);
  });

  it('ドロー(S1)を使用すると引き直し回数が減り、派生スキルが解放される。派生スキルを使うと手札が更新され残りの派生スキルは消える', () => {
    const team1 = createTeamState('player1', ['char_deal', 'char_fighter']);
    const team2 = createTeamState('player2', ['char_fighter', 'char_mage']);
    let state = createInitialBattleState(team1, team2);
    state = processAction(state, { type: 'select_first', characterIndex: 0 }, 'team1');
    state = processAction(state, { type: 'select_first', characterIndex: 0 }, 'team2');

    // ドローを使用
    state = processAction(state, { type: 'use_skill', skillId: 'char_deal_s1_draw' }, 'team1');

    // 引き直し回数が0になったことを確認
    const activeAfter = getActive(state, 'team1');
    const redrawRes = activeAfter.customResources.find(r => r.id === 'redraw_count');
    expect(redrawRes?.value).toBe(0);

    // 派生スキルが解放されたことを確認
    const unlocked = activeAfter.unlockedDerivedSkills.map(u => u.skillId);
    expect(unlocked).toContain('char_deal_s1_d1_red');
    expect(unlocked).toContain('char_deal_s1_d2_blue');
    expect(unlocked).toContain('char_deal_s1_d3_green');

    // 「赤を引く」を使用
    state = processAction(state, { type: 'use_skill', skillId: 'char_deal_s1_d1_red' }, 'team1');

    // 手札が変わっていることを確認
    const activeAfterDraw = getActive(state, 'team1');
    const handAfter = activeAfterDraw.battleFlags['hand_cards'] as any[];
    expect(handAfter.length).toBe(3);
    
    // 派生スキル「青を引く」「緑を引く」が消えていることを確認
    const unlockedAfterDraw = activeAfterDraw.unlockedDerivedSkills.map(u => u.skillId);
    expect(unlockedAfterDraw).not.toContain('char_deal_s1_d2_blue');
    expect(unlockedAfterDraw).not.toContain('char_deal_s1_d3_green');
  });

  it('イカサマ(S6)を使用すると自傷ダメージを受け、指定された役が手札に仕込まれる', () => {
    const team1 = createTeamState('player1', ['char_deal', 'char_fighter']);
    const team2 = createTeamState('player2', ['char_fighter', 'char_mage']);
    let state = createInitialBattleState(team1, team2);
    state = processAction(state, { type: 'select_first', characterIndex: 0 }, 'team1');
    state = processAction(state, { type: 'select_first', characterIndex: 0 }, 'team2');

    const activeBefore = getActive(state, 'team1');
    const initialHp = activeBefore.hp;

    // イカサマを使用
    state = processAction(state, { type: 'use_skill', skillId: 'char_deal_s6_cheating' }, 'team1');

    const activeAfter = getActive(state, 'team1');
    // 最大HPの5%の自傷ダメージ (1050 * 0.05 = 52.5 -> 切り捨て52)
    expect(activeAfter.hp).toBe(initialHp - 52);

    // イカサマフラグが立っていることを確認
    expect(activeAfter.battleFlags['is_cheating']).toBe(true);
  });

  it('手札にジョーカーがある状態で派生ドローを使用した場合、ジョーカーは破棄されない', () => {
    const team1 = createTeamState('player1', ['char_deal', 'char_fighter']);
    const team2 = createTeamState('player2', ['char_fighter', 'char_mage']);
    let state = createInitialBattleState(team1, team2);
    state = processAction(state, { type: 'select_first', characterIndex: 0 }, 'team1');
    state = processAction(state, { type: 'select_first', characterIndex: 0 }, 'team2');

    // 手札を強制的に [ジョーカー, 赤3, 赤4] に設定
    state = {
      ...state,
      team1: {
        ...state.team1,
        characters: state.team1.characters.map(c => {
          if (c.id === 'char_deal') {
            return {
              ...c,
              battleFlags: {
                ...c.battleFlags,
                hand_cards: [
                  { num: 0, color: 0, isJoker: true },
                  { num: 3, color: 1 },
                  { num: 4, color: 1 }
                ]
              }
            };
          }
          return c;
        })
      }
    };

    // ドローを使用
    state = processAction(state, { type: 'use_skill', skillId: 'char_deal_s1_draw' }, 'team1');
    // 「青を引く」を使用
    state = processAction(state, { type: 'use_skill', skillId: 'char_deal_s1_d2_blue' }, 'team1');

    // ジョーカーが破棄されずに残っていることを確認する
    const activeChar = getActive(state, 'team1');
    const hand = activeChar.battleFlags['hand_cards'] as any[];
    expect(hand.some(c => c.isJoker)).toBe(true);
  });

  it('引き直し回数(redraw_count)が0のとき、ドロー(S1)スキルは使用不可(disabledSkills)に含まれる', () => {
    const team1 = createTeamState('player1', ['char_deal', 'char_fighter']);
    const team2 = createTeamState('player2', ['char_fighter', 'char_mage']);
    let state = createInitialBattleState(team1, team2);
    state = processAction(state, { type: 'select_first', characterIndex: 0 }, 'team1');
    state = processAction(state, { type: 'select_first', characterIndex: 0 }, 'team2');

    // 最初は引き直し回数1なので、使用不可に含まれない
    let activeChar = getActive(state, 'team1');
    expect(activeChar.disabledSkills).not.toContain('char_deal_s1_draw');

    // ドローを使用
    state = processAction(state, { type: 'use_skill', skillId: 'char_deal_s1_draw' }, 'team1');

    // 引き直し回数が0になったので、使用不可に含まれる
    activeChar = getActive(state, 'team1');
    expect(activeChar.disabledSkills).toContain('char_deal_s1_draw');
  });
});
