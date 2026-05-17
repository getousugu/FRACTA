# 新規キャラクター実装ガイド

このガイドは、新しいキャラクターをCLASHに追加するための手順を説明します。

## 概要

新しいキャラクターを追加するには、以下の3つのファイルを編集/作成する必要があります：

1. `src/data/characters.json` - キャラクターデータの定義
2. `src/lib/skill-handlers/[キャラID].ts` - スキルハンドラの実装
3. `src/lib/skill-handlers/index.ts` - ハンドラの登録

---

## ステップ1: キャラクターデータを定義する

`src/data/characters.json` に新しいキャラクターのデータを追加します。

### 基本構造

```json
{
  "id": "char_your_character",
  "name": "キャラクター名",
  "element": "fire",
  "hp": 1000,
  "atk": 120,
  "def": 80,
  "custom_resources": [],
  "passives": [],
  "skills": [],
  "derived_skills": []
}
```

### フィールド説明

| フィールド | 説明 |
|-----------|------|
| `id` | キャラクターの一意識別子（`char_` プレフィックス推奨） |
| `name` | 表示名 |
| `element` | 属性（`fire`, `water`, `grass`, `light`, `dark`, `none`） |
| `hp` | 最大HP |
| `atk` | 基本攻撃力 |
| `def` | 基本防御力 |
| `custom_resources` | 固有リソースの配列（詳細は後述） |
| `passives` | パッシブ能力の配列（詳細は後述） |
| `skills` | 通常スキルの配列（詳細は後述） |
| `derived_skills` | 派生スキルの配列（詳細は後述） |

---

## 固有リソース（Custom Resources）

キャラクター固有のリソース（カウンター、ゲージなど）を定義します。

```json
"custom_resources": [
  {
    "id": "resource_id",
    "name": "リソース名",
    "initial_value": 0,
    "min": 0,
    "max": 10,
    "display": "stack"
  }
]
```

| フィールド | 説明 |
|-----------|------|
| `id` | リソースの一意識別子 |
| `name` | 表示名 |
| `initial_value` | 初期値 |
| `min` | 最小値 |
| `max` | 最大値 |
| `display` | 表示形式（`stack` = スタック数、`gauge` = ゲージ） |

---

## パッシブ能力（Passives）

自動発動する能力を定義します。

```json
"passives": [
  {
    "id": "passive_id",
    "name": "パッシブ名",
    "trigger": "on_turn_start",
    "description": "説明文"
  }
]
```

### トリガータイプ

| トリガー | 説明 |
|----------|------|
| `on_turn_start` | 自分のターン開始時 |
| `on_turn_end` | 自分のターン終了時 |
| `on_switch_in` | 場に出た時 |
| `on_switch_out` | 控えに下がる時 |
| `on_ally_death` | 味方が死亡した時 |
| `passive_while_active` | 場に出ている間常時発動 |

---

## スキル（Skills）

通常スキルを定義します。

```json
"skills": [
  {
    "id": "skill_id",
    "name": "スキル名",
    "cost": 1,
    "description": "説明文",
    "unlocks": []
  }
]
```

### 派生スキルの解放

スキルが派生スキルを解放する場合、`unlocks` を使用します。

```json
"unlocks": [
  { "skillId": "derived_skill_id", "available": "same_turn" }
]
```

| `available` | 説明 |
|-------------|------|
| `same_turn` | 同じターン内に解放 |
| `next_turn` | 次のターンに解放 |
| `permanent` | 永続的に解放 |

---

## 派生スキル（Derived Skills）

派生スキルを定義します。

```json
"derived_skills": [
  {
    "id": "derived_skill_id",
    "name": "派生スキル名",
    "cost": 1,
    "description": "説明文",
    "unlocked_by": "parent_skill_id",
    "available": "same_turn"
  }
]
```

---

## ステップ2: スキルハンドラを実装する

`src/lib/skill-handlers/` に新しいファイルを作成します（例：`src/lib/skill-handlers/char_your_character.ts`）。

### 基本テンプレート

```typescript
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
// ユーティリティ関数
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
const skill1: SkillHandler = (state, actorTeam) => {
  const actor = getActive(state, actorTeam);
  const enemy = getEnemy(state, actorTeam);
  const dmg = calcDamage(actor, enemy, { multiplier: 1.0 });

  let s = dealDamage(state, actorTeam, dmg);
  s = addLog(s, `${actor.name}の「スキル名」→ ${enemy.name}に${dmg}ダメージ`);

  return s;
};

// ============================================================
// パッシブハンドラ
// ============================================================
const passive_on_turn_start: PassiveHandler = (state, ownerTeam, ownerCharId) => {
  const char = state[ownerTeam].characters.find((c) => c.id === ownerCharId);
  if (!char || !char.isActive || state.currentTurn !== ownerTeam) return state;

  // パッシブの処理
  return state;
};

// ============================================================
// エクスポート
// ============================================================
export const char_your_character_skill_handlers: Record<string, SkillHandler> = {
  char_your_character_s1: skill1,
};

export const char_your_character_passive_handlers: Record<string, PassiveHandler> = {
  char_your_character_passive_on_turn_start: passive_on_turn_start,
};
```

### スキルハンドラの命名規則

- スキルハンドラ: `char_[キャラID]_[スキルID]`
- パッシブハンドラ: `char_[キャラID]_[パッシブID]_[トリガータイプ]`

例：
- スキル: `char_chrono_witch_s1`
- パッシブ: `char_chrono_witch_passive_turn_start_on_turn_start`

---

## ステップ3: ハンドラを登録する

`src/lib/skill-handlers/index.ts` にハンドラを登録します。

```typescript
import {
  char_your_character_skill_handlers,
  char_your_character_passive_handlers,
} from './char_your_character';

export function getSkillHandlerRegistry(): HandlerRegistry {
  if (_registry) return _registry;

  _registry = {
    skillHandlers: {
      ...char_your_character_skill_handlers,
    },
    passiveHandlers: {
      char_your_character: char_your_character_passive_handlers,
    },
  };

  return _registry;
}
```

---

## 高度な機能

### 固有リソースの操作

```typescript
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
```

### バフ/デバフの適用

```typescript
import { applyEffect } from '../effects';

s = updateActiveChar(s, actorTeam, (c) =>
  applyEffect(c, {
    id: 'effect_id',
    name: '効果名',
    category: 'stat',
    stat: 'atk',
    value: 0.2,
    mode: 'mul',
    isStackable: false,
    turnsRemaining: 2,
  })
);
```

### ダメージ計算オプション

```typescript
const dmg = calcDamage(actor, enemy, {
  multiplier: 1.5,        // ダメージ倍率
  applyElement: true,     // 属性相性を適用
  piercing: false,        // DEFを無視
  extraMultiplier: 1,     // 追加倍率
});
```

---

## テスト

キャラクターを追加した後、以下を確認してください：

1. ビルドが成功する: `npm run build`
2. ロビー画面でキャラクターが表示される
3. キャラクター詳細モーダルでスキルが正しく表示される
4. バトルでスキルが正常に動作する

---

## 参考例

既存のキャラクターを参考にしてください：

- **ルート.J**: `src/data/characters.json`, `src/lib/skill-handlers/char_route_j.ts`
- **戦士**: `src/data/characters.json`, `src/lib/skill-handlers/char_simple.ts`
- **時詠みの魔女**: `src/data/characters.json`, `src/lib/skill-handlers/char_chrono_witch.ts`
