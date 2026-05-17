import type {
  BattleState,
  Team,
  CharacterState,
  SkillHandler,
  PassiveHandler,
} from '../../types';
import { calcDamage } from '../damage';
import { applyEffect } from '../effects';

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

function heal(state: BattleState, team: Team, amount: number): BattleState {
  const char = getActive(state, team);
  const newHp = Math.min(char.maxHp, char.hp + amount);
  return updateActiveChar(state, team, (c) => ({ ...c, hp: newHp }));
}

// ============================================================
// スキルハンドラ
// ============================================================

/** S1: 射撃用意 */
const s1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const assault = getResource(actor, 'assault_platoon');

  // 突撃小隊を1以上保持しているなら突撃小隊を+1、そうでなければ制圧小隊を+1
  const targetResource = assault > 0 ? 'assault_platoon' : 'suppression_platoon';

  let s = updateActiveChar(state, actorTeam, (c) => {
    let nc = setResource(c, targetResource, 1);
    const prevCount = (nc.battleFlags.platoon_decrease_count as number) || 0;
    nc = {
      ...nc,
      battleFlags: {
        ...nc.battleFlags,
        platoon_decrease_count: prevCount + 1,
      },
    };
    return nc;
  });

  s = addLog(s, `${actor.name}の「射撃用意」→ ${targetResource === 'assault_platoon' ? '突撃小隊' : '制圧小隊'}+1（ターン終了時に-1）`);
  return s;
};

/** S2: 応急処置 */
const s2: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const suppression = getResource(actor, 'suppression_platoon');
  const assault = getResource(actor, 'assault_platoon');

  // 小隊を保持していない場合、効果なし
  if (suppression <= 0 && assault <= 0) {
    return state;
  }

  const targetPlatoonCount = assault > 0 ? assault : suppression;
  const healAmount = targetPlatoonCount * 65;

  let s = heal(state, actorTeam, healAmount);
  s = addLog(s, `${actor.name}の「応急処置」→ ${healAmount}HP回復`);
  return s;
};

/** S3: 集中砲火 */
const s3: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const suppression = getResource(actor, 'suppression_platoon');
  const assault = getResource(actor, 'assault_platoon');

  let multiplier: number;

  if (suppression > 0) {
    multiplier = 0.25;
  } else if (assault > 0) {
    multiplier = 0.35;
  } else {
    return state; // 小隊なし
  }

  let reuseCount = 0;
  if (assault > 0) {
    reuseCount = Math.max(0, assault - 2);
  } else if (suppression > 0) {
    reuseCount = suppression;
  }

  let s = state;
  let totalDmg = 0;
  let defDownApplied = false;

  for (let i = 0; i < 1 + reuseCount; i++) {
    const currentActor = getActive(s, actorTeam);
    const currentEnemy = getActive(s, actorTeam === 'team1' ? 'team2' : 'team1');
    const hitDmg = calcDamage(currentActor, currentEnemy, { multiplier });
    totalDmg += hitDmg;
    s = dealDamage(s, actorTeam, hitDmg);

    if (suppression > 0) {
      if (i === 0) {
        const enemyTeam = actorTeam === 'team1' ? 'team2' : 'team1';
        s = updateChar(s, enemyTeam, currentEnemy.id, (c) =>
          applyEffect(c, {
            id: 'epp_s3_def_down',
            name: 'DEF低下',
            category: 'stat',
            stat: 'def',
            value: -0.15,
            mode: 'mul',
            isStackable: false,
            turnsRemaining: 2,
          })
        );
        defDownApplied = true;
      }
    }
  }

  let logMsg = `${actor.name}の「集中砲火」→ ${enemy.name}に${totalDmg}ダメージ（${1 + reuseCount}Hit）`;
  if (defDownApplied) logMsg += `、DEFが15%低下（2ターン）`;
  s = addLog(s, logMsg);
  return s;
};

/** S4: 戦術先行 */
const s4: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const suppression = getResource(actor, 'suppression_platoon');
  const assault = getResource(actor, 'assault_platoon');

  let s = state;

  if (suppression > 0) {
    // 制圧小隊をすべて突撃小隊に変換
    s = updateActiveChar(s, actorTeam, (c) => {
      let nc = setResource(c, 'suppression_platoon', 0, true);
      nc = setResource(nc, 'assault_platoon', suppression, true);
      // 再使用の対象外フラグを設定
      nc = {
        ...nc,
        battleFlags: {
          ...nc.battleFlags,
          exclude_from_reuse: true,
        },
      };
      return nc;
    });
    s = addLog(s, `${actor.name}の「戦術先行」→ 制圧小隊${suppression}を突撃小隊に変換`);
  } else if (assault > 0) {
    // 突撃小隊をすべて制圧小隊に変換
    s = updateActiveChar(s, actorTeam, (c) => {
      let nc = setResource(c, 'assault_platoon', 0, true);
      nc = setResource(nc, 'suppression_platoon', assault, true);
      // 再使用の対象外フラグを設定
      nc = {
        ...nc,
        battleFlags: {
          ...nc.battleFlags,
          exclude_from_reuse: true,
        },
      };
      return nc;
    });
    s = addLog(s, `${actor.name}の「戦術先行」→ 突撃小隊${assault}を制圧小隊に変換`);
  } else {
    return state; // 小隊なし
  }

  // 次のターンatkが5%上昇
  s = updateActiveChar(s, actorTeam, (c) =>
    applyEffect(c, {
      id: 'epp_s4_atk_up',
      name: 'ATK上昇',
      category: 'stat',
      stat: 'atk',
      value: 0.05,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 1,
    })
  );

  return s;
};

/** S5: 全力突撃 */
const s5: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const assault = getResource(actor, 'assault_platoon');

  // 突撃小隊が3以上の時のみ使用可能
  if (assault < 3) {
    return state;
  }

  const multiplier = assault * 0.4;
  const dmg = calcDamage(actor, enemy, { multiplier, defIgnore: 0.3 });

  let s = dealDamage(state, actorTeam, dmg);
  s = updateActiveChar(s, actorTeam, (c) => setResource(c, 'assault_platoon', 0, true));

  s = addLog(s, `${actor.name}の「全力突撃」→ ${enemy.name}に${dmg}ダメージ（DEF30%無視）、突撃小隊全消費`);
  return s;
};

/** S6: 塹壕構築 */
const s6: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);

  let s = updateActiveChar(state, actorTeam, (c) =>
    applyEffect(c, {
      id: 'epp_s6_damage_reduce',
      name: '被ダメージ軽減',
      category: 'special',
      value: 0.2,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 2,
    })
  );

  // 次の自分のターン開始時、追加で+3
  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    battleFlags: {
      ...c.battleFlags,
      s6_extra_platoon: true,
    },
  }));

  s = addLog(s, `${actor.name}の「塹壕構築」→ 被ダメージ20%軽減（2ターン）、次ターン開始時に小隊+3`);
  return s;
};

/** S1派生: 牽制射撃 */
const s1d1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const suppression = getResource(actor, 'suppression_platoon');
  const assault = getResource(actor, 'assault_platoon');

  let multiplier: number;
  let defIgnore = 0;

  if (suppression > 0) {
    multiplier = 0.17;
  } else if (assault > 0) {
    multiplier = 0.25;
    defIgnore = 0.2;
  } else {
    return state; // 小隊なし
  }

  let reuseCount = 0;
  if (assault > 0) {
    reuseCount = Math.max(0, assault - 2);
  } else if (suppression > 0) {
    reuseCount = suppression;
  }

  let s = state;
  let totalDmg = 0;
  let stacksAdded = 0;

  for (let i = 0; i < 1 + reuseCount; i++) {
    const currentActor = getActive(s, actorTeam);
    const currentEnemy = getActive(s, actorTeam === 'team1' ? 'team2' : 'team1');
    const hitDmg = calcDamage(currentActor, currentEnemy, { multiplier, defIgnore });
    totalDmg += hitDmg;
    s = dealDamage(s, actorTeam, hitDmg);

    if (suppression > 0) {
      const updatedEnemy = getActive(s, actorTeam === 'team1' ? 'team2' : 'team1');
      const currentStacks = updatedEnemy.effects.find((e) => e.id === 'epp_d1_atk_down')?.currentStacks ?? 0;
      if (currentStacks < 3) {
        const enemyTeam = actorTeam === 'team1' ? 'team2' : 'team1';
        s = updateChar(s, enemyTeam, updatedEnemy.id, (c) =>
          applyEffect(c, {
            id: 'epp_d1_atk_down',
            name: 'ATK低下',
            category: 'stat',
            stat: 'atk',
            value: -0.05,
            mode: 'mul',
            isStackable: true,
            maxStacks: 3,
            turnsRemaining: -1,
          })
        );
        stacksAdded++;
      }
    }
  }

  let logMsg = `${actor.name}の「牽制射撃」→ ${enemy.name}に${totalDmg}ダメージ（${1 + reuseCount}Hit）`;
  if (stacksAdded > 0) {
    logMsg += `、ATKが${stacksAdded * 5}%低下`;
  }
  s = addLog(s, logMsg);
  return s;
};

/** S1派生: 制圧射撃 */
const s1d2: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const suppression = getResource(actor, 'suppression_platoon');
  const assault = getResource(actor, 'assault_platoon');

  let multiplier: number;

  if (suppression > 0) {
    multiplier = 0.22;
  } else if (assault > 0) {
    multiplier = 0.40;
  } else {
    return state; // 小隊なし
  }

  let reuseCount = 0;
  if (assault > 0) {
    reuseCount = Math.max(0, assault - 2);
  } else if (suppression > 0) {
    reuseCount = suppression;
  }

  let s = state;
  let totalDmg = 0;
  let dotsAdded = 0;

  for (let i = 0; i < 1 + reuseCount; i++) {
    const currentActor = getActive(s, actorTeam);
    const currentEnemy = getActive(s, actorTeam === 'team1' ? 'team2' : 'team1');
    const hitDmg = calcDamage(currentActor, currentEnemy, { multiplier });
    totalDmg += hitDmg;
    s = dealDamage(s, actorTeam, hitDmg);

    if (suppression > 0) {
      const updatedEnemy = getActive(s, actorTeam === 'team1' ? 'team2' : 'team1');
      const currentStacks = updatedEnemy.effects.find((e) => e.id === 'epp_d2_dot')?.currentStacks ?? 0;
      const maxStacks = 3;
      if (currentStacks < maxStacks) {
        const enemyTeam = actorTeam === 'team1' ? 'team2' : 'team1';
        s = updateChar(s, enemyTeam, updatedEnemy.id, (c) =>
          applyEffect(c, {
            id: 'epp_d2_dot',
            name: 'DoT',
            category: 'dot',
            stat: 'hp',
            value: 20,
            mode: 'add',
            isStackable: true,
            maxStacks: maxStacks,
            turnsRemaining: 2,
          })
        );
        dotsAdded++;
      }
    }
  }

  let logMsg = `${actor.name}の「制圧射撃」→ ${enemy.name}に${totalDmg}ダメージ（${1 + reuseCount}Hit）`;
  if (dotsAdded > 0) {
    logMsg += `、DoTを付与（+${dotsAdded}スタック）`;
  }
  s = addLog(s, logMsg);
  return s;
};

export const char_epp_skill_handlers: Record<string, SkillHandler> = {
  epp_skill_1: s1,
  epp_skill_2: s2,
  epp_skill_3: s3,
  epp_skill_4: s4,
  epp_skill_5: s5,
  epp_skill_6: s6,
  epp_skill_d1: s1d1,
  epp_skill_d2: s1d2,
};

// ============================================================
// パッシブハンドラ
// ============================================================

/** on_turn_start: 永続増殖 - HP110毎に制圧小隊を得る */
const passive_proliferation: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  const assault = getResource(char, 'assault_platoon');
  const targetPlatoon = Math.floor(char.hp / 110);

  // 突撃小隊を1以上保持しているなら突撃小隊を設定、そうでなければ制圧小隊を設定
  const targetResource = assault > 0 ? 'assault_platoon' : 'suppression_platoon';
  const newPlatoon = Math.min(10, targetPlatoon);

  const hasExtraPlatoon = (char.battleFlags['s6_extra_platoon'] as boolean) ?? false;

  let s = state;
  let finalPlatoon = newPlatoon;

  if (hasExtraPlatoon) {
    finalPlatoon = Math.min(10, newPlatoon + 3);
  }

  const currentPlatoon = getResource(char, targetResource);
  
  if (currentPlatoon === finalPlatoon && !hasExtraPlatoon) {
    return state;
  }

  s = updateChar(s, ownerTeam, ownerCharId, (c) => {
    let nc = setResource(c, targetResource, finalPlatoon, true);
    if (hasExtraPlatoon) {
      nc = {
        ...nc,
        battleFlags: {
          ...nc.battleFlags,
          s6_extra_platoon: false,
        },
      };
    }
    return nc;
  });

  if (hasExtraPlatoon) {
    s = addLog(s, `${char.name}の「永続増殖」発動 → ${targetResource === 'assault_platoon' ? '突撃小隊' : '制圧小隊'}を${finalPlatoon}に設定（塹壕構築による+3適用）`);
  } else if (currentPlatoon !== newPlatoon) {
    s = addLog(s, `${char.name}の「永続増殖」発動 → ${targetResource === 'assault_platoon' ? '突撃小隊' : '制圧小隊'}を${finalPlatoon}に設定`);
  }

  return s;
};

/** on_skill_used: 小隊展開 - スキル使用時、制圧小隊の数だけ再使用する */
const passive_platoon_deployment: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  return state;
};

/** passive_while_active: 小隊展開ATKボーナス - 突撃小隊×5だけATKが上昇する（常時） */
const passive_platoon_atk_bonus: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  const assault = getResource(char, 'assault_platoon');

  if (assault <= 0) {
    return updateChar(state, ownerTeam, ownerCharId, (c) => ({
      ...c,
      effects: c.effects.filter((e) => e.id !== 'epp_platoon_atk_bonus'),
    }));
  }

  const atkBonus = assault * 0.05;

  return updateChar(state, ownerTeam, ownerCharId, (c) =>
    applyEffect(c, {
      id: 'epp_platoon_atk_bonus',
      name: '小隊ATKボーナス',
      category: 'stat',
      stat: 'atk',
      value: atkBonus,
      mode: 'add',
      isStackable: false,
      turnsRemaining: -1,
    })
  );
};

/** on_self_death: 無謀な指揮官 - 死亡時にダメージを与える */
const passive_reckless_commander: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char) return state;

  const enemyTeam: Team = ownerTeam === 'team1' ? 'team2' : 'team1';
  const enemyActive = getActive(state, enemyTeam);

  let s = state;

  // 場に出ている相手にそのキャラのMaxHPの45%のダメージを与える
  const damageToActive = Math.floor(enemyActive.maxHp * 0.45);
  s = updateActiveChar(s, enemyTeam, (c) => ({ ...c, hp: Math.max(0, c.hp - damageToActive) }));
  s = addLog(s, `${char.name}の「無謀な指揮官」発動 → ${enemyActive.name}に${damageToActive}ダメージ`);

  // 控えを含むその他すべてのキャラクターに、それぞれのMaxHPの5%のダメージを与える
  for (const team of ['team1', 'team2'] as Team[]) {
    for (const targetChar of s[team].characters) {
      if (team === ownerTeam && targetChar.id === char.id) continue; // 自分は除外
      if (!targetChar.isAlive) continue;

      const damageToChar = Math.floor(targetChar.maxHp * 0.05);
      s = updateChar(s, team, targetChar.id, (c) => ({ ...c, hp: Math.max(0, c.hp - damageToChar) }));
      s = addLog(s, `${targetChar.name}に${damageToChar}ダメージ`);
    }
  }

  return s;
};

/** on_turn_end: 射撃用意のターン終了時減少 */
const passive_turn_end_decrease: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  const decreaseCount = (char.battleFlags['platoon_decrease_count'] as number) ?? 0;
  if (decreaseCount <= 0) return state;

  const suppression = getResource(char, 'suppression_platoon');
  const assault = getResource(char, 'assault_platoon');

  let s = state;

  if (assault > 0) {
    s = updateChar(s, ownerTeam, ownerCharId, (c) => {
      let nc = setResource(c, 'assault_platoon', -decreaseCount);
      nc = {
        ...nc,
        battleFlags: {
          ...nc.battleFlags,
          platoon_decrease_count: 0,
        },
      };
      return nc;
    });
  } else if (suppression > 0) {
    s = updateChar(s, ownerTeam, ownerCharId, (c) => {
      let nc = setResource(c, 'suppression_platoon', -decreaseCount);
      nc = {
        ...nc,
        battleFlags: {
          ...nc.battleFlags,
          platoon_decrease_count: 0,
        },
      };
      return nc;
    });
  }

  return s;
};

export const char_epp_passive_handlers: Record<string, PassiveHandler> = {
  epp_passive_1_on_turn_start: passive_proliferation,
  epp_passive_2_on_skill_used: passive_platoon_deployment,
  epp_passive_2_passive_while_active: passive_platoon_atk_bonus,
  epp_passive_3_on_self_death: passive_reckless_commander,
  epp_passive_turn_end_decrease_on_turn_end: passive_turn_end_decrease,
};
