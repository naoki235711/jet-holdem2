# Action Timer (30-Second Countdown) Design

**Date:** 2026-03-16 (revised 2026-03-17)
**Branch:** feature/matsuda/action-timer
**Depends on:** GameContext, PlayerSeat, BLE Game Play

## Overview

各プレイヤーのアクションに30秒の制限時間を設ける。タイムアウト時はチェック可能ならチェック、それ以外はフォールドを自動実行する。UIはアクティブプレイヤーの座席にプログレスバーとして表示する。BLEモードではホストがタイマーの権威（authority）を持ち、クライアント側のタイマーは表示専用とする。

## Design Decisions

| 判断 | 選択 | 理由 |
|---|---|---|
| タイマーロジックの配置 | GameContext層（`useActionTimer` hook） | GameEngineに入れるとBLEモードで権威の分離が複雑になる。GameContext層なら、モード別の分岐が自然に書ける |
| BLE権威モデル | ホストのみがタイムアウトアクションを実行 | 既存の`BleHostGameService`がGameLoopを所有する設計と一致。クライアントは表示専用 |
| BLEメッセージ変更 | なし | `activePlayer`の変更がタイマーリセットのトリガーとして十分。残り時間の同期は複雑さに見合わない |
| タイマー時間 | 30秒固定（`ACTION_TIMER_DURATION_MS`定数） | 設定可能化は将来必要になった時に対応 |
| debugモード | タイマー無効 | テスト時の利便性 |
| tick間隔 | 100ms | プログレスバーの滑らかさとパフォーマンスのバランス |
| 時間計測方式 | `Date.now()`ベース | `setInterval`のドリフトを防止。バックグラウンド復帰時も正確な経過時間を取得できる |

### 既知の制限

BLEホスト端末がバックグラウンドに移行した場合、JS実行が凍結されるため、復帰するまでタイムアウトは発火しない。復帰時に`Date.now()`で経過を検出し即発火する。クライアントやhotseatモードでは問題にならない。

---

## 1. Mode Behavior & BLE Sync

### モード別の動作

| モード | タイマー管理 | タイムアウト実行 | UI表示 |
|---|---|---|---|
| hotseat | `useActionTimer`が管理 | GameContextが`doAction`でチェック/フォールド | プログレスバー表示 |
| debug | 無効 | - | 表示なし |
| ble-host | `useActionTimer`が管理 | GameContextが`doAction` → `BleHostGameService.handleAction` → `broadcastState` | プログレスバー表示 |
| ble-client | 表示専用（`activePlayer`変更でリセット） | 何もしない（ホストが処理済み） | プログレスバー表示 |

### BLE同期フロー

```
ホスト端末:
  activePlayer変更 → タイマー開始(30s)
  プレイヤーがアクション → doAction → 次のactivePlayerでタイマーリセット
  タイムアウト → doAction(check or fold) → broadcastState()

クライアント端末:
  stateUpdate受信 → activePlayer変更検出 → ローカルタイマー開始(30s, 表示用)
  タイムアウト → mode === 'ble-client' → 何もしない
  ※ BLEレイテンシ(50-200ms)によるズレは表示用なので許容
```

ホスト・クライアントとも同じ`useActionTimer` hookを使う。違いは`onTimeout`コールバックの中身だけ（クライアントはno-op）。

BleHostGameService・BleClientGameServiceへの変更は不要。stateUpdateメッセージへの変更も不要。タイマーはGameContext層で完結する。

---

## 2. useActionTimer Hook

### インターフェース

```typescript
// src/hooks/useActionTimer.ts

export const ACTION_TIMER_DURATION_MS = 30_000;

interface UseActionTimerOptions {
  mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
  activePlayer: number;      // state.activePlayer
  phase: Phase;              // state.phase
  onTimeout: () => void;     // タイムアウト時のコールバック
}

interface UseActionTimerResult {
  remainingMs: number;       // 残り時間(ms)
  durationMs: number;        // 全体時間(ms)
  isRunning: boolean;        // タイマー稼働中か
}

export function useActionTimer(options: UseActionTimerOptions): UseActionTimerResult;
```

### 動作ルール

- `mode === 'debug'` → タイマー無効（`isRunning: false`）
- `activePlayer < 0` → タイマー無効（アクティブプレイヤーなし）
- `phase`がベッティングフェーズ（preflop/flop/turn/river）以外 → タイマー無効
- `activePlayer`または`phase`が変わるとタイマーを30秒にリセット
- `remainingMs`が0に達したら`onTimeout`を1回だけ呼ぶ
- `onTimeout`はrefで保持し、コールバックの再生成でタイマーがリセットされるのを防ぐ
- 時間計測は`Date.now()`ベース、100ms間隔でtick

---

## 3. GameContext Integration

### GameContextValueへの追加

```typescript
export interface GameContextValue {
  // ... 既存フィールド ...
  timerRemainingMs: number | null;  // null = タイマー無効
  timerDurationMs: number;
}
```

### handleTimeoutの設計

GameProvider内で`handleTimeout`コールバックを定義し、`useActionTimer`の`onTimeout`に渡す。

```typescript
handleTimeout = () => {
  if (mode === 'debug' || mode === 'ble-client') return;

  // 重要: onTimeoutRefパターンによりクロージャが古くなるため、
  // Reactのstateではなくserviceから最新の値を読む
  const currentState = serviceRef.current.getState();
  if (currentState.activePlayer < 0) return;

  const seat = currentState.activePlayer;
  const actionInfo = serviceRef.current.getActionInfo(seat);

  if (actionInfo.canCheck) {
    doAction(seat, { action: 'check' });
  } else {
    doAction(seat, { action: 'fold' });
  }
  // doActionの戻り値(ActionResult)は意図的に無視する。
  // ユーザーアクションとの競合時にvalid=falseが返る場合があるが、
  // その場合activePlayerは既に進んでおりタイマーも自然にリセットされる。
};
```

`handleTimeout`は`onTimeoutRef`経由で渡されるため、コールバックの再生成でタイマーがリセットされることはない。ただし、クロージャ内のReact stateは古くなる可能性があるため、`serviceRef.current`から最新の状態を読む。

### timerRemainingMsの値

| 条件 | 値 |
|---|---|
| `mode === 'debug'` | `null` |
| タイマー稼働中 | `remainingMs`の数値 |
| ベッティングフェーズ外 | `null` |

---

## 4. UI — PlayerSeat Layout & ActionTimerBar

### PlayerSeatレイアウト変更

```
        [D]              ← dealer button (外側、コンテナ上部)
   ┌────────┐
   │  Alice  │           ← name
   │ [K♠][J♦]│           ← cards
   │  1000   │           ← chip stack
   │  ALL IN │           ← status badge (folded/allIn時のみ)
   │ ═══●═══ │           ← timer bar (常にスペース確保、非アクティブ時は透明)
   └────────┘
      [50]               ← bet amount (外側、テーブル中央寄り)
```

### 現状からの変更点

| 要素 | 現状 | 変更後 |
|---|---|---|
| ディーラーバッジ | name行の右側 (`Alice D`) | コンテナ外側の上部に独立配置 |
| ベット額 | コンテナ内部 | コンテナ外側の下部（テーブル中央寄り） |
| ステータスバッジ | `opacity: 0.5`でfolded表現 | "FOLDED" / "ALL IN"テキストバッジを表示（opacityも維持） |
| タイマーバー | （新規） | 常にスペース確保、非アクティブ時は透明 |

### ActionTimerBar

- コンポーネント: `src/components/table/ActionTimerBar.tsx`
- インターフェース: `{ remainingMs: number; durationMs: number; isActive: boolean }`
- `isActive === false`: トラックもフィルも透明（高さ3pxのスペースは維持）
- `isActive === true`: トラック表示 + フィルバーでカウントダウン

### 色の遷移

`ratio = remainingMs / durationMs`（1.0 = 全時間残り、0.0 = 時間切れ）

- ratio 1.0 → 0.5: シアン(`Colors.active` = `#06B6D4`) → 黄色(`#FBBF24`)
- ratio 0.5 → 0.0: 黄色(`#FBBF24`) → 赤(`#EF4444`)
- 2色間のRGB線形補間で中間色を算出

### colors.tsへの追加

```typescript
timerWarning: '#FBBF24',    // 黄色
timerDanger: '#EF4444',     // 赤
```

---

## 5. Changes Summary

### 新規ファイル

| ファイル | 内容 |
|---|---|
| `src/hooks/useActionTimer.ts` | タイマーhook |
| `src/components/table/ActionTimerBar.tsx` | プログレスバーUI |

### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `src/contexts/GameContext.tsx` | `useActionTimer`統合、`GameContextValue`に2フィールド追加、`handleTimeout`追加 |
| `src/components/table/PlayerSeat.tsx` | レイアウト再構成（ディーラーバッジ外出し、ベット額外出し、ステータスバッジ追加）、`ActionTimerBar`追加 |
| `src/theme/colors.ts` | `timerWarning`, `timerDanger`追加 |
| `tests/ui/helpers/renderWithGame.tsx` | `GameContextValue`に追加された`timerRemainingMs`, `timerDurationMs`のデフォルト値を設定 |

### 変更しないファイル

GameLoop, GameState型, GameService, BLEプロトコル/サービス, ActionButtons

---

## 6. Edge Cases

| ケース | 動作 |
|---|---|
| タイムアウトでラウンド終了 | `doAction` → `roundEnd`遷移 → phaseがベッティング外 → タイマー停止。既存フローで正常動作 |
| ユーザーアクションとタイムアウトが同時 | `GameLoop.handleAction`のターン確認で保護。先に処理された方がactivePlayerを変え、後発は無効化。`doAction`の戻り値(valid=false)は意図的に無視する |
| allInプレイヤー | `BettingRound`がスキップ。タイマーは開始されない |
| rematch | 新しいstate → activePlayer変更 → タイマー自然にリセット |
| BLEホストがバックグラウンド | 復帰時に`Date.now()`で経過検出 → 即タイムアウト発火（既知の制限） |
| BLEクライアント切断中のタイムアウト | `BleHostGameService`の既存disconnect-freezeタイマー（30秒）がforceFoldを実行する。アクションタイマーも同時に走るが、forceFoldがactivePlayerを進めるため、アクションタイマーのタイムアウト時の`doAction`はターン確認で無効化される。二重処理は起きない |
| プリアクション設定済みのプレイヤー | プリアクション（checkFold/call/callAny）はstateのsubscribeコールバック内で同期的に実行される。`useActionTimer`のuseEffectはその後に発火するため、タイマーはプリアクション解決後の新しいactivePlayerに対して開始される |
| hotseatモードのPassDeviceScreen | activePlayer変更でタイマーが開始されるが、PassDeviceScreenの表示中もカウントは進行する。30秒の中にデバイス受け渡し時間が含まれる（既知の制限） |
| ステータスバッジとタイマーバーの同時表示 | allInプレイヤーにはターンが回らないため、"ALL IN"バッジとアクティブタイマーは同時に表示されない。"FOLDED"も同様 |

---

## 7. Test Strategy

### テストファイル

| ファイル | 内容 |
|---|---|
| `tests/hooks/useActionTimer.test.ts` | （新規）タイマーhookのユニットテスト |
| `tests/ui/components/ActionTimerBar.test.tsx` | （新規）プログレスバー表示テスト |
| `tests/ui/contexts/GameContext.test.tsx` | （既存拡張）タイマー統合テスト |

### テスト項目

**useActionTimer:**
- activePlayer >= 0 かつベッティングフェーズで `isRunning === true`、`remainingMs` が減少すること
- 30秒経過後に `onTimeout` が1回呼ばれること
- `activePlayer` が変わると `remainingMs` が30000にリセットされること
- `mode === 'debug'` で `isRunning === false`、`onTimeout` が呼ばれないこと
- `phase === 'showdown'` 等では `isRunning === false`
- `activePlayer === -1` で `isRunning === false`
- `Date.now()`が大きくジャンプした場合（バックグラウンド復帰シミュレーション）、次のtickで即タイムアウトが発火すること

**ActionTimerBar:**
- `remainingMs=15000, durationMs=30000` でバーが50%幅
- ratio > 0.5 でシアン系、ratio < 0.5 で黄色〜赤系
- `isActive === false` で透明表示（スペースは確保）

**GameContext統合:**
- canCheck=true のとき、タイムアウトでcheckが呼ばれること
- canCheck=false のとき、タイムアウトでfoldが呼ばれること
- `mode === 'ble-client'` でタイムアウトしても`handleAction`が呼ばれないこと
- debugモードで `timerRemainingMs === null`

### モック方針

- `jest.useFakeTimers()` + `jest.advanceTimersByTime()`でタイマー制御
- `useActionTimer`のテストではコンポーネントをrenderしてhookを消費（既存テストパターンに準拠）
- GameContextテストでは既存のモック`GameService`パターンを踏襲
