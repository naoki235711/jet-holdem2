# Action UI Enhancement Design — Raise Presets & Pre-Actions

## Overview

アクションUI を強化する。2つの機能を追加:
1. **レイズプリセット:** フェーズ別のサイジングボタン（タップで即レイズ実行）
2. **プリアクション:** 自分のターン外で次のアクションを予約（即実行）

GameService / GameEngine の変更は不要。UI / Context 層で完結する。

## Context

### 現状
- `ActionButtons.tsx`: FOLD / CHECK(CALL) / RAISE の3ボタン + `RaiseSlider`
- `RaiseSlider.tsx`: minRaise〜maxRaise のスライダー（BB単位ステップ）
- `GameContext.tsx`: `doAction()` / `getActionInfo()` 提供
- `ActionInfo`: canCheck, callAmount, minRaise, maxRaise, canRaise
- `GameState`: phase, currentBet, pots, blinds, activePlayer, players

### 設計判断（ブレスト段階で確定済み）
1. プリセットはタップで即レイズ実行する
2. プリアクションは自分のターンが来た瞬間に即実行する
3. プリフロップとポストフロップでプリセットを切り替える
4. プリアクションはBLEモードのみ有効（ホットシート・デバッグモードでは非表示）
5. GameService / GameEngine の変更は不要

---

## 1. レイズプリセット

### フェーズ別プリセット

| フェーズ | プリセット | 計算（raise TO 値） |
|---------|-----------|-------------------|
| プリフロップ | 2.5BB, 3BB, 4BB | `blinds.bb × N` |
| ポストフロップ | 1/3, 1/2, 2/3, 3/4, Pot | `currentBet + potAfterCall × fraction` |

**フェーズ判定:** `state.phase === 'preflop'` でプリフロップ、それ以外（flop, turn, river）でポストフロップ。

**ポットサイジング計算（標準的なポーカーの pot-sized raise）:**

```typescript
const myPlayer = state.players.find(p => p.seat === mySeat)!;
const totalPot = state.pots.reduce((sum, p) => sum + p.amount, 0)
  + state.players.reduce((sum, p) => sum + p.bet, 0);
const callAmount = state.currentBet - myPlayer.bet;
const potAfterCall = totalPot + callAmount;

// 例: pot=300, opponent bet=100 (currentBet=100, myBet=0)
//   callAmount=100, potAfterCall=400
//   1/2 pot raise TO = 100 + 400*0.5 = 300
//   Pot raise TO = 100 + 400*1.0 = 500
```

- `potAfterCall`: 自分がコールした後のポット総額
- `fraction × potAfterCall`: ベットサイズ（コール後のポットに対する割合）
- `currentBet + betSize`: raise TO 値（合計ベット額）

**プリフロップの制限:** 3-bet以上の状況では 2.5BB/3BB/4BB が全て `minRaise` 未満になりうる。全プリセットが disabled の場合はプリセット行自体を非表示にする。

### プリセット値のバリデーション

- **丸め → バリデーションの順** で処理する
- 端数は BB 単位に丸める（既存スライダーのステップと同一）: `Math.round(value / bb) * bb`
- 丸め後の値が `minRaise` 未満 → ボタンを disabled にする
- 丸め後の値が `maxRaise` 以上 → `maxRaise` にクランプ
- `canRaise === false` → プリセット行自体を非表示
- 全プリセットが disabled → プリセット行自体を非表示（3-bet 直面時のプリフロップ等）

### 動作

- プリセットボタンをタップ → その額で即座に `handleAction(seat, { action: 'raise', amount })` を実行
- 値が `maxRaise` にクランプされた場合は `{ action: 'allIn' }` を実行
- スライダー + RAISE ボタンはカスタム額用に引き続き存在する

---

## 2. プリアクション

### 表示条件

- `activePlayer !== mySeat` の時のみ表示（自分のターン外）
- **BLE モード（`ble-host`, `ble-client`）でのみ有効**
- ホットシートモード: 非表示（同一端末で交代するため不要）
- デバッグモード: 非表示（`actingSeat = activePlayer` で常に isMyTurn=true のため構造的に不可。また全席を操作するモードなので不要）

### チェックボックス

```
☐ Check/Fold   ☐ Call   ☐ Call Any
```

- トグル式: タップでON、再タップでOFF
- 排他制御: 1つだけ選択可（他を選ぶと前の選択は解除）

### 実行ロジック

`activePlayer` が自分の席に変わった瞬間に、プリアクションが設定されていれば即実行:

| プリアクション | 実行されるアクション |
|-------------|-------------------|
| Check/Fold | `canCheck ? check : fold` |
| Call | `call` |
| Call Any | `call`（額に関係なく） |

実行後、プリアクション状態はリセットされる。

### 状態変化時のリセットルール

他プレイヤーのアクションでゲーム状態が変わった場合:

| プリアクション | ベット額が変わった時 |
|-------------|-------------------|
| Check/Fold | 維持（常に有効） |
| Call | **リセット**（想定外の額を防止） |
| Call Any | 維持（常に有効） |

**リセット検出:** `subscribe` コールバック内で `currentBet` の変化を追跡。`Call` 選択中に `currentBet` が変わったらプリアクションをクリアする。

**実行順序の保証:** subscribe コールバック内で「Call リセット → プリアクション即実行」の順に処理する。同一の state 更新で currentBet 変化とターン到来が同時に起きた場合、リセットが先に実行されるため、想定外の額でコールされることはない。

**Call/Call Any 実行時に canCheck=true の場合:** check を実行する。コール対象のベットがなければチェックが正しい動作。

**All-in への暗黙的変換:** Call 実行時に callAmount がプレイヤーの残りチップを超える場合、GameEngine（BettingRound）が自動的にオールイン処理を行う。プリアクション側で特別な処理は不要。

---

## 3. UI レイアウト

```
【自分のターンではない時】
┌─────────────────────────────────────┐
│  ☐ Check/Fold   ☐ Call   ☐ Call Any │
└─────────────────────────────────────┘

【自分のターン時】
┌─────────────────────────────────────┐
│  [1/3] [1/2] [2/3] [3/4] [Pot]     │  ← canRaise時のみ。タップで即レイズ（ポストフロップ）
│  [2.5BB] [3BB] [4BB]               │  ← canRaise時のみ。タップで即レイズ（プリフロップ）
│  [━━━━━━━━●━━━━━━━━━━━━]           │  ← canRaise時のみ。カスタム額用
│  [FOLD]    [CHECK/CALL]    [RAISE]  │  ← canRaise=false なら RAISE→ALL IN
└─────────────────────────────────────┘
```

### プリセットボタンのスタイル

- ピル型（小さめ）、グレー背景（`Colors.subText` 系）、白テキスト
- 横並び、均等スペース
- disabled 時は opacity: 0.4

### プリアクションチェックボックスのスタイル

- 横並び3つ、均等スペース
- 未選択: グレー枠 + 白テキスト
- 選択中: シアン枠 (`Colors.active`) + シアンテキスト + チェックマーク

---

## 4. 実装方針

### ファイル構成

| ファイル | 変更内容 |
|---------|---------|
| `src/components/actions/ActionButtons.tsx` | プリセットボタン行を追加、レイアウト変更（プリセット → スライダー → ボタンの順） |
| `src/components/actions/RaiseSlider.tsx` | 変更なし（外部から value を受け取る既存設計で対応可能） |
| `src/components/actions/PreActionBar.tsx` | **新規** — プリアクション用チェックボックスコンポーネント |
| `src/components/actions/presetCalculator.ts` | **新規** — プリセット計算ユーティリティ（純粋関数、React 非依存でテスト容易） |
| `src/components/actions/types.ts` | **新規** — `PreActionType` 型定義（複数ファイルで共有） |
| `src/contexts/GameContext.tsx` | プリアクション状態管理（`preAction` state）+ 即実行ロジック + showdown ヘルパー抽出 |
| `src/hooks/useGame.ts` | `preAction` / `setPreAction` を公開 |

### PreActionBar コンポーネント

```typescript
// src/components/actions/types.ts
export type PreActionType = 'checkFold' | 'call' | 'callAny' | null;

// src/components/actions/PreActionBar.tsx
interface PreActionBarProps {
  selected: PreActionType;
  onSelect: (action: PreActionType) => void;
  callAmount: number;  // 表示用（"Call 100" のように表示）
}
```

- 3つのトグルボタンを横並びで表示
- 選択中のボタンはシアンハイライト
- 同じボタンを再タップで解除（`onSelect(null)`）
- `callAmount` の算出: `state.currentBet - myPlayer.bet`（ターン外の概算値。実際の額はターン到来時に変わりうる）

### GameContext への変更

```typescript
// GameContext.tsx に追加

// 新しい state
const [preAction, setPreAction] = useState<PreActionType>(null);
const preActionRef = useRef<PreActionType>(null);

// subscribe 内での即実行
const unsub = service.subscribe((newState) => {
  setState(newState);

  // プリアクション: Call のリセット（currentBet 変化時）
  if (preActionRef.current === 'call' && newState.currentBet !== prevCurrentBetRef.current) {
    setPreAction(null);
    preActionRef.current = null;
  }
  prevCurrentBetRef.current = newState.currentBet;

  // プリアクション: 自分のターンが来た場合の即実行
  // mySeat の解決:
  //   ble-host: 0（ホストは常に seat 0）
  //   ble-client: コンストラクタで渡された固定席（mySeatRef.current）
  //   hotseat / debug: プリアクション無効なのでこのパスに到達しない
  const mySeat = mySeatRef.current;
  if (mySeat !== null && newState.activePlayer === mySeat && preActionRef.current) {
    const pa = preActionRef.current;
    setPreAction(null);
    preActionRef.current = null;

    const info = serviceRef.current.getActionInfo(mySeat);
    if (pa === 'checkFold') {
      serviceRef.current.handleAction(mySeat, info.canCheck ? { action: 'check' } : { action: 'fold' });
    } else if (pa === 'call' || pa === 'callAny') {
      serviceRef.current.handleAction(mySeat, info.canCheck ? { action: 'check' } : { action: 'call' });
    }

    // showdown 自動解決（既存 doAction と同じロジック）
    // 重複を避けるため autoResolveShowdown() ヘルパーに抽出する
    autoResolveShowdown();
  }

  // ... 既存ロジック
});

// ヘルパー関数（doAction 内と subscribe 内で共有）
function autoResolveShowdown() {
  if (mode === 'ble-client') return;
  const currentState = serviceRef.current.getState();
  if (currentState.phase === 'showdown') {
    const sdResult = serviceRef.current.resolveShowdown();
    setShowdownResult(sdResult);
  }
}
```

### presetCalculator ユーティリティ

```typescript
// src/components/actions/presetCalculator.ts

import { GameState } from '../../gameEngine';

export type Preset = { label: string; value: number };

export function calculatePresets(state: GameState, mySeat: number): Preset[] {
  const myPlayer = state.players.find(p => p.seat === mySeat)!;
  const bb = state.blinds.bb;

  if (state.phase === 'preflop') {
    return [
      { label: '2.5BB', value: round(bb * 2.5, bb) },
      { label: '3BB',   value: bb * 3 },
      { label: '4BB',   value: bb * 4 },
    ];
  }

  // ポストフロップ: 標準的なポットサイジング
  const totalPot = state.pots.reduce((s, p) => s + p.amount, 0)
    + state.players.reduce((s, p) => s + p.bet, 0);
  const callAmount = state.currentBet - myPlayer.bet;
  const potAfterCall = totalPot + callAmount;

  return [
    { label: '1/3', value: round(state.currentBet + potAfterCall / 3, bb) },
    { label: '1/2', value: round(state.currentBet + potAfterCall / 2, bb) },
    { label: '2/3', value: round(state.currentBet + potAfterCall * 2 / 3, bb) },
    { label: '3/4', value: round(state.currentBet + potAfterCall * 3 / 4, bb) },
    { label: 'Pot', value: round(state.currentBet + potAfterCall, bb) },
  ];
}

function round(value: number, bb: number): number {
  return Math.round(value / bb) * bb;
}
```

### GameContextValue への追加

```typescript
export interface GameContextValue {
  // ... 既存フィールド
  preAction: PreActionType;
  setPreAction: (action: PreActionType) => void;
}
```

### ActionButtons の変更概要

```typescript
// ActionButtons.tsx

export function ActionButtons() {
  const { state, mode, viewingSeat, doAction, getActionInfo, preAction, setPreAction } = useGame();
  // ...

  if (!state || state.phase === 'roundEnd' || state.phase === 'showdown') return null;

  // 自分のターンでない場合: プリアクション表示（BLEモードのみ）
  if (!isMyTurn && (mode === 'ble-host' || mode === 'ble-client')) {
    return (
      <View style={styles.container}>
        <PreActionBar
          selected={preAction}
          onSelect={setPreAction}
          callAmount={/* currentBet から概算 */}
        />
      </View>
    );
  }

  // 自分のターン: プリセット + スライダー + ボタン
  // プリセット計算は presetCalculator.ts に抽出（純粋関数）
  const presets = calculatePresets(state, actingSeat);

  return (
    <View style={styles.container}>
      {info?.canRaise && /* プリセットボタン行 */}
      {info?.canRaise && <RaiseSlider ... />}
      <View style={styles.buttonRow}>
        {/* FOLD / CHECK(CALL) / RAISE(ALL IN) — 既存ロジック */}
      </View>
    </View>
  );
}
```

---

## 5. テスト方針

### プリセット計算テスト

| テスト | 検証項目 |
|--------|---------|
| プリフロップ計算 | BB=10 → 2.5BB=30(丸め), 3BB=30, 4BB=40 |
| ポストフロップ計算（ベットなし） | pot=300, currentBet=0, myBet=0 → potAfterCall=300, 1/3=100, 1/2=150, 2/3=200, 3/4=230(丸め), Pot=300 |
| ポストフロップ計算（ベットあり） | pot=300, currentBet=100, myBet=0 → callAmount=100, potAfterCall=400, 1/3=230(丸め), 1/2=300, 2/3=370(丸め), 3/4=400, Pot=500 |
| 全プリセット disabled 時の非表示 | 3-bet 直面で全て minRaise 未満 → プリセット行非表示 |
| minRaise 未満の disabled | minRaise=30, 2.5BB=25(丸め後20) → disabled |
| maxRaise クランプ | maxRaise=200, Pot=500 → 200 にクランプ |
| BB 単位丸め → バリデーション | 丸め後に minRaise/maxRaise を判定 |

### プリアクションテスト

| テスト | 検証項目 |
|--------|---------|
| 選択・解除 | タップで ON、再タップで OFF |
| 排他制御 | Call 選択中に Call Any タップ → Call が解除 |
| Check/Fold 即実行 | canCheck=true → check 実行 |
| Check/Fold 即実行 | canCheck=false → fold 実行 |
| Call 即実行 | call アクション実行 |
| Call リセット | currentBet 変化時に Call がクリア |
| Call Any 維持 | currentBet 変化してもクリアされない |
| ホットシート/デバッグ非表示 | mode=hotseat/debug → PreActionBar 非表示 |
| BLEモードで表示 | mode=ble-host/ble-client → PreActionBar 表示 |
| All-in 暗黙変換 | callAmount > 残チップ → GameEngine が自動 all-in |

### 統合テスト

| テスト | 検証項目 |
|--------|---------|
| ターン切替 | 自分のターン → プリセット+スライダー表示、ターン外 → プリアクション表示 |
| プリセット → スライダー連動 | プリセットタップ → raiseValue 更新 → スライダー位置更新 |
| プリアクション → showdown | プリアクション実行が showdown をトリガーした場合に正しく解決 |

---

## 6. Scope

### 今回のスコープ

- `PreActionBar.tsx` 新規コンポーネント
- `ActionButtons.tsx` プリセットボタン行追加 + レイアウト変更
- `GameContext.tsx` プリアクション状態管理 + 即実行ロジック
- `useGame.ts` preAction / setPreAction 公開
- 上記の全 Jest テスト

### スコープ外

- アクションタイマー（別設計）
- アクション履歴バー（別設計）
- アニメーション・効果音（別設計）
