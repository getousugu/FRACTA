# 優先度システム仕様

## 概要

優先度システムは、各キャラクターの行動順序を決定するための仕組みです。優先度が高いキャラクターが先攻になります。

## 基本仕様

### 優先度の基本値
- 各キャラクターは`priority`プロパティを持つ
- 初期値は`0`
- 数値が大きいほど先攻になる

### ターン順の決定
```typescript
function resolveTurnOrder(state: BattleState): BattleState {
  const p1 = getActive(state, 'team1').priority;
  const p2 = getActive(state, 'team2').priority;
  if (p1 === p2) return state; // 同値の場合は変更なし
  return { ...state, currentTurn: p1 > p2 ? 'team1' : 'team2' };
}
```

- 優先度が高い方が`currentTurn`になる
- 同値の場合は変更なし（前のターンの順序を維持）

### ターンの切り替え
```typescript
function switchTurn(state: BattleState): BattleState {
  const p1 = getActive(state, 'team1').priority;
  const p2 = getActive(state, 'team2').priority;
  if (p1 !== p2) {
    // 優先度が異なる場合、resolveTurnOrderで決定済み
    return { ...state, turn: state.turn + 1 };
  }
  // 同値の場合はトグル（交互に行動）
  return { ...state, currentTurn: state.currentTurn === 'team1' ? 'team2' : 'team1', turn: state.turn + 1 };
}
```

- 優先度が異なる場合：優先度に従って行動順を決定
- 優先度が同値の場合：交互に行動（トグル）

## 優先度の操作

### ステータス効果による優先度操作
```typescript
applyEffect(c, {
  id: 'effect_id',
  name: '効果名',
  category: 'stat',
  stat: 'priority',
  value: 2,           // 変化量
  mode: 'add',        // 'add' = 加算, 'mul' = 乗算
  turnsRemaining: 1,   // 持続ターン数（-1で永続）
  isStackable: false,
})
```

### 直接的な優先度操作
```typescript
s = updateActiveChar(s, actorTeam, (c) => ({
  ...c,
  priority: c.priority + 2,  // 直接加算
}));
```

## 既存の実装例

### ルート.J
- **まだ終わりは遠い**: 相手優先度-1（デバフ、2ターン）
- **敵陣突破バフ**: 優先度+999（永続）

### 時詠みの魔女
- **時の加速**: 自分優先度+2（そのターンのみ）
- **時空断裂**: 相手優先度-5（そのターンのみ）

## 注意点

### 同値の場合の挙動
- 優先度が同値の場合、交互に行動します（トグル）
- これは「コイントス」に近い挙動と言えます
- 初回の先行後攻は、おそらく`team1`が先行になります

### 優先度のリセット
- キャラクター切り替え時、優先度はリセットされません
- バフ/デバフは持続ターン数に従って消滅します

## 改善案（検討中）

現在の仕様では、同値の場合の挙動が曖昧です。以下の改善案が考えられます：

1. **初期値をランダムにする**: キャラクター登場時に優先度をランダムに設定
2. **同値の場合の決定ルールを明確化**: 例えば、属性相性や素早さステータスで決定
3. **優先度を可視化**: UIで優先度を明確に表示

ユーザーのフィードバックに基づいて、仕様を調整する必要があります。
