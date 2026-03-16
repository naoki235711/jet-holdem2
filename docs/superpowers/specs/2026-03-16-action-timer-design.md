# Action Timer (30-Second Countdown) Design

**Date:** 2026-03-16
**Branch:** feature/matsuda/action-timer
**Depends on:** UI Design, BLE Game Play (Doc 3), GameContext, ActionButtons

## Overview

各プレイヤーのアクションに30秒の制限時間を設ける。タイムアウト時はチェック可能ならチェック、それ以外はフォールドを自動実行する。タイマーのUI表示はアクティブプレイヤーの座席付近にプログレスバーとして描画する。BLEモードではホストがタイマーの権威（authority）を持ち、クライアント側のタイマーは表示専用とする。

## Context

### 現状
- `GameState.actionTimeout: 30` がDoc 1で定義されているが、実装は未着手
- `GameContext` がゲーム状態管理とアクション制御を担当
- `PlayerSeat` コンポーネントがアクティブプレイヤーをシアンボーダーでハイライト
- `ActionButtons` が自分のターン判定とアクション実行を担当
- BLEモードでは `BleHostGameService` がGameLoopを所有し、`BleClientGameService` はstateUpdate受信のみ

### 設計判断
1. **タイマーロジックの配置:** `GameContext`に実装（GameEngineには追加しない）。理由: BLEモードではホスト側GameContextのみがタイマーを管理し、クライアント側は表示のみ。エンジンに入れるとBLE互換性が複雑になる
2. **タイマー値の設定:** デフォルト30秒。将来的に設定可能にする余地を残すが、初期実装は固定値
3. **デバッグモード:** `mode === 'debug'` ではタイマー無効（テスト時の利便性）
4. **UI表示:** PlayerSeat下部のプログレスバー（シアン → 赤のグラデーション遷移）
5. **BLE同期:** ホストがタイマーを管理し、タイムアウト時のauto-actionもホストが実行。クライアントは `stateUpdate` の `activePlayer` 変更でタイマーをリセット

---

## 1. Timer Management Architecture

### タイマーの責務分離

```
┌──────────────────────────────────────────────────┐
│ GameContext (タイマー管理)                          │
│                                                    │
│  useActionTimer(mode, state, doAction)             │
│    ├── remainingMs: number (残り時間)               │
│    ├── isRunning: boolean                          │
│    ├── タイマー制御 (start/reset/stop)              │
│    └── タイムアウト時 → doAction(autoAction)        │
│                                                    │
│  GameContextValue に追加:                           │
│    timerRemainingMs: number | null                  │
│    timerDurationMs: number                         │
└──────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────┐
│ UI Layer                                           │
│                                                    │
│  PlayerSeat                                        │
│    └── ActionTimerBar (プログレスバー表示)           │
│          ratio = remainingMs / durationMs          │
│                                                    │
│  ActionButtons                                     │
│    └── 残り時間テキスト表示 (任意)                   │
└──────────────────────────────────────────────────┘
```

### モード別の動作

| モード | タイマー管理者 | タイムアウトアクション実行者 | 表示 |
|---|---|---|---|
| hotseat | GameContext (useActionTimer) | GameContext | プログレスバー表示 |
| debug | 無効 | - | 表示なし |
| ble-host | GameContext (useActionTimer) | GameContext → BleHostGameService | プログレスバー表示 |
| ble-client | 表示のみ（stateUpdateのactivePlayer変更でリセット） | ホストが実行（クライアントは何もしない） | プログレスバー表示 |

### BLEモードの権威モデル

```
ホスト端末:
  activePlayer変更 → タイマー開始(30s)
  タイムアウト → auto-action実行 → broadcastState()
  プレイヤーがアクション → タイマーリセット（次のactivePlayerで再開）

クライアント端末:
  stateUpdate受信 → activePlayer変更検出 → ローカルタイマー開始(30s, 表示用)
  タイムアウト → 何もしない（ホストが処理済み）
  ※ BLEレイテンシにより数百ms程度のズレが生じるが、表示用なので許容範囲
```

---

## 2. useActionTimer Hook

### インターフェース

```typescript
// src/hooks/useActionTimer.ts

export const ACTION_TIMER_DURATION_MS = 30_000;
const TICK_INTERVAL_MS = 100;  // 100msごとに更新（滑らかなプログレスバー用）

interface UseActionTimerOptions {
  mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
  activePlayer: number;      // state.activePlayer
  phase: Phase;              // state.phase
  onTimeout: () => void;     // タイムアウト時のコールバック
}

interface UseActionTimerResult {
  remainingMs: number;       // 残り時間(ms)
  durationMs: number;        // 全体時間(ms) = ACTION_TIMER_DURATION_MS
  isRunning: boolean;        // タイマー稼働中か
}

export function useActionTimer(options: UseActionTimerOptions): UseActionTimerResult;
```

### 実装ロジック

```typescript
export function useActionTimer({
  mode,
  activePlayer,
  phase,
  onTimeout,
}: UseActionTimerOptions): UseActionTimerResult {
  const [remainingMs, setRemainingMs] = useState(ACTION_TIMER_DURATION_MS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  // タイマーが稼働すべきか判定
  const shouldRun =
    mode !== 'debug' &&
    activePlayer >= 0 &&
    (phase === 'preflop' || phase === 'flop' || phase === 'turn' || phase === 'river');

  // activePlayer または phase が変わったらタイマーリセット
  useEffect(() => {
    // クリーンアップ
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!shouldRun) {
      setRemainingMs(ACTION_TIMER_DURATION_MS);
      return;
    }

    // タイマー開始
    const startTime = Date.now();
    setRemainingMs(ACTION_TIMER_DURATION_MS);

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, ACTION_TIMER_DURATION_MS - elapsed);
      setRemainingMs(remaining);

      if (remaining <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        onTimeoutRef.current();
      }
    }, TICK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activePlayer, phase, shouldRun]);

  return {
    remainingMs,
    durationMs: ACTION_TIMER_DURATION_MS,
    isRunning: shouldRun && remainingMs > 0,
  };
}
```

### 設計ポイント

- **`Date.now()` ベース:** `setInterval` のドリフト（JS のタイマーは保証されない）を防ぐため、経過時間を `Date.now()` で計算。表示と実際のタイムアウトが一致する
- **`onTimeoutRef`:** コールバックをrefで保持し、useEffectの依存配列に含めない。これにより `doAction` の再生成でタイマーがリセットされるのを防止
- **100ms tick:** プログレスバーの滑らかさと性能のバランス。1秒刻みではカクつく、16ms (60fps) は過剰
- **`shouldRun` 判定:** `debug` モードで無効化。ベッティングフェーズ（preflop/flop/turn/river）以外ではタイマーを停止（showdown/roundEnd/waiting/gameOver では不要）
- **クライアントも同じhookを使用:** `onTimeout` がno-opになるだけで、表示用のタイマーは動作する

---

## 3. GameContext Integration

### GameContextValue の拡張

```typescript
export interface GameContextValue {
  // ... 既存 ...
  timerRemainingMs: number | null;  // null = タイマー無効（debugモード等）
  timerDurationMs: number;          // ACTION_TIMER_DURATION_MS
}
```

### GameProvider 内での統合

```typescript
export function GameProvider({ children, service, mode, ... }: GameProviderProps) {
  // ... 既存のstate, viewingSeat, showdownResult ...

  const handleTimeout = useCallback(() => {
    // debugモードでは呼ばれないが、念のためガード
    if (mode === 'debug') return;

    // BLEクライアントではタイムアウトアクションを実行しない（ホストが処理）
    if (mode === 'ble-client') return;

    const currentState = serviceRef.current.getState();
    if (currentState.activePlayer < 0) return;

    const seat = currentState.activePlayer;
    const actionInfo = serviceRef.current.getActionInfo(seat);

    // チェック可能ならチェック、それ以外はフォールド
    if (actionInfo.canCheck) {
      doAction(seat, { action: 'check' });
    } else {
      doAction(seat, { action: 'fold' });
    }
  }, [mode, doAction]);

  const { remainingMs, durationMs, isRunning } = useActionTimer({
    mode,
    activePlayer: state?.activePlayer ?? -1,
    phase: state?.phase ?? 'waiting',
    onTimeout: handleTimeout,
  });

  const value: GameContextValue = {
    // ... 既存 ...
    timerRemainingMs: mode === 'debug' ? null : (isRunning ? remainingMs : null),
    timerDurationMs: durationMs,
  };

  // ...
}
```

### タイムアウト時の自動アクション決定ロジック

```
タイムアウト発生
  │
  ├── mode === 'debug' → 何もしない
  ├── mode === 'ble-client' → 何もしない（ホストが処理）
  │
  └── mode === 'hotseat' / 'ble-host'
        │
        ├── getActionInfo(activePlayer)
        │     ├── canCheck === true → doAction(seat, { action: 'check' })
        │     └── canCheck === false → doAction(seat, { action: 'fold' })
        │
        └── doAction内でshowdown自動解決等の既存ロジックが動作
```

### hotseatモードでの考慮

hotseatモードでは全プレイヤーが同一端末でプレイする。タイマーは全プレイヤーに等しく適用される。ターンが変わるとviewingSeatも自動切替（既存ロジック）されるため、次のプレイヤーに30秒のタイマーが自然に開始される。

---

## 4. BLE Sync Strategy

### ホスト側（BleHostGameService）

ホストのGameContextが `useActionTimer` を通じてタイマーを管理する。タイムアウト時は `doAction()` が呼ばれ、`BleHostGameService.handleAction()` → `GameLoop.handleAction()` → `broadcastState()` の既存フローで処理される。

**BleHostGameService への変更は不要。** タイマーはGameContext層で完結し、GameService層には影響しない。

### クライアント側（BleClientGameService）

クライアントのGameContextも同じ `useActionTimer` hookを使用するが、`onTimeout` は何もしない（`mode === 'ble-client'` ガード）。

クライアントのタイマーはstateUpdate受信によるactivePlayer変更で自動リセットされる。BLEレイテンシ（通常50-200ms）により、ホストのタイマーとクライアントの表示タイマーに若干のズレが生じるが、以下の理由で問題ない:

- クライアントのタイマーは**表示専用**（アクション権限はホストのみ）
- 最悪ケースでも200ms程度のズレで、UX上問題にならない
- ホストのタイムアウトが先に発動し、stateUpdate（activePlayer変更）が配信されるため、クライアント側の表示タイマーは自然に次のプレイヤーに切り替わる

### stateUpdateメッセージへの変更

**変更なし。** タイマー開始時刻やremainingをBLEメッセージに含めない設計を選択する。

理由:
- activePlayerの変更がタイマーリセットのトリガーとして十分
- BLEレイテンシを考慮した「正確な残り時間」の同期は、ゲーム体験に対して複雑さが見合わない
- クライアントがstateUpdateを受信した時点でローカルに30秒タイマーを開始すれば、実用上十分な精度

### フロー図

```
ホスト: handleAction(seat, action)
  │
  ├── GameLoop.handleAction() → 成功
  ├── broadcastState() → stateUpdate送信（新しいactivePlayer）
  ├── notifyListeners() → GameContext.state更新
  │     └── useActionTimer: activePlayer変更検出 → タイマーリセット(30s)
  │
  └── 30秒経過（タイムアウト）
        └── handleTimeout() → doAction(seat, { action: 'check' or 'fold' })
              └── 上記のhandleAction()フローに合流

クライアント: stateUpdate受信
  │
  ├── currentState更新 → notifyListeners()
  │     └── GameContext.state更新
  │           └── useActionTimer: activePlayer変更検出 → 表示タイマーリセット(30s)
  │
  └── 30秒経過（クライアント側タイムアウト）
        └── handleTimeout() → mode === 'ble-client' → 何もしない
              （ホスト側のタイムアウトが先に処理済み）
```

---

## 5. UI Display — ActionTimerBar

### コンポーネント設計

```typescript
// src/components/table/ActionTimerBar.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

interface ActionTimerBarProps {
  remainingMs: number;
  durationMs: number;
}

export function ActionTimerBar({ remainingMs, durationMs }: ActionTimerBarProps) {
  const ratio = Math.max(0, Math.min(1, remainingMs / durationMs));

  // 色の遷移: シアン(100%) → 黄色(50%) → 赤(0%)
  const color = timerColor(ratio);

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

function timerColor(ratio: number): string {
  if (ratio > 0.5) {
    // シアン → 黄色 (1.0 → 0.5)
    const t = (ratio - 0.5) / 0.5;  // 1.0 → 0.0
    return interpolateColor(Colors.timerWarning, Colors.active, t);
  } else {
    // 黄色 → 赤 (0.5 → 0.0)
    const t = ratio / 0.5;  // 1.0 → 0.0
    return interpolateColor(Colors.timerDanger, Colors.timerWarning, t);
  }
}

function interpolateColor(colorA: string, colorB: string, t: number): string {
  // hex→RGB→lerp→hex の簡易補間
  const [rA, gA, bA] = hexToRgb(colorA);
  const [rB, gB, bB] = hexToRgb(colorB);
  const r = Math.round(rA + (rB - rA) * t);
  const g = Math.round(gA + (gB - gA) * t);
  const b = Math.round(bA + (bB - bA) * t);
  return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 1.5,
    overflow: 'hidden',
    marginTop: 4,
    width: '100%',
  },
  fill: {
    height: '100%',
    borderRadius: 1.5,
  },
});
```

### カラーテーマへの追加

```typescript
// src/theme/colors.ts に追加
export const Colors = {
  // ... 既存 ...
  timerWarning: '#FBBF24',    // 黄色（残り50%以下）
  timerDanger: '#EF4444',     // 赤（残り0%に近い）
} as const;
```

色の遷移:
- **100% → 50%:** シアン(`#06B6D4`) → 黄色(`#FBBF24`) — 余裕あり
- **50% → 0%:** 黄色(`#FBBF24`) → 赤(`#EF4444`) — 緊迫感を演出

### PlayerSeat への統合

```typescript
// src/components/table/PlayerSeat.tsx の変更

import { ActionTimerBar } from './ActionTimerBar';
import { useGame } from '../../hooks/useGame';

export function PlayerSeat({ seat }: PlayerSeatProps) {
  const { state, mode, viewingSeat, timerRemainingMs, timerDurationMs } = useGame();
  // ... 既存ロジック ...

  const isActive = state.activePlayer === seat;
  const showTimer = isActive && timerRemainingMs !== null;

  return (
    <View
      testID={`player-seat-${seat}`}
      style={[
        styles.container,
        isActive && styles.active,
        isFolded && styles.folded,
      ]}
    >
      {/* ... 既存のheader, cards, chips, bet ... */}

      {showTimer && (
        <ActionTimerBar
          remainingMs={timerRemainingMs}
          durationMs={timerDurationMs}
        />
      )}
    </View>
  );
}
```

### レイアウト位置

```
┌────────┐
│ Alice  D│ ← header (name + dealer badge)
│ [K♠][J♦]│ ← cards
│  1000   │ ← chip stack
│   50    │ ← bet amount (if > 0)
│ ═══●═══ │ ← ActionTimerBar (active player only)
└────────┘
```

- プログレスバーはPlayerSeatの最下部に配置（containerの padding 内）
- 高さ 3px、幅はcontainerの幅に合わせる
- アクティブプレイヤー以外では非表示（高さ0、レイアウトシフトなし）

---

## 6. Component Changes Summary

### 新規ファイル

| ファイル | 内容 |
|---|---|
| `src/hooks/useActionTimer.ts` | タイマーhook（`useActionTimer`）。タイマーの開始・リセット・停止・タイムアウトコールバック |
| `src/components/table/ActionTimerBar.tsx` | タイマープログレスバーUIコンポーネント |

### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `src/contexts/GameContext.tsx` | `useActionTimer` hook統合。`GameContextValue` に `timerRemainingMs`, `timerDurationMs` を追加。`handleTimeout` コールバック追加 |
| `src/components/table/PlayerSeat.tsx` | `ActionTimerBar` を条件付きレンダリング。`useGame()` から `timerRemainingMs`, `timerDurationMs` を追加取得 |
| `src/theme/colors.ts` | `timerWarning`, `timerDanger` の2色追加 |
| `src/hooks/useGame.ts` | 変更なし（`GameContextValue` の型変更で自動的に対応） |

### 変更しないファイル

| ファイル | 理由 |
|---|---|
| `src/gameEngine/GameLoop.ts` | タイマーはGameContext層で管理。エンジンには入れない |
| `src/gameEngine/types.ts` | `GameState` にタイマーフィールドを追加しない |
| `src/services/GameService.ts` | インターフェース変更なし |
| `src/services/ble/GameProtocol.ts` | stateUpdateメッセージに変更なし |
| `src/services/ble/BleHostGameService.ts` | タイマーはGameContext層。サービス層は無関係 |
| `src/services/ble/BleClientGameService.ts` | 同上 |
| `src/components/actions/ActionButtons.tsx` | タイマー表示はPlayerSeatに配置。ActionButtonsは変更不要 |

---

## 7. Test Strategy

### テストファイル構成

```
tests/
├── hooks/
│   └── useActionTimer.test.ts          — (新規) タイマーhookのユニットテスト
├── ui/
│   ├── components/
│   │   └── ActionTimerBar.test.tsx      — (新規) プログレスバー表示テスト
│   └── contexts/
│       └── GameContext.test.tsx          — (既存拡張) タイマー統合テスト
└── (既存テストに影響なし)
```

### テスト内容

| テスト | 検証項目 |
|---|---|
| **useActionTimer: 基本動作** | activePlayer >= 0 かつベッティングフェーズで `isRunning === true`、`remainingMs` が減少すること |
| **useActionTimer: タイムアウト** | 30秒経過後に `onTimeout` コールバックが呼ばれること（`jest.advanceTimersByTime(30000)`） |
| **useActionTimer: リセット** | `activePlayer` が変わると `remainingMs` が30000にリセットされること |
| **useActionTimer: debugモード無効** | `mode === 'debug'` で `isRunning === false`、`onTimeout` が呼ばれないこと |
| **useActionTimer: 非ベッティングフェーズ** | `phase === 'showdown'` 等では `isRunning === false` |
| **useActionTimer: activePlayer === -1** | `isRunning === false`（アクティブプレイヤーなし） |
| **ActionTimerBar: ratio計算** | `remainingMs=15000, durationMs=30000` でバーが50%幅で表示されること |
| **ActionTimerBar: 色遷移** | ratio > 0.5 でシアン系、ratio < 0.5 で黄色系〜赤系であること |
| **GameContext: タイムアウト→check** | canCheck=true のとき、タイムアウトで `handleAction(seat, {action:'check'})` が呼ばれること |
| **GameContext: タイムアウト→fold** | canCheck=false のとき、タイムアウトで `handleAction(seat, {action:'fold'})` が呼ばれること |
| **GameContext: ble-clientタイムアウト** | `mode === 'ble-client'` でタイムアウトしても `handleAction` が呼ばれないこと |
| **GameContext: timerRemainingMs** | debugモードで `timerRemainingMs === null`、通常モードで数値が返ること |

### モック方針

- `jest.useFakeTimers()` を使用し、`jest.advanceTimersByTime()` でタイマーを制御
- `Date.now()` もfake timersでモックされる（Jestのデフォルト動作）
- `useActionTimer` のテストでは `@testing-library/react-hooks` の `renderHook` を使用
- `ActionTimerBar` のテストでは `@testing-library/react-native` の `render` を使用
- GameContextテストでは既存のモック `GameService` パターンを踏襲

### テスト対象外

- BLE経由のタイマー同期精度テスト（実機テストの範囲）
- パフォーマンステスト（100ms tickの負荷）
- アニメーション滑らかさの視覚テスト

---

## 8. Edge Cases

### ラウンド終了間際のタイムアウト

タイムアウトによるauto-actionがラウンドを終了させる場合（最後のプレイヤーがfold → 1人残り）:
- `doAction` → `handleAction` → `GameLoop` が `roundEnd` フェーズに遷移
- useActionTimerの次のtickで `phase !== ベッティングフェーズ` を検出 → `shouldRun = false` → タイマー停止
- 問題なし: 既存の `doAction` フローでshowdown自動解決も含めて正しく動作する

### 同時タイムアウトとユーザーアクション

ユーザーがアクションボタンを押す直前にタイムアウトが発動する場合:
- `doAction` は `GameLoop.handleAction` のバリデーション（ターン確認）で保護されている
- タイムアウトのauto-actionが先に処理された場合、activePlayerが変わるため、遅れたユーザーアクションは `activePlayer !== seat` で無効となる
- React stateの更新はバッチ処理されるため、同一tickでの二重アクションは防止される

### allInプレイヤーのスキップ

allInプレイヤーにターンが回ることはない（`BettingRound` がスキップする）。したがってタイマーはallInプレイヤーに対して開始されない。

### ゲーム開始直後のタイマー

`startRound()` → phase='preflop' + activePlayer設定 → stateUpdate → useActionTimerが検出 → タイマー開始。preflop のBB postまでは `BettingRound.createPreflop` 内で自動処理されるため、タイマーはUTG（最初にアクションするプレイヤー）から開始される。

### rematch時のタイマー

rematch → `startGame()` + `startRound()` → 新しいGameLoop → 新しいstate → activePlayer変更 → タイマーリセット。既存のuseActionTimerのリセットロジックで自然に対応される。

---

## 9. Future Considerations

### タイマー時間の設定可能化

将来的にロビー画面でタイマー時間（15s / 30s / 60s / 無制限）を選択可能にする場合:

1. `ACTION_TIMER_DURATION_MS` を `GameProvider` のpropsとして受け取る
2. BLEモードでは `gameStart` メッセージにタイマー設定を含める
3. `useActionTimer` の `durationMs` パラメータを外部から注入

現在の実装では `ACTION_TIMER_DURATION_MS` を定数として定義しつつ、hookのインターフェースは `durationMs` を返すようにしておき、将来の拡張に備える。

### タイムバンク（追加時間）

トーナメント形式で「タイムバンク」（各プレイヤーに追加時間のプール）を持たせる拡張:
- `useActionTimer` に `bonusMs` パラメータを追加
- 通常タイマーが0になったら自動的にタイムバンクに移行
- 現時点ではスコープ外

---

## 10. Scope

### 今回のスコープ

- `useActionTimer` hook 新規作成
- `ActionTimerBar` UIコンポーネント新規作成
- `GameContext` へのタイマー統合（`timerRemainingMs`, `timerDurationMs`, `handleTimeout`）
- `PlayerSeat` への `ActionTimerBar` 追加
- `Colors` にタイマー用カラー追加（`timerWarning`, `timerDanger`）
- 上記の全Jestテスト

### スコープ外

- タイマー時間のユーザー設定UI（将来）
- BLEメッセージへのタイマー情報追加（不要と判断）
- GameEngine/GameLoopへの変更（不要）
- タイムバンク機能（将来）
- タイマー音声アラート（将来検討）
- アニメーション（React Native Animated / Reanimated）によるプログレスバーの滑らか化（初期は `width` percentage で十分。必要に応じて後から追加）
