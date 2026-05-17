import type {
  BattleState,
  Team,
  CharacterState,
  SkillHandler,
  PassiveHandler,
  DeathInterceptor,
} from '../../types';
import { calcDamage, consumeBreakthroughBuff } from '../damage';
import {
  registerDeathInterceptor,
} from '../interceptors';
import { applyEffect } from '../effects';

// ============================================================
// ユーティリティ
// ============================================================
function getActive(state: BattleState, team: Team): CharacterState {
  return state[team].characters[state[team].activeIndex];
}

function getEnemy(state: BattleState, actorTeam: Team): CharacterState {
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  return state[enemyTeam].characters[state[enemyTeam].activeIndex];
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
  damage: number
): BattleState {
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  const enemy = getActive(state, enemyTeam);
  const newHp = Math.max(0, enemy.hp - damage);
  return updateActiveChar(state, enemyTeam, (c) => ({ ...c, hp: newHp }));
}

// ============================================================
// スキルハンドラ
// ============================================================

/** S1: 受け止める */
const s1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const dmg = calcDamage(actor, enemy, { multiplier: 1.0 });

  let s = dealDamage(state, actorTeam, dmg);
  s = addLog(s, `${actor.name}の「受け止める」→ ${enemy.name}に${dmg}ダメージ`);

  // DEF永続1%上昇バフ
  s = updateActiveChar(s, actorTeam, (c) => 
    applyEffect(c, {
      id: 'route_j_def_stack',
      name: 'DEF上昇',
      category: 'stat',
      stat: 'def',
      value: 0.01,
      mode: 'mul',
      isStackable: true,
      turnsRemaining: -1,
    })
  );

  return s;
};

/** S2: 幕引きまでの時間稼ぎ */
const s2: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);

  // 敵陣膠着+1
  let s = updateActiveChar(state, actorTeam, (c) =>
    setResource(c, 'enemy_stagnation', 1)
  );

  // ATK×0.82 × 3回
  let totalDmg = 0;
  for (let i = 0; i < 3; i++) {
    const dmg = calcDamage(getActive(s, actorTeam), getEnemy(s, actorTeam), {
      multiplier: 0.82,
    });
    totalDmg += dmg;
    s = dealDamage(s, actorTeam, dmg);
  }
  s = addLog(
    s,
    `${actor.name}の「幕引きまでの時間稼ぎ」→ ${enemy.name}に3連撃${totalDmg}ダメージ、敵陣膠着+1`
  );

  return s;
};

/** S2派生: まだ終わりは遠い */
const s2d1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';

  // 死の宣告+1
  let s = updateActiveChar(state, actorTeam, (c) =>
    setResource(c, 'death_sentence', 1)
  );

  // DEF 15%上昇 3ターン
  s = updateActiveChar(s, actorTeam, (c) => 
    applyEffect(c, {
      id: 'route_j_def_up',
      name: 'DEF上昇',
      category: 'stat',
      stat: 'def',
      value: 0.15,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 3,
    })
  );

  // 相手優先度-1デバフ 2ターン
  s = updateActiveChar(s, enemyTeam, (c) =>
    applyEffect(c, {
      id: 'route_j_priority_down',
      name: '優先度低下',
      category: 'stat',
      stat: 'priority',
      value: -1,
      mode: 'add',
      isStackable: false,
      turnsRemaining: 2,
    })
  );

  // 優先度が変化したことをマーク
  s = { ...s, battleFlags: { ...s.battleFlags, priorityChanged: true } };

  s = addLog(
    s,
    `${actor.name}の「まだ終わりは遠い」→ DEF+15%(3T)、相手優先度-1(2T)、死の宣告+1`
  );
  return s;
};

/** S3: ジョーカーへ告ぐ */
const s3: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);

  // S3の累計増加を battleFlags で管理
  const currentAdded = (actor.battleFlags['s3_death_sentence_added'] as number) ?? 0;
  const remaining = 14 - currentAdded;
  const actualAdd = Math.min(5, remaining);

  let s = updateActiveChar(state, actorTeam, (c) => {
    let nc = setResource(c, 'death_sentence', actualAdd);
    nc = {
      ...nc,
      battleFlags: {
        ...nc.battleFlags,
        s3_death_sentence_added: currentAdded + actualAdd,
      },
    };
    return nc;
  });

  // 食いしばり（未使用の場合のみ）
  const tenacity = getResource(getActive(s, actorTeam), 'tenacity');
  const tenacityUsed = getActive(s, actorTeam).battleFlags['tenacity_used'] as boolean ?? false;
  if (tenacity < 1 && !tenacityUsed) {
    s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'tenacity', 1));
  }

  // ダメージ: ATK×(1.2 + 死の宣告×0.1)
  const deathCount = getResource(getActive(s, actorTeam), 'death_sentence');
  const multiplier = 1.2 + deathCount * 0.1;
  const dmg = calcDamage(getActive(s, actorTeam), getEnemy(s, actorTeam), { multiplier });
  s = dealDamage(s, actorTeam, dmg);

  // 敵陣突破バフ消費
  s = updateActiveChar(s, actorTeam, consumeBreakthroughBuff);

  s = addLog(
    s,
    `${actor.name}の「ジョーカーへ告ぐ」→ ${enemy.name}に${dmg}ダメージ(死の宣告${deathCount}×10%)、食いしばり取得、死の宣告+${actualAdd}`
  );
  return s;
};

/** S4: 芽生えた意識 */
const s4: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);

  // 死の宣告-2、敵陣膠着-1
  let s = updateActiveChar(state, actorTeam, (c) => {
    let nc = setResource(c, 'death_sentence', -2);
    nc = setResource(nc, 'enemy_stagnation', -1);
    return nc;
  });

  // ATK 20%上昇 2ターン
  s = updateActiveChar(s, actorTeam, (c) => 
    applyEffect(c, {
      id: 'route_j_atk_up',
      name: 'ATK上昇',
      category: 'stat',
      stat: 'atk',
      value: 0.2,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 2,
    })
  );

  s = addLog(
    s,
    `${actor.name}の「芽生えた意識」→ 死の宣告-2、敵陣膠着-1、ATK+20%(2T)`
  );
  return s;
};

/** S4派生: 果たせなかった役目 */
const s4d1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);

  // HP -10%
  let s = updateActiveChar(state, actorTeam, (c) => ({
    ...c,
    hp: Math.max(1, c.hp - Math.round(c.maxHp * 0.1)),
  }));

  // 死の宣告+3
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'death_sentence', 3));

  // ATK×1.5ダメージ
  const dmg = calcDamage(getActive(s, actorTeam), getEnemy(s, actorTeam), {
    multiplier: 1.5,
  });
  s = dealDamage(s, actorTeam, dmg);

  // S4 と S4-d1 を使用不可に
  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    disabledSkills: [
      ...c.disabledSkills,
      'char_route_j_s4',
      'char_route_j_s4_d1',
    ],
  }));

  s = addLog(
    s,
    `${actor.name}の「果たせなかった役目」→ ${enemy.name}に${dmg}ダメージ、HP-10%、死の宣告+3、S4封印`
  );
  return s;
};

// ============================================================
// パッシブハンドラ
// ============================================================

/** on_switch_in: 死の宣告・敵陣膠着+1 */
const passive_on_switch_in: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  let s = updateChar(state, ownerTeam, ownerCharId, (c) => {
    let nc = setResource(c, 'death_sentence', 1);
    nc = setResource(nc, 'enemy_stagnation', 1);
    return nc;
  });
  s = addLog(s, `${char.name}が場に出た → 死の宣告・敵陣膠着+1`);
  return s;
};

/** on_turn_start: 死の宣告・敵陣膠着+1 */
const passive_on_turn_start: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive || state.currentTurn !== ownerTeam) return state;

  return updateChar(state, ownerTeam, ownerCharId, (c) => {
    let nc = setResource(c, 'death_sentence', 1);
    nc = setResource(nc, 'enemy_stagnation', 1);
    return nc;
  });
};

/** passive_while_active: 敵陣膠着によるダメージ軽減（ダメージ計算時に damage.ts が参照する） */
// → damage.ts 内で customResource.enemy_stagnation を直接参照するため、ここではno-op
const passive_while_active: PassiveHandler = (state) => state;

/** on_switch_out: 敵陣突破バフを次のキャラに付与 */
const passive_on_switch_out: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char) return state;

  const stagnation = getResource(char, 'enemy_stagnation');
  if (stagnation <= 0) return state;

  // 次の生存キャラを探す（activeIndex はまだ切り替わる前）
  // バトルエンジン側が switch_out → switch_in の順で呼ぶことを前提とする
  // ここでは ownerTeam のキャラ全員に対してバフをセットする用意だけする
  // 実際には on_switch_in 時に発動すべきだが、switch_outのタイミングで「次のキャラ」は
  // まだ確定していないため、チームの「次に出るキャラ」フラグを立てる形にする
  let s = state;
  // 次のキャラに付与（バトルエンジンが select_next/switch でactiveIndexを更新した後に
  // エンジン側から直接このバフを付与するため、ここでは stagnation 値を battleFlags に記録）
  s = updateChar(s, ownerTeam, ownerCharId, (c) => ({
    ...c,
    battleFlags: { ...c.battleFlags, pending_breakthrough: stagnation },
  }));
  return s;
};

/** on_turn_end: 死の宣告が15なら死亡 */
const passive_on_turn_end: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  if (state.currentTurn !== ownerTeam) return state;
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isAlive) return state;

  const deathCount = getResource(char, 'death_sentence');
  if (deathCount < 15) return state;

  let s = updateChar(state, ownerTeam, ownerCharId, (c) => ({
    ...c,
    hp: 0,
  }));
  s = addLog(s, `${char.name}の死の宣告が15に達し、力尽きた`);
  return s;
};

// ============================================================
// DeathInterceptor: 食いしばり
// ============================================================
const deathInterceptor: DeathInterceptor = (state, dyingCharId, ownerTeam) => {
  const char = state[ownerTeam].characters.find((c) => c.id === dyingCharId);
  if (!char) return { prevent: false, newState: state };

  const tenacity = getResource(char, 'tenacity');
  if (tenacity <= 0) return { prevent: false, newState: state };

  // 食いしばり発動: HP=1、tenacity=0
  let newState = updateChar(state, ownerTeam, dyingCharId, (c) => {
    let nc = { ...c, hp: 1 };
    nc = setResource(nc, 'tenacity', 0, true);
    nc = { ...nc, battleFlags: { ...nc.battleFlags, tenacity_used: true } };
    return nc;
  });
  newState = addLog(newState, `${char.name}の食いしばり発動！ HP1で耐えた`);
  return { prevent: true, newState };
};

// ============================================================
// エクスポート
// ============================================================
export const char_route_j_skill_handlers: Record<string, SkillHandler> = {
  char_route_j_s1: s1,
  char_route_j_s2: s2,
  char_route_j_s2_d1: s2d1,
  char_route_j_s3: s3,
  char_route_j_s4: s4,
  char_route_j_s4_d1: s4d1,
};

export const char_route_j_passive_handlers: Record<string, PassiveHandler> = {
  char_route_j_passive_switch_in_on_switch_in: passive_on_switch_in,
  char_route_j_passive_turn_start_on_turn_start: passive_on_turn_start,
  char_route_j_passive_damage_reduce_passive_while_active: passive_while_active,
  char_route_j_passive_switch_out_on_switch_out: passive_on_switch_out,
  char_route_j_passive_death_judgment_on_turn_end: passive_on_turn_end,
};

// 起動時に登録
registerDeathInterceptor('char_route_j', deathInterceptor);
