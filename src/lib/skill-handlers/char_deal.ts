import type {
  BattleState,
  Team,
  CharacterState,
  SkillHandler,
  PassiveHandler,
} from '../../types';
import { calcDamage } from '../damage';
import { applyEffect } from '../effects';
import { triggerPassives } from '../passives';

type Card = { num: number; color: number }; // color: 1=赤, 2=青, 3=緑

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

function dealDamageToBench(
  state: BattleState,
  actorTeam: Team,
  damage: number
): BattleState {
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  return {
    ...state,
    [enemyTeam]: {
      ...state[enemyTeam],
      characters: state[enemyTeam].characters.map((c, i) => {
        if (i === state[enemyTeam].activeIndex || !c.isAlive) return c;
        return { ...c, hp: Math.max(0, c.hp - damage), isAlive: c.hp - damage > 0 };
      })
    }
  };
}

function heal(state: BattleState, team: Team, amount: number): BattleState {
  const char = getActive(state, team);
  const newHp = Math.min(char.maxHp, char.hp + amount);
  return updateActiveChar(state, team, (c) => ({ ...c, hp: newHp }));
}

function healAll(state: BattleState, team: Team, amount: number): BattleState {
  return {
    ...state,
    [team]: {
      ...state[team],
      characters: state[team].characters.map(c => {
        if (!c.isAlive) return c;
        return { ...c, hp: Math.min(c.maxHp, c.hp + amount) };
      })
    }
  };
}

// 手札の同期
function syncHandCards(char: CharacterState): CharacterState {
  const cards = (char.battleFlags['hand_cards'] as Card[]) ?? [];
  let numericValue = 0;
  for (const c of cards) {
    numericValue = numericValue * 100 + (c.num * 10 + c.color);
  }

  const colorNames = ['', '赤', '青', '緑'];
  const text = cards.length > 0
    ? cards.map(c => `${colorNames[c.color]}${c.num}`).join(' ')
    : 'なし';

  let nextChar = setResource(char, 'hand_cards', numericValue, true);
  nextChar = {
    ...nextChar,
    customResources: nextChar.customResources.map(r => {
      if (r.id !== 'hand_cards') return r;
      return { ...r, display_value: text };
    })
  };
  return nextChar;
}

// ドロー処理
function drawCard(): Card {
  const num = Math.floor(Math.random() * 5) + 1;
  const color = Math.floor(Math.random() * 3) + 1;
  return { num, color };
}

// 指定の役を満たす手札カードのランダム生成
function generateHandForRole(role: string): Card[] {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const cards = [
      { num: Math.floor(Math.random() * 5) + 1, color: Math.floor(Math.random() * 3) + 1 },
      { num: Math.floor(Math.random() * 5) + 1, color: Math.floor(Math.random() * 3) + 1 },
      { num: Math.floor(Math.random() * 5) + 1, color: Math.floor(Math.random() * 3) + 1 }
    ];

    if (
      (cards[0].num === cards[1].num && cards[0].color === cards[1].color) ||
      (cards[1].num === cards[2].num && cards[1].color === cards[2].color) ||
      (cards[0].num === cards[2].num && cards[0].color === cards[2].color)
    ) {
      continue;
    }

    const roles = evaluateHand(cards);

    if (role === 'ブタ' && roles.includes('ブタ') && roles.length === 1) return cards;
    if (role === 'ワンペア' && roles.some(r => r.startsWith('ワンペア'))) return cards;
    if (role === 'レインボー' && roles.includes('レインボー')) return cards;
    if (role === 'フラッシュ' && roles.some(r => r.startsWith('フラッシュ'))) return cards;
    if (role === 'ストレート' && roles.includes('ストレート')) return cards;
    if (role === 'スリーカード' && roles.includes('スリーカード')) return cards;
    if (role === 'ストレートフラッシュ' && roles.includes('ストレートフラッシュ')) return cards;
  }

  return [
    { num: 1, color: 1 },
    { num: 2, color: 2 },
    { num: 3, color: 3 }
  ];
}

// 役判定
function evaluateHand(cards: Card[]): string[] {
  if (cards.length < 3) return ['ブタ'];

  const numMap: Record<number, number> = {};
  const colorMap: Record<number, number> = {};
  for (const c of cards) {
    numMap[c.num] = (numMap[c.num] ?? 0) + 1;
    colorMap[c.color] = (colorMap[c.color] ?? 0) + 1;
  }

  const nums = cards.map(c => c.num).sort((a, b) => a - b);
  const colors = cards.map(c => c.color);

  // 1. スリーカード
  const isThreeCard = Object.values(numMap).some(count => count === 3);

  // 2. ストレート
  const isStraight = (nums[1] - nums[0] === 1) && (nums[2] - nums[1] === 1);

  // 3. フラッシュ
  const isFlash = Object.values(colorMap).some(count => count === 3);

  // 4. ストレートフラッシュ
  if (isStraight && isFlash) {
    return ['ストレートフラッシュ'];
  }

  const roles: string[] = [];

  if (isThreeCard) {
    roles.push('スリーカード');
  } else if (isStraight) {
    roles.push('ストレート');
  }

  if (isFlash && !isStraight) {
    if (colors[0] === 1) roles.push('フラッシュ赤');
    else if (colors[0] === 2) roles.push('フラッシュ青');
    else if (colors[0] === 3) roles.push('フラッシュ緑');
  }

  const isRainbow = Object.keys(colorMap).length === 3;
  if (isRainbow) {
    roles.push('レインボー');
  }

  if (!isThreeCard) {
    const pairNumStr = Object.keys(numMap).find(n => numMap[Number(n)] === 2);
    if (pairNumStr !== undefined) {
      const pairNum = Number(pairNumStr);
      const pairCards = cards.filter(c => c.num === pairNum);
      if (pairCards.some(c => c.color === 1)) roles.push('ワンペア赤');
      if (pairCards.some(c => c.color === 2)) roles.push('ワンペア青');
      if (pairCards.some(c => c.color === 3)) roles.push('ワンペア緑');
    }
  }

  if (roles.length === 0) {
    return ['ブタ'];
  }

  return roles;
}

// 役効果の適用
function applyRoleEffects(
  state: BattleState,
  roles: string[],
  actorTeam: 'team1' | 'team2',
  isInstant: boolean
): BattleState {
  let s = state;
  const actor = getActive(s, actorTeam);
  const enemyTeam = actorTeam === 'team1' ? 'team2' : 'team1';
  const enemy = getActive(s, enemyTeam);

  let totalHeal = 0;
  const maxHealAllowed = Math.floor(actor.maxHp * 0.25);

  const dmgMultiplier = isInstant ? 0.75 : 1.0;

  for (const role of roles) {
    s = addLog(s, `◆ 役成立: ${role}`);

    switch (role) {
      case 'ブタ': {
        s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'redraw_count', 1));
        s = addLog(s, `ブタの効果 → redraw_count+1（最大3）`);
        break;
      }
      case 'ワンペア赤': {
        const mult = 0.8 * dmgMultiplier;
        const dmg = Math.floor(calcDamage(actor, enemy, { multiplier: mult }));
        s = dealDamage(s, actorTeam, dmg);
        s = addLog(s, `ワンペア赤の効果 → ${enemy.name}に${dmg}ダメージ`);
        break;
      }
      case 'ワンペア青': {
        // 相手のATK・DEFを1ターン5%低下
        s = updateActiveChar(s, enemyTeam, (c) =>
          applyEffect(c, {
            id: 'deal_pair_blue_atk_down',
            name: 'ATK低下',
            category: 'stat',
            stat: 'atk',
            value: -0.05,
            mode: 'mul',
            isStackable: false,
            turnsRemaining: 1
          })
        );
        s = updateActiveChar(s, enemyTeam, (c) =>
          applyEffect(c, {
            id: 'deal_pair_blue_def_down',
            name: 'DEF低下',
            category: 'stat',
            stat: 'def',
            value: -0.05,
            mode: 'mul',
            isStackable: false,
            turnsRemaining: 1
          })
        );
        s = addLog(s, `ワンペア青の効果 → ${enemy.name}のATK・DEF5%低下（1ターン）`);
        break;
      }
      case 'ワンペア緑': {
        totalHeal += Math.floor(actor.maxHp * 0.10);
        break;
      }
      case 'レインボー': {
        // ATK・DEFを2ターン10%上昇 ＋ HP10%回復
        s = updateActiveChar(s, actorTeam, (c) =>
          applyEffect(c, {
            id: 'deal_rainbow_atk_up',
            name: 'ATK上昇',
            category: 'stat',
            stat: 'atk',
            value: 0.10,
            mode: 'mul',
            isStackable: false,
            turnsRemaining: 2
          })
        );
        s = updateActiveChar(s, actorTeam, (c) =>
          applyEffect(c, {
            id: 'deal_rainbow_def_up',
            name: 'DEF上昇',
            category: 'stat',
            stat: 'def',
            value: 0.10,
            mode: 'mul',
            isStackable: false,
            turnsRemaining: 2
          })
        );
        totalHeal += Math.floor(actor.maxHp * 0.10);
        s = addLog(s, `レインボーの効果 → ATK・DEF10%上昇（2ターン）`);
        break;
      }
      case 'フラッシュ赤': {
        const mult = 1.5 * dmgMultiplier;
        const dmg = Math.floor(calcDamage(actor, enemy, { multiplier: mult }));
        s = dealDamage(s, actorTeam, dmg);
        s = addLog(s, `フラッシュ赤の効果 → ${enemy.name}に${dmg}ダメージ`);
        break;
      }
      case 'フラッシュ青': {
        s = updateActiveChar(s, enemyTeam, (c) =>
          applyEffect(c, {
            id: 'deal_flash_blue_atk_down',
            name: 'ATK低下',
            category: 'stat',
            stat: 'atk',
            value: -0.10,
            mode: 'mul',
            isStackable: false,
            turnsRemaining: 2
          })
        );
        s = updateActiveChar(s, enemyTeam, (c) =>
          applyEffect(c, {
            id: 'deal_flash_blue_def_down',
            name: 'DEF低下',
            category: 'stat',
            stat: 'def',
            value: -0.10,
            mode: 'mul',
            isStackable: false,
            turnsRemaining: 2
          })
        );
        s = addLog(s, `フラッシュ青の効果 → ${enemy.name}のATK・DEF10%低下（2ターン）`);
        break;
      }
      case 'フラッシュ緑': {
        totalHeal += Math.floor(actor.maxHp * 0.20);
        break;
      }
      case 'ストレート': {
        const mult = 1.2 * dmgMultiplier;
        const dmg = Math.floor(calcDamage(actor, enemy, { multiplier: mult }));
        s = dealDamage(s, actorTeam, dmg);
        s = addLog(s, `ストレートの効果 → ${enemy.name}に${dmg}ダメージ`);

        // 控えに戻る
        const hasNext = s[actorTeam].characters.some(c => c.isAlive && c.id !== actor.id);
        if (hasNext) {
          s = triggerPassives(s, 'on_switch_out');
          const prevActive = getActive(s, actorTeam);
          s = {
            ...s,
            phase: 'selecting_next',
            currentTurn: actorTeam,
            pendingSelectionNext: [],
            battleFlags: {
              ...s.battleFlags,
              resumeTurn: actorTeam === 'team1' ? 'team2' : 'team1',
              resumeUsedSkill: false
            }
          };
          s = addLog(s, `ストレートの効果 → ${prevActive.name}は控えに戻る`);
        }
        break;
      }
      case 'スリーカード': {
        const mult = 2.0 * dmgMultiplier;
        const dmg = Math.floor(calcDamage(actor, enemy, { multiplier: mult }));
        s = dealDamage(s, actorTeam, dmg);
        s = addLog(s, `スリーカードの効果 → ${enemy.name}に${dmg}ダメージ`);
        break;
      }
      case 'ストレートフラッシュ': {
        const mult = 1.5 * dmgMultiplier;
        const dmg = Math.floor(calcDamage(actor, enemy, { multiplier: mult }));
        s = dealDamage(s, actorTeam, dmg);

        // 控え全員に ATK * 0.75 ダメージ
        const benchDmg = Math.floor(calcDamage(actor, enemy, { multiplier: 0.75 }));
        s = dealDamageToBench(s, actorTeam, benchDmg);

        // 味方全体最大HPの8%回復
        s = healAll(s, actorTeam, Math.floor(actor.maxHp * 0.08));

        s = addLog(s, `ストレートフラッシュの効果 → ${enemy.name}に${dmg}ダメージ、敵控えに${benchDmg}ダメージ、味方全体HP8%回復`);
        break;
      }
    }
  }

  // 回復上限の適用
  if (totalHeal > 0) {
    const finalHeal = Math.min(totalHeal, maxHealAllowed);
    s = heal(s, actorTeam, finalHeal);
    s = addLog(s, `回復効果（合計: ${totalHeal}） → 上限適用により ${finalHeal} 回復`);
  }

  return s;
}

// ============================================================
// スキルハンドラ
// ============================================================

/** S1: ドロー */
const deal_s1_draw: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const redraw = getResource(actor, 'redraw_count');
  if (redraw <= 0) return state;

  let s = updateActiveChar(state, actorTeam, (c) => setResource(c, 'redraw_count', -1));
  s = addLog(s, `${actor.name}が「ドロー」を使用 → 派生スキル解放`);
  return s;
};

// 派生スキルでカードを捨てる共通ロジック
function discardAndDraw(char: CharacterState, color: number): CharacterState {
  const cards = [...((char.battleFlags['hand_cards'] as Card[]) ?? [])];

  if (cards.length > 0) {
    const colorMap: Record<number, number> = {};
    for (const c of cards) {
      colorMap[c.color] = (colorMap[c.color] ?? 0) + 1;
    }
    const doubledColorStr = Object.keys(colorMap).find(k => colorMap[Number(k)] === 2);
    let discardIndex = -1;

    if (doubledColorStr !== undefined) {
      const doubledColor = Number(doubledColorStr);
      discardIndex = cards.findIndex(c => c.color !== doubledColor);
    }

    if (discardIndex === -1) {
      let minNum = 999;
      for (let i = 0; i < cards.length; i++) {
        if (cards[i].num < minNum) {
          minNum = cards[i].num;
          discardIndex = i;
        }
      }
    }

    if (discardIndex !== -1) {
      cards.splice(discardIndex, 1);
    }
  }

  const newNum = Math.floor(Math.random() * 5) + 1;
  cards.push({ num: newNum, color });

  const nextChar = {
    ...char,
    battleFlags: {
      ...char.battleFlags,
      hand_cards: cards
    }
  };

  return syncHandCards(nextChar);
}

/** S1派生: 赤を引く */
const deal_s1_d1_red: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  let s = updateActiveChar(state, actorTeam, (c) => discardAndDraw(c, 1));
  const newActive = getActive(s, actorTeam);

  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    unlockedDerivedSkills: c.unlockedDerivedSkills.filter(
      (u) => !['char_deal_s1_d2_blue', 'char_deal_s1_d3_green'].includes(u.skillId)
    )
  }));

  s = addLog(s, `${actor.name}が「赤を引く」を使用 → 手札: ${newActive.customResources.find(r => r.id === 'hand_cards')?.display_value}`);
  return s;
};

/** S1派生: 青を引く */
const deal_s1_d2_blue: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  let s = updateActiveChar(state, actorTeam, (c) => discardAndDraw(c, 2));
  const newActive = getActive(s, actorTeam);

  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    unlockedDerivedSkills: c.unlockedDerivedSkills.filter(
      (u) => !['char_deal_s1_d1_red', 'char_deal_s1_d3_green'].includes(u.skillId)
    )
  }));

  s = addLog(s, `${actor.name}が「青を引く」を使用 → 手札: ${newActive.customResources.find(r => r.id === 'hand_cards')?.display_value}`);
  return s;
};

/** S1派生: 緑を引く */
const deal_s1_d3_green: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  let s = updateActiveChar(state, actorTeam, (c) => discardAndDraw(c, 3));
  const newActive = getActive(s, actorTeam);

  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    unlockedDerivedSkills: c.unlockedDerivedSkills.filter(
      (u) => !['char_deal_s1_d1_red', 'char_deal_s1_d2_blue'].includes(u.skillId)
    )
  }));

  s = addLog(s, `${actor.name}が「緑を引く」を使用 → 手札: ${newActive.customResources.find(r => r.id === 'hand_cards')?.display_value}`);
  return s;
};

/** S2: 全替え */
const deal_s2_redraw_all: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);

  let s = updateActiveChar(state, actorTeam, (c) => {
    const cards = [drawCard(), drawCard(), drawCard()];
    const nextChar = {
      ...c,
      battleFlags: {
        ...c.battleFlags,
        hand_cards: cards
      }
    };
    return syncHandCards(nextChar);
  });

  const newActive = getActive(s, actorTeam);
  const dmg = Math.floor(calcDamage(actor, enemy, { multiplier: 0.6 }));
  s = dealDamage(s, actorTeam, dmg);

  s = addLog(s, `${actor.name}が「全替え」を使用 → ${enemy.name}に${dmg}ダメージ、手札全交換: ${newActive.customResources.find(r => r.id === 'hand_cards')?.display_value}`);
  return s;
};

/** S3: ベット */
const deal_s3_bet: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);

  const dmg = Math.floor(calcDamage(actor, enemy, { multiplier: 1.45 }));
  let s = dealDamage(state, actorTeam, dmg);

  s = addLog(s, `${actor.name}が「ベット」を使用 → ${enemy.name}に${dmg}ダメージ`);
  return s;
};

/** S4: ブラフ */
const deal_s4_bluff: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);

  let s = updateActiveChar(state, actorTeam, (c) =>
    applyEffect(c, {
      id: 'deal_bluff_atk_up',
      name: 'ブラフ',
      category: 'stat',
      stat: 'atk',
      value: 0.05,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 2
    })
  );

  s = updateActiveChar(s, actorTeam, (c) => {
    return {
      ...c,
      battleFlags: {
        ...c.battleFlags,
        pending_redraw_bonus: ((c.battleFlags['pending_redraw_bonus'] as number) ?? 0) + 1
      }
    };
  });

  s = addLog(s, `${actor.name}が「ブラフ」を使用 → ATK5%上昇（2ターン）、次ターンのドロー回数+1`);
  return s;
};

/** S5: インスタントショウダウン */
const deal_s5_instant_showdown: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const cards = (actor.battleFlags['hand_cards'] as Card[]) ?? [];

  let s = addLog(state, `${actor.name}の「インスタントショウダウン」発動！`);
  const roles = evaluateHand(cards);
  s = applyRoleEffects(s, roles, actorTeam, true);

  return s;
};

/** S6: イカサマ */
const deal_s6_cheating: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);

  const selfDamage = Math.floor(actor.maxHp * 0.05);
  const nextHp = Math.max(0, actor.hp - selfDamage);
  let s = updateActiveChar(state, actorTeam, (c) => ({ ...c, hp: nextHp }));

  s = addLog(s, `${actor.name}が「イカサマ」を使用 → 自身の最大HPの5%(${selfDamage})のダメージを受ける`);

  if (nextHp <= 0) {
    s = addLog(s, `${actor.name}はイカサマの反動で倒れた...`);
    return s;
  }

  const role = 'ストレート';

  s = updateActiveChar(s, actorTeam, (c) => {
    const cards = generateHandForRole(role);
    const nextChar = {
      ...c,
      battleFlags: {
        ...c.battleFlags,
        hand_cards: cards
      }
    };
    return syncHandCards(nextChar);
  });

  const newActive = getActive(s, actorTeam);
  s = addLog(s, `${actor.name}のイカサマ成功！ 役【${role}】を仕込んだ → 手札: ${newActive.customResources.find(r => r.id === 'hand_cards')?.display_value}`);

  return s;
};

export const char_deal_skill_handlers: Record<string, SkillHandler> = {
  char_deal_s1_draw: deal_s1_draw,
  char_deal_s1_d1_red: deal_s1_d1_red,
  char_deal_s1_d2_blue: deal_s1_d2_blue,
  char_deal_s1_d3_green: deal_s1_d3_green,
  char_deal_s2_redraw_all: deal_s2_redraw_all,
  char_deal_s3_bet: deal_s3_bet,
  char_deal_s4_bluff: deal_s4_bluff,
  char_deal_s5_instant_showdown: deal_s5_instant_showdown,
  char_deal_s6_cheating: deal_s6_cheating,
};

// ============================================================
// パッシブハンドラ
// ============================================================

/** on_turn_start: ターン開始時ドロー */
const deal_passive_turn_start: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  let s = updateChar(state, ownerTeam, ownerCharId, (c) => {
    const cards = [drawCard(), drawCard(), drawCard()];
    const bonusRedraw = (c.battleFlags['pending_redraw_bonus'] as number) ?? 0;
    const nextRedraw = Math.min(3, 1 + bonusRedraw);

    const nextChar = {
      ...c,
      battleFlags: {
        ...c.battleFlags,
        hand_cards: cards,
        pending_redraw_bonus: 0
      }
    };

    const temp = setResource(nextChar, 'redraw_count', nextRedraw, true);
    return syncHandCards(temp);
  });

  const newChar = s[ownerTeam].characters.find((c) => c.id === ownerCharId)!;
  s = addLog(s, `${char.name}の「ターン開始時ドロー」発動 → 手札: ${newChar.customResources.find(r => r.id === 'hand_cards')?.display_value}`);
  return s;
};

/** on_turn_end: ショウダウン */
const deal_passive_showdown: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  if (state.currentTurn !== ownerTeam) return state;

  const cards = (char.battleFlags['hand_cards'] as Card[]) ?? [];

  let s = addLog(state, `${char.name}の「ショウダウン」発動！`);
  const roles = evaluateHand(cards);
  s = applyRoleEffects(s, roles, ownerTeam, false);

  return s;
};

export const char_deal_passive_handlers: Record<string, PassiveHandler> = {
  char_deal_passive_turn_start_on_turn_start: deal_passive_turn_start,
  char_deal_passive_showdown_on_turn_end: deal_passive_showdown,
};
