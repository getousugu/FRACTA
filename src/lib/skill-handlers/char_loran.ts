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

// 武器習熟フラグの管理
function getWeaponMasteryFlag(char: CharacterState, skillId: string): boolean {
  return (char.battleFlags[`mastery_${skillId}`] as boolean) ?? false;
}

function setWeaponMasteryFlag(char: CharacterState, skillId: string): CharacterState {
  return {
    ...char,
    battleFlags: {
      ...char.battleFlags,
      [`mastery_${skillId}`]: true,
    },
  };
}

// 武器習熟カウントを増加させる（初回のみ）
function incrementWeaponMastery(
  char: CharacterState,
  skillId: string
): { char: CharacterState; incremented: boolean } {
  const alreadyMastered = getWeaponMasteryFlag(char, skillId);
  if (alreadyMastered) {
    return { char, incremented: false };
  }

  let nc = setWeaponMasteryFlag(char, skillId);
  nc = setResource(nc, 'weapon_mastery_count', 1);
  return { char: nc, incremented: true };
}

// 連撃スタックを増加させる
function incrementComboStack(char: CharacterState): CharacterState {
  const currentStacks = getResource(char, 'combo_stacks');
  if (currentStacks >= 5) {
    return char;
  }
  return setResource(char, 'combo_stacks', 1);
}

// 連撃ボーナスを計算 (Passive側でATKバフとして処理するため未使用)
// function getComboBonus(char: CharacterState): number {
//   const stacks = getResource(char, 'combo_stacks');
//   return 1 + (stacks * 0.1); // +10% per stack
// }

// ============================================================
// スキルハンドラ
// ============================================================

/** S1: デュランダル */
const s1_durandal: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const dmg = calcDamage(actor, enemy, { multiplier: 0.7 });

  let s = dealDamage(state, actorTeam, dmg);

  // 武器習熟カウント増加
  s = updateActiveChar(s, actorTeam, (c) => {
    const { char: updatedChar, incremented } = incrementWeaponMastery(c, 'char_loran_s1_durandal');
    if (incremented) {
      s = addLog(s, `${actor.name}の武器習熟カウント+1（デュランダル）`);
    }
    return updatedChar;
  });

  // 次のターンのATK+15%
  s = updateActiveChar(s, actorTeam, (c) =>
    applyEffect(c, {
      id: 'loran_durandal_atk_up',
      name: 'ATK上昇',
      category: 'stat',
      stat: 'atk',
      value: 0.15,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 1,
    })
  );

  // 連撃スタック増加
  s = updateActiveChar(s, actorTeam, (c) => incrementComboStack(c));

  s = addLog(s, `${actor.name}の「デュランダル」→ ${enemy.name}に${dmg}ダメージ、次ターンATK+15%`);
  return s;
};

/** S1派生: 老いた少年工房 */
const s1_d1_old_boy: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const dmg = calcDamage(actor, enemy, { multiplier: 0.7 });

  let s = dealDamage(state, actorTeam, dmg);

  // コスト回復（実質コスト0）
  s = { ...s, remainingCost: s.remainingCost + 1 };

  // HP回復50
  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    hp: Math.min(c.maxHp, c.hp + 50),
  }));

  // 武器習熟カウント増加
  s = updateActiveChar(s, actorTeam, (c) => {
    const { char: updatedChar, incremented } = incrementWeaponMastery(c, 'char_loran_s1_d1_old_boy');
    if (incremented) {
      s = addLog(s, `${actor.name}の武器習熟カウント+1（老いた少年工房）`);
    }
    return updatedChar;
  });

  // 連撃スタック増加
  s = updateActiveChar(s, actorTeam, (c) => incrementComboStack(c));

  s = addLog(s, `${actor.name}の「老いた少年工房」→ ${enemy.name}に${dmg}ダメージ、HP+50、コスト+1`);
  return s;
};

/** S1派生: ムク工房 */
const s1_d2_muku: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const dmg = calcDamage(actor, enemy, { multiplier: 0.7 });

  let s = dealDamage(state, actorTeam, dmg);

  // 追加固定40ダメージ
  s = dealDamage(s, actorTeam, 40);

  // コスト回復（実質コスト0）
  s = { ...s, remainingCost: s.remainingCost + 1 };

  // 武器習熟カウント増加
  s = updateActiveChar(s, actorTeam, (c) => {
    const { char: updatedChar, incremented } = incrementWeaponMastery(c, 'char_loran_s1_d2_muku');
    if (incremented) {
      s = addLog(s, `${actor.name}の武器習熟カウント+1（ムク工房）`);
    }
    return updatedChar;
  });

  // 連撃スタック増加
  s = updateActiveChar(s, actorTeam, (c) => incrementComboStack(c));

  s = addLog(s, `${actor.name}の「ムク工房」→ ${enemy.name}に${dmg}+40ダメージ、コスト+1`);
  return s;
};

/** S2: ロジックアトリエ */
const s2_logic_atelier: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const dmg = calcDamage(actor, enemy, { multiplier: 0.9 });

  let s = dealDamage(state, actorTeam, dmg);

  // 武器習熟カウント増加
  s = updateActiveChar(s, actorTeam, (c) => {
    const { char: updatedChar, incremented } = incrementWeaponMastery(c, 'char_loran_s2_logic_atelier');
    if (incremented) {
      s = addLog(s, `${actor.name}の武器習熟カウント+1（ロジックアトリエ）`);
    }
    return updatedChar;
  });

  // 連撃スタック増加
  s = updateActiveChar(s, actorTeam, (c) => incrementComboStack(c));

  s = addLog(s, `${actor.name}の「ロジックアトリエ」→ ${enemy.name}に${dmg}ダメージ`);
  return s;
};

/** S2派生: クリスタルアトリエ */
const s2_d1_crystal_atelier: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  // 4連撃としてATK×1.54
  const dmg = calcDamage(actor, enemy, { multiplier: 1.54 });

  let s = dealDamage(state, actorTeam, dmg);

  // 武器習熟カウント増加
  s = updateActiveChar(s, actorTeam, (c) => {
    const { char: updatedChar, incremented } = incrementWeaponMastery(c, 'char_loran_s2_d1_crystal_atelier');
    if (incremented) {
      s = addLog(s, `${actor.name}の武器習熟カウント+1（クリスタルアトリエ）`);
    }
    return updatedChar;
  });

  // 連撃スタック増加（4回分として4スタック増加）
  s = updateActiveChar(s, actorTeam, (c) => {
    let nc = c;
    for (let i = 0; i < 4; i++) {
      nc = incrementComboStack(nc);
    }
    return nc;
  });

  s = addLog(s, `${actor.name}の「クリスタルアトリエ」→ ${enemy.name}に${dmg}ダメージ（4連撃）`);
  return s;
};

/** S2派生: ホイールズ・インダストリー */
const s2_d2_wheels_industry: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  const dmg = calcDamage(actor, enemy, { multiplier: 1.7 });

  let s = dealDamage(state, actorTeam, dmg);

  // 相手の次のターンATK-7.5%
  s = updateActiveChar(s, enemyTeam, (c) =>
    applyEffect(c, {
      id: 'loran_wheels_atk_down',
      name: 'ATK低下',
      category: 'stat',
      stat: 'atk',
      value: -0.075,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 1,
    })
  );

  // 武器習熟カウント増加
  s = updateActiveChar(s, actorTeam, (c) => {
    const { char: updatedChar, incremented } = incrementWeaponMastery(c, 'char_loran_s2_d2_wheels_industry');
    if (incremented) {
      s = addLog(s, `${actor.name}の武器習熟カウント+1（ホイールズ・インダストリー）`);
    }
    return updatedChar;
  });

  // 連撃スタック増加
  s = updateActiveChar(s, actorTeam, (c) => incrementComboStack(c));

  s = addLog(s, `${actor.name}の「ホイールズ・インダストリー」→ ${enemy.name}に${dmg}ダメージ、相手次ターンATK-7.5%`);
  return s;
};

/** S3: アラス工房 */
const s3_aras: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  const dmg = calcDamage(actor, enemy, { multiplier: 0.8 });

  let s = dealDamage(state, actorTeam, dmg);

  // このターン中に相手が受けるダメージを15%増加
  // turnsRemaining: 1 → ターン終了時に tickEffects で削除される（0は永続化バグになるため使用禁止）
  s = updateActiveChar(s, enemyTeam, (c) =>
    applyEffect(c, {
      id: 'loran_aras_damage_taken_up',
      name: '被ダメージ増加',
      category: 'special',
      value: 0.15,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 1, // このターンのみ（0にするとtickEffectsで-1となり永続化するバグ）
    })
  );

  // 武器習熟カウント増加
  s = updateActiveChar(s, actorTeam, (c) => {
    const { char: updatedChar, incremented } = incrementWeaponMastery(c, 'char_loran_s3_aras');
    if (incremented) {
      s = addLog(s, `${actor.name}の武器習熟カウント+1（アラス工房）`);
    }
    return updatedChar;
  });

  // 連撃スタック増加
  s = updateActiveChar(s, actorTeam, (c) => incrementComboStack(c));

  s = addLog(s, `${actor.name}の「アラス工房」→ ${enemy.name}に${dmg}ダメージ、相手被ダメージ+15%`);
  return s;
};

/** S4: ケヤキ工房 */
const s4_keyaki: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const dmg = calcDamage(actor, enemy, { multiplier: 0.6 });

  let s = dealDamage(state, actorTeam, dmg);

  // 武器習熟カウント増加
  s = updateActiveChar(s, actorTeam, (c) => {
    const { char: updatedChar, incremented } = incrementWeaponMastery(c, 'char_loran_s4_keyaki');
    if (incremented) {
      s = addLog(s, `${actor.name}の武器習熟カウント+1（ケヤキ工房）`);
    }
    return updatedChar;
  });

  // 連撃スタック増加
  s = updateActiveChar(s, actorTeam, (c) => incrementComboStack(c));

  // 1ターンに1回の制限
  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    disabledSkills: [...c.disabledSkills, 'char_loran_s4_keyaki']
  }));

  s = addLog(s, `${actor.name}の「ケヤキ工房」→ ${enemy.name}に${dmg}ダメージ`);
  return s;
};

/** S5: 狼牙工房 */
const s5_wolf_fang: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const dmg = calcDamage(actor, enemy, { multiplier: 0.6 });

  let s = dealDamage(state, actorTeam, dmg);

  // 武器習熟カウント増加
  s = updateActiveChar(s, actorTeam, (c) => {
    const { char: updatedChar, incremented } = incrementWeaponMastery(c, 'char_loran_s5_wolf_fang');
    if (incremented) {
      s = addLog(s, `${actor.name}の武器習熟カウント+1（狼牙工房）`);
    }
    return updatedChar;
  });

  // 連撃スタック増加
  s = updateActiveChar(s, actorTeam, (c) => incrementComboStack(c));

  // 1ターンに1回の制限
  s = updateActiveChar(s, actorTeam, (c) => ({
    ...c,
    disabledSkills: [...c.disabledSkills, 'char_loran_s5_wolf_fang']
  }));

  s = addLog(s, `${actor.name}の「狼牙工房」→ ${enemy.name}に${dmg}ダメージ`);
  return s;
};

/** Ultimate: Furioso */
const ultimate_furioso: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const enemyTeam: Team = actorTeam === 'team1' ? 'team2' : 'team1';
  const masteryCount = getResource(actor, 'weapon_mastery_count');

  if (masteryCount < 9) {
    return state; // 習熟カウントが9未満なら使用不可
  }

  // ATK×3.5、バフ・防御効果を無視
  const dmg = Math.round(actor.atk * 3.5);

  let s = dealDamage(state, actorTeam, dmg);

  // 相手の次のターンATK-10%
  s = updateActiveChar(s, enemyTeam, (c) =>
    applyEffect(c, {
      id: 'loran_furioso_atk_down',
      name: 'ATK低下',
      category: 'stat',
      stat: 'atk',
      value: -0.1,
      mode: 'mul',
      isStackable: false,
      turnsRemaining: 1,
    })
  );

  // 武器習熟カウントをリセット
  s = updateActiveChar(s, actorTeam, (c) => {
    let nc = setResource(c, 'weapon_mastery_count', 0, true);
    // すべての武器習熟フラグをリセット
    const newFlags: Record<string, unknown> = {};
    for (const flagKey of Object.keys(nc.battleFlags)) {
      // mastery_で始まるフラグのみ削除
      if (!flagKey.startsWith('mastery_')) {
        newFlags[flagKey] = nc.battleFlags[flagKey];
      }
    }
    nc = {
      ...nc,
      battleFlags: newFlags,
      // Furiosoをロック状態に戻す
      unlockedDerivedSkills: nc.unlockedDerivedSkills.filter(u => u.skillId !== 'char_loran_ultimate_furioso')
    };
    return nc;
  });

  s = addLog(s, `${actor.name}の「Furioso」→ ${enemy.name}に${dmg}ダメージ（防御無視）、武器習熟カウントリセット`);
  return s;
};

// ============================================================
// パッシブハンドラ
// ============================================================

/** passive_while_active: 認識阻害の仮面（通常） - HP>=601で被ダメージ-10% */
const passive_mask_normal: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  return updateChar(state, ownerTeam, ownerCharId, (c) => ({
    ...c,
    battleFlags: {
      ...c.battleFlags,
      damage_reduction_percent: char.hp >= 601 ? 0.1 : 0,
    },
  }));
};

/** passive_while_active: 認識阻害の仮面（覚醒） - HP<=600でATK1.1倍、被ダメージ+15% */
const passive_mask_awakened: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  const isAwakened = char.hp <= 600;
  
  let s = updateChar(state, ownerTeam, ownerCharId, (c) => ({
    ...c,
    battleFlags: {
      ...c.battleFlags,
      damage_increase_percent: isAwakened ? 0.15 : 0,
    },
  }));

  if (isAwakened) {
    // ATK1.1倍はバフとして適用
    s = updateChar(s, ownerTeam, ownerCharId, (c) =>
      applyEffect(c, {
        id: 'loran_awakened_atk_up',
        name: '覚醒ATK上昇',
        category: 'stat',
        stat: 'atk',
        value: 0.1,
        mode: 'mul',
        isStackable: false,
        turnsRemaining: -1, // 常時発動
      })
    );
  } else {
    // 覚醒状態でなくなったらバフを除去
    s = updateChar(s, ownerTeam, ownerCharId, (c) => ({
      ...c,
      effects: c.effects.filter(e => e.id !== 'loran_awakened_atk_up')
    }));
  }

  return s;
};

/** on_skill_used: 連撃の軌跡 - 同ターン内の連続スキル使用でATK+10% */
const passive_combo: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive || state.currentTurn !== ownerTeam) return state;

  // 連撃スタックに応じたATKボーナスを適用
  const stacks = getResource(char, 'combo_stacks');
  if (stacks > 0) {
    return updateChar(state, ownerTeam, ownerCharId, (c) =>
      applyEffect(c, {
        id: 'loran_combo_atk_up',
        name: '連撃ATK上昇',
        category: 'stat',
        stat: 'atk',
        value: stacks * 0.1,
        mode: 'mul',
        isStackable: false,
        turnsRemaining: 0, // このターンのみ
      })
    );
  }

  return state;
};

/** on_turn_end: 連撃スタックをリセット & ターン1回制限の解除 */
const passive_reset_combo: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || state.currentTurn !== ownerTeam) return state;

  return updateChar(state, ownerTeam, ownerCharId, (c) => {
    let nc = c;
    if (c.isActive) {
      nc = setResource(nc, 'combo_stacks', 0, true);
    }
    nc = {
      ...nc,
      disabledSkills: nc.disabledSkills.filter(id => 
        id !== 'char_loran_s4_keyaki' && id !== 'char_loran_s5_wolf_fang'
      )
    };
    return nc;
  });
};

/** on_skill_used: 習熟チェック - 武器習熟カウントが9ならFurioso解放 */
const passive_mastery_check: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive) return state;

  const masteryCount = getResource(char, 'weapon_mastery_count');
  if (masteryCount >= 9) {
    const isAlreadyUnlocked = char.unlockedDerivedSkills.some(u => u.skillId === 'char_loran_ultimate_furioso');
    if (!isAlreadyUnlocked) {
      let s = updateChar(state, ownerTeam, ownerCharId, (c) => ({
        ...c,
        unlockedDerivedSkills: [
          ...c.unlockedDerivedSkills,
          { skillId: 'char_loran_ultimate_furioso', available: 'permanent' as const }
        ]
      }));
      s = addLog(s, `${char.name}の全武器習熟が完了！ Furiosoが解放された`);
      return s;
    }
  }

  return state;
};

// ============================================================
// エクスポート
// ============================================================
export const char_loran_skill_handlers: Record<string, SkillHandler> = {
  char_loran_s1_durandal: s1_durandal,
  char_loran_s1_d1_old_boy: s1_d1_old_boy,
  char_loran_s1_d2_muku: s1_d2_muku,
  char_loran_s2_logic_atelier: s2_logic_atelier,
  char_loran_s2_d1_crystal_atelier: s2_d1_crystal_atelier,
  char_loran_s2_d2_wheels_industry: s2_d2_wheels_industry,
  char_loran_s3_aras: s3_aras,
  char_loran_s4_keyaki: s4_keyaki,
  char_loran_s5_wolf_fang: s5_wolf_fang,
  char_loran_ultimate_furioso: ultimate_furioso,
};

export const char_loran_passive_handlers: Record<string, PassiveHandler> = {
  char_loran_passive_mask_normal_passive_while_active: passive_mask_normal,
  char_loran_passive_mask_awakened_passive_while_active: passive_mask_awakened,
  char_loran_passive_combo_on_skill_used: passive_combo,
  char_loran_passive_reset_combo_on_turn_end: passive_reset_combo,
  char_loran_passive_mastery_check_on_skill_used: passive_mastery_check,
};
