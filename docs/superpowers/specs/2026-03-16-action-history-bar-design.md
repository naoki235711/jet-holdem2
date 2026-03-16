# Action History Bar Design — 横スクロールアクション履歴

**Date:** 2026-03-16
**Branch:** feature/matsuda/rematch-and-chip-reset
**Depends on:** UI Design (Doc Plan 3), BLE Game Play (Doc 3), GameContext

## Overview

ゲーム画面上部に横スクロール可能なアクション履歴バーを追加する。各アクションをピル型チップとして表示し、プレイヤーがどのような行動を取ったかを一覧できるようにする。全モード（hotseat / debug / ble-host / ble-client）に対応する。

## Context

### 現状
- GameScreen レイアウトにはアクション履歴バーの場所が UI Design (Section 6) で予定されている（ステータスバーとテーブルの間）
- UI Design (Section 11) では「スコープ外（BLE通信後に追加）」と記載 — BLE通信が実装済みのため、今回実装する
- GameState には `activePlayer`, `phase`, `currentBet`, `players[].bet`, `players[].status` が含まれるが、アクション履歴を直接保持するフィールドはない
- アクション検出は `GameService.subscribe()` コールバック内で state 差分から推定する

### 設計判断
1. **履歴データの管理:** Context層（GameContext）で state 変化を検出し、アクション履歴を蓄積する
2. **リセットタイミング:** 各ストリート（preflop / flop / turn / river）の開始時にクリアする
3. **表示:** 横スクロール `ScrollView` + ピル型コンポーネント。最新アクションに自動スクロール
4. **BLE対応:** BLEモードでもローカルモードと同一ロジック（subscribe 経由で state を受信するため）
5. **GameService / GameEngine の変更は不要:** UI / Context 層で完結する

---

## 1. データモデル

### ActionHistoryEntry 型

```typescript
// src/components/history/types.ts

export interface ActionHistoryEntry {
  id: number;              // 一意ID（インクリメント）
  playerName: string;
  seat: number;
  action: ActionType;      // 'fold' | 'check' | 'call' | 'raise' | 'allIn'
  amount?: number;         // raise / allIn / call の額（raise TO 値）
  isCurrentPlayer: boolean; // viewingSeat と一致するか
}
```

### 表示テキスト

各ピルの表示形式: `[PlayerName] [ActionLabel] [Amount?]`

| ActionType | 表示ラベル | 額の表示 |
|---|---|---|
| fold | FOLD | なし |
| check | CHECK | なし |
| call | CALL | callAmount |
| raise | RAISE | raise TO 値 |
| allIn | ALL IN | allIn 額（= player.chips + player.bet） |

**ブラインドの投稿:** ブラインド投稿は通常のアクションではなく `startRound()` 時に自動的に行われる。phase が `preflop` に遷移した直後の初期状態から SB / BB を検出し、履歴の初期エントリとして追加する。

```typescript
// ブラインド投稿エントリ
{ playerName: 'P1', seat: 1, action: 'call' as ActionType, amount: 5, isCurrentPlayer: false }   // SB POST
{ playerName: 'P2', seat: 2, action: 'call' as ActionType, amount: 10, isCurrentPlayer: false }  // BB POST
```

ブラインド投稿は独自の表示ラベルを使用:

| 条件 | 表示ラベル |
|---|---|
| SB 投稿 | `SB {amount}` |
| BB 投稿 | `BB {amount}` |

これを実現するため、`ActionHistoryEntry` に追加フィールドを設ける:

```typescript
export interface ActionHistoryEntry {
  id: number;
  playerName: string;
  seat: number;
  action: ActionType;
  amount?: number;
  isCurrentPlayer: boolean;
  blind?: 'sb' | 'bb';     // ブラインド投稿の場合のみ設定
}
```

ピル表示時に `blind` フィールドがあれば `SB {amount}` / `BB {amount}` と表示し、通常のアクションラベルは使用しない。

---

## 2. アクション検出ロジック

### 方式: state diff による推定

`GameService.subscribe()` のコールバック内で、前回の state と今回の state を比較してアクションを推定する。

**検出タイミング:** `GameContext` の subscribe コールバック内（既存の `setState(newState)` の直後）。

### 検出アルゴリズム

```typescript
// detectAction: 前回state → 今回state → ActionHistoryEntry | null

function detectAction(
  prevState: GameState,
  newState: GameState,
  viewingSeat: number,
  nextId: number,
): ActionHistoryEntry | null {
  // 1. phase が変わった場合はアクション検出しない（ストリート遷移は別処理）
  //    ただし preflop → preflop（同一ストリート内のブラインド後）は検出する
  // 2. activePlayer が変わった、または phase が showdown/roundEnd に遷移した
  //    → 前回の activePlayer がアクションを実行した

  const actorSeat = prevState.activePlayer;
  if (actorSeat < 0) return null;

  const prevPlayer = prevState.players.find(p => p.seat === actorSeat);
  const newPlayer = newState.players.find(p => p.seat === actorSeat);
  if (!prevPlayer || !newPlayer) return null;

  // アクション種別の判定
  let action: ActionType;
  let amount: number | undefined;

  if (newPlayer.status === 'folded' && prevPlayer.status !== 'folded') {
    action = 'fold';
  } else if (newPlayer.status === 'allIn' && prevPlayer.status !== 'allIn') {
    action = 'allIn';
    amount = newPlayer.bet;
  } else if (newPlayer.bet > prevPlayer.bet) {
    if (newPlayer.bet === newState.currentBet && newPlayer.bet > prevState.currentBet) {
      action = 'raise';
      amount = newPlayer.bet;  // raise TO 値
    } else {
      action = 'call';
      amount = newPlayer.bet - prevPlayer.bet;
    }
  } else {
    action = 'check';
  }

  return {
    id: nextId,
    playerName: newPlayer.name,
    seat: actorSeat,
    action,
    amount,
    isCurrentPlayer: actorSeat === viewingSeat,
  };
}
```

### 検出の制限事項と対応

| ケース | 対応 |
|---|---|
| 全員オールイン → 一気に showdown | 中間 state が通知されないため、最後のアクションのみ検出される。これは許容する（中間アクションはUIで確認不要） |
| foldWin（1人以外全員フォールド） | 最後のフォールドアクションは通常通り検出される |
| BLEクライアントの楽観的アクション | クライアントは stateUpdate 受信時に検出するため、ホスト側で確定したアクションのみが履歴に追加される |

---

## 3. 状態管理（GameContext への追加）

### GameContextValue への追加

```typescript
export interface GameContextValue {
  // ... 既存フィールド
  actionHistory: ActionHistoryEntry[];
}
```

### GameProvider への追加

```typescript
// GameProvider 内に追加
const [actionHistory, setActionHistory] = useState<ActionHistoryEntry[]>([]);
const nextIdRef = useRef(0);
const prevStateForHistoryRef = useRef<GameState | null>(null);

// subscribe コールバック内（既存の setState(newState) の直後）
const unsub = service.subscribe((newState) => {
  setState(newState);

  // --- アクション履歴の更新 ---
  const prevSt = prevStateForHistoryRef.current;

  // ストリートリセット検出
  if (prevSt && isStreetChange(prevSt, newState)) {
    setActionHistory([]);
    nextIdRef.current = 0;
  }

  // リマッチ / ゲーム開始リセット検出
  if (!prevSt || (prevSt.phase !== 'preflop' && newState.phase === 'preflop')) {
    // preflop 開始 → ブラインド投稿を追加
    const blindEntries = detectBlinds(newState, viewingSeat, nextIdRef);
    setActionHistory(blindEntries);
  }

  // アクション検出
  if (prevSt && prevSt.phase === newState.phase) {
    const entry = detectAction(prevSt, newState, viewingSeat, nextIdRef.current);
    if (entry) {
      nextIdRef.current++;
      setActionHistory(prev => [...prev, entry]);
    }
  }

  prevStateForHistoryRef.current = newState;

  // ... 既存ロジック（BLEクライアント showdown 検出等）
});
```

### ストリート変更の検出

```typescript
const STREET_PHASES = ['preflop', 'flop', 'turn', 'river'] as const;

function isStreetChange(prevState: GameState, newState: GameState): boolean {
  const prevIdx = STREET_PHASES.indexOf(prevState.phase as any);
  const newIdx = STREET_PHASES.indexOf(newState.phase as any);
  // 異なるストリートに進んだ場合（preflop→flop, flop→turn, turn→river）
  return prevIdx >= 0 && newIdx > prevIdx;
}
```

### ブラインド検出

```typescript
function detectBlinds(
  state: GameState,
  viewingSeat: number,
  nextIdRef: React.MutableRefObject<number>,
): ActionHistoryEntry[] {
  const entries: ActionHistoryEntry[] = [];
  const dealer = state.dealer;
  const activePlayers = state.players.filter(p => p.status !== 'out');
  const playerCount = activePlayers.length;

  // SB / BB の seat を特定（ディーラー位置からの相対位置）
  // 2人: dealer = SB, 次 = BB
  // 3人以上: dealer+1 = SB, dealer+2 = BB
  let sbSeat: number;
  let bbSeat: number;

  if (playerCount === 2) {
    sbSeat = dealer;
    bbSeat = activePlayers.find(p => p.seat !== dealer)!.seat;
  } else {
    // dealer の次のアクティブプレイヤーが SB
    const sortedSeats = activePlayers.map(p => p.seat).sort((a, b) => a - b);
    const dealerIdx = sortedSeats.indexOf(dealer);
    sbSeat = sortedSeats[(dealerIdx + 1) % playerCount];
    bbSeat = sortedSeats[(dealerIdx + 2) % playerCount];
  }

  const sbPlayer = state.players.find(p => p.seat === sbSeat)!;
  const bbPlayer = state.players.find(p => p.seat === bbSeat)!;

  entries.push({
    id: nextIdRef.current++,
    playerName: sbPlayer.name,
    seat: sbSeat,
    action: 'call',
    amount: state.blinds.sb,
    isCurrentPlayer: sbSeat === viewingSeat,
    blind: 'sb',
  });

  entries.push({
    id: nextIdRef.current++,
    playerName: bbPlayer.name,
    seat: bbSeat,
    action: 'call',
    amount: state.blinds.bb,
    isCurrentPlayer: bbSeat === viewingSeat,
    blind: 'bb',
  });

  return entries;
}
```

### viewingSeat 変更時の isCurrentPlayer 更新

ホットシートモードでは `viewingSeat` がアクティブプレイヤーに追従する。`isCurrentPlayer` フィールドは表示時に動的に計算するほうが正確だが、パフォーマンスのため、ピル描画時に `entry.seat === viewingSeat` で直接比較する方式を採用する。`ActionHistoryEntry.isCurrentPlayer` フィールドは廃止し、コンポーネント側で判定する。

修正後の型:

```typescript
export interface ActionHistoryEntry {
  id: number;
  playerName: string;
  seat: number;
  action: ActionType;
  amount?: number;
  blind?: 'sb' | 'bb';
}
```

---

## 4. UIコンポーネント

### ディレクトリ構成

```
src/components/history/
├── ActionHistoryBar.tsx    — 横スクロールバーコンテナ
├── ActionPill.tsx          — 個別のピル型チップ
├── types.ts                — ActionHistoryEntry 型定義
└── detectAction.ts         — アクション検出ユーティリティ（純粋関数）
```

### ActionHistoryBar コンポーネント

```typescript
// src/components/history/ActionHistoryBar.tsx

import React, { useRef, useEffect } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { ActionPill } from './ActionPill';
import { Colors } from '../../theme/colors';

export function ActionHistoryBar() {
  const { actionHistory, viewingSeat, state } = useGame();
  const scrollRef = useRef<ScrollView>(null);

  // 非表示条件: ゲーム未開始 or waiting phase
  if (!state || state.phase === 'waiting') return null;

  // 自動スクロール: 履歴追加時に末尾へ
  useEffect(() => {
    if (scrollRef.current && actionHistory.length > 0) {
      // requestAnimationFrame で描画完了後にスクロール
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [actionHistory.length]);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {actionHistory.map(entry => (
          <ActionPill
            key={entry.id}
            entry={entry}
            isCurrentPlayer={entry.seat === viewingSeat}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 36,
    backgroundColor: Colors.background,
    paddingVertical: 4,
  },
  content: {
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
  },
});
```

### ActionPill コンポーネント

```typescript
// src/components/history/ActionPill.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ActionHistoryEntry } from './types';
import { Colors } from '../../theme/colors';

interface ActionPillProps {
  entry: ActionHistoryEntry;
  isCurrentPlayer: boolean;
}

function getActionLabel(entry: ActionHistoryEntry): string {
  if (entry.blind === 'sb') return `SB ${entry.amount}`;
  if (entry.blind === 'bb') return `BB ${entry.amount}`;

  switch (entry.action) {
    case 'fold':  return 'FOLD';
    case 'check': return 'CHECK';
    case 'call':  return `CALL ${entry.amount}`;
    case 'raise': return `RAISE ${entry.amount}`;
    case 'allIn': return `ALL IN ${entry.amount}`;
    default:      return entry.action.toUpperCase();
  }
}

export function ActionPill({ entry, isCurrentPlayer }: ActionPillProps) {
  const label = getActionLabel(entry);

  return (
    <View style={[
      styles.pill,
      isCurrentPlayer && styles.currentPlayer,
    ]}>
      <Text style={styles.text}>
        {entry.playerName} {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: '#374151',  // gray-700 (ダークグレー)
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  currentPlayer: {
    borderColor: Colors.active,  // #06B6D4 (シアン)
  },
  text: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
});
```

### GameView への組み込み

```typescript
// app/game.tsx — GameView 内
function GameView() {
  // ... 既存コード ...

  return (
    <View style={styles.screen}>
      <DebugInfoBar />
      <ActionHistoryBar />   {/* ← 追加 */}
      <TableLayout />
      <ActionButtons />
      <ResultOverlay />
    </View>
  );
}
```

---

## 5. BLE モードでの考慮事項

### ホスト側（ble-host）

- `BleHostGameService` は `handleAction()` 後に `broadcastState()` + `notifyListeners()` を呼ぶ
- `notifyListeners()` により `GameContext.subscribe` コールバックが発火し、アクション検出が実行される
- ホスト自身のアクションも、リモートクライアントのアクションも同じ経路で検出される

### クライアント側（ble-client）

- `BleClientGameService` は `stateUpdate` 受信時に `notifyListeners()` を呼ぶ
- `GameContext.subscribe` コールバック内で state diff によりアクションが検出される
- **全プレイヤーのアクションが可視:** stateUpdate はアクション毎に配信されるため、各プレイヤーのアクションが個別に検出される

### BLE固有の注意点

| ケース | 対応 |
|---|---|
| BLE遅延による stateUpdate の遅着 | stateUpdate は seq 順で処理されるため、履歴の順序は保証される |
| 再接続後の状態同期 | 再接続時にフル stateUpdate が送信されるが、中間アクションは復元されない。これは許容する（再接続後の新しいアクションから履歴に追加） |
| rematch メッセージ | rematch → stateUpdate（phase: preflop）到着時に履歴がリセットされる（既存のストリートリセット検出で対応） |
| frozenSeat の自動フォールド | ホスト側で `handleAction(seat, { action: 'fold' })` が呼ばれるため、通常のフォールドアクションとして履歴に追加される |

---

## 6. 既存ファイルへの変更一覧

| ファイル | 変更内容 |
|---|---|
| `src/components/history/types.ts` | **新規** — `ActionHistoryEntry` 型定義 |
| `src/components/history/detectAction.ts` | **新規** — `detectAction()`, `detectBlinds()`, `isStreetChange()` ユーティリティ（純粋関数、React非依存） |
| `src/components/history/ActionHistoryBar.tsx` | **新規** — 横スクロールバーコンテナ |
| `src/components/history/ActionPill.tsx` | **新規** — ピル型チップコンポーネント |
| `src/contexts/GameContext.tsx` | `actionHistory` state 追加、subscribe 内にアクション検出 + ストリートリセット + ブラインド検出ロジック追加 |
| `src/hooks/useGame.ts` | `actionHistory` を `GameContextValue` から公開（型変更のみ — `useGame` は `GameContextValue` をそのまま返すため実装変更不要） |
| `app/game.tsx` | `GameView` に `ActionHistoryBar` コンポーネントを追加（import + JSX） |

### GameContextValue の変更

```typescript
export interface GameContextValue {
  // ... 既存フィールド
  actionHistory: ActionHistoryEntry[];
}
```

---

## 7. テスト方針

### テストファイル構成

```
tests/
├── ui/components/history/
│   ├── detectAction.test.ts          — アクション検出ユーティリティ
│   ├── ActionHistoryBar.test.tsx      — バーコンポーネント
│   └── ActionPill.test.tsx            — ピルコンポーネント
└── ui/contexts/
    └── GameContext.test.tsx            — 既存ファイルに追加
```

### detectAction テスト

| テスト | 検証項目 |
|--------|---------|
| fold 検出 | status: active → folded で fold エントリ生成 |
| check 検出 | bet 変化なし + activePlayer 変化 → check |
| call 検出 | bet 増加 + currentBet 変化なし → call + 正しい callAmount |
| raise 検出 | bet 増加 + currentBet 増加 → raise + raise TO 値 |
| allIn 検出 | status: active → allIn → allIn + 正しい額 |
| activePlayer 未変化 | 同一 activePlayer → null（アクション未検出） |
| phase 変化時 | phase が異なる → null（ストリート遷移はアクションではない） |

### detectBlinds テスト

| テスト | 検証項目 |
|--------|---------|
| 4人テーブル | dealer+1 = SB, dealer+2 = BB のエントリ2件 |
| 2人テーブル（Heads-up） | dealer = SB, 相手 = BB |
| 3人テーブル | dealer+1 = SB, dealer+2 = BB |
| blind フィールド | SB エントリに `blind: 'sb'`、BB に `blind: 'bb'` |

### isStreetChange テスト

| テスト | 検証項目 |
|--------|---------|
| preflop → flop | true |
| flop → turn | true |
| turn → river | true |
| preflop → preflop | false（同一ストリート） |
| river → showdown | false（ストリート変更ではない） |
| showdown → preflop | false（showdown はストリートではない） |

### ActionPill テスト

| テスト | 検証項目 |
|--------|---------|
| fold 表示 | "PlayerName FOLD" |
| raise 表示 | "PlayerName RAISE 200" |
| SB ブラインド表示 | "PlayerName SB 5" |
| BB ブラインド表示 | "PlayerName BB 10" |
| 通常プレイヤー | シアンボーダーなし |
| カレントプレイヤー | シアンボーダーあり（`Colors.active`） |

### ActionHistoryBar テスト

| テスト | 検証項目 |
|--------|---------|
| 空履歴 | ピルが0件 |
| 複数エントリ | 各エントリに対応するピルが表示 |
| ゲーム未開始 | null（非表示） |
| waiting phase | null（非表示） |

### GameContext 統合テスト（既存ファイルに追加）

| テスト | 検証項目 |
|--------|---------|
| アクション後の履歴追加 | `doAction()` → `actionHistory` に1件追加 |
| ストリートリセット | flop 遷移時に履歴がクリアされ、空配列になる |
| ブラインド投稿 | preflop 開始時に SB / BB の2件が初期エントリとして存在 |
| rematch 後のリセット | `rematch()` → 新しい preflop → 履歴がリセットされ SB/BB のみ |

---

## 8. スコープ

### 今回のスコープ

- `ActionHistoryEntry` 型定義
- `detectAction()` / `detectBlinds()` / `isStreetChange()` ユーティリティ
- `ActionHistoryBar` コンポーネント（横スクロール + 自動スクロール）
- `ActionPill` コンポーネント（ピル型表示 + シアンボーダー）
- `GameContext` へのアクション履歴 state + 検出ロジック追加
- `GameView` への `ActionHistoryBar` 組み込み
- 上記の全 Jest テスト

### スコープ外

- アクション履歴のタップによる詳細表示
- アクション履歴の永続化（ゲームセッション内のみ保持）
- ストリートラベル表示（「FLOP」「TURN」等のセパレータ）
- アクションアニメーション（ピル追加時のフェードイン等）
- アクションタイマー表示との統合
