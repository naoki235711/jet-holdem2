# Rematch Flow & Chip Reset UI Design

**Date:** 2026-03-16
**Branch:** feature/matsuda/implement-test
**Depends on:** UI Design, BLE Game Play (Doc 3), Data Persistence (Doc 4)

## Overview

ゲーム終了後の再戦フローとチップリセットUIを実装する。全モード（hotseat / debug / ble-host / ble-client）に対応し、再戦時は全員の初期チップをリセットして新しいゲームを開始する。

## Context

### 現状
- ゲーム終了時、ResultOverlayに「ロビーに戻る」ボタンのみ表示
- 再戦するにはロビーに戻り、再度ゲーム開始が必要（BLEモードでは再スキャン・再接続が必要）
- チップは永続化されるが、保存済みチップをリセットするUIが存在しない

### 設計判断（ブレスト段階で確定済み）
1. **再戦時のチップ:** 全員初期チップにリセット（savedChipsなし）
2. **BLE対応:** 全モード対応。ホストが再戦を開始し、クライアントはstateUpdateで自動同期
3. **チップリセットUI:** ロビー画面に一括リセットボタン（個別リセット不要）
4. **再戦時の設定変更:** なし。同じ設定で即再戦。設定変更はロビーに戻る
5. **アプローチ:** GameService.startGame再呼び出し方式（インターフェース変更なし）

---

## 1. ResultOverlay の変更

### ゲーム終了時のボタン表示

**ローカルモード（hotseat / debug）・BLEホスト:**

```
[再戦]  [ロビーに戻る]
```

**BLEクライアント:**

```
ホストの操作を待っています...
[ロビーに戻る]
```

### 変更内容

- `isGameOver` ブロックに「再戦」ボタンを追加
- 「再戦」は `GameContext.rematch()` を呼ぶ
- 「ロビーに戻る」は既存の `router.replace('/')` のまま
- BLEクライアント（`mode === 'ble-client'`）では「再戦」ボタンを非表示にし、「ホストの操作を待っています...」テキストを表示
- BLEクライアントが「ロビーに戻る」を押した場合: BLE切断 → ホスト側の既存frozenSeats処理で対応
- `ResultOverlay` は `useGame()` から `mode` と `rematch` を追加で取得する

### ボタンスタイル

- 「再戦」: 既存の緑ボタン（`Colors.pot`）と同じスタイル
- 「ロビーに戻る」: 背景なし・テキストカラー（`Colors.subText`）の控えめなスタイルに変更。再戦が主アクション

### ResultOverlay の自動消去

`rematch()` 完了後、`service.startGame()` + `service.startRound()` により phase が `preflop` に遷移する。`ResultOverlay` は `state.phase === 'roundEnd'` のときのみ表示される（`isGameOver` はこの `roundEnd` phase 中に `playersWithChips.length <= 1` で判定される派生条件）。phase 変更で自然にアンマウントされるため、明示的な dismiss 処理は不要。

---

## 2. GameContext の `rematch()` メソッド

### インターフェース拡張

```typescript
interface GameContextValue {
  // ... 既存 ...
  rematch: () => void;  // 新規
}
```

### GameProviderProps 拡張

```typescript
interface GameProviderProps {
  // ... 既存 ...
  playerNames?: string[];  // 新規: rematch用に保持
}
```

`game.tsx` から `playerNames` を `GameProvider` に渡す。`game.tsx` では `playerNames` の計算を `useState` 初期化子の外に出し（`useMemo` または別の state 変数）、`GameProvider` の props として渡せるようにする。

### rematch() 実装

`blinds` はオブジェクトリテラルで props から渡されるため、毎レンダーで新しい参照が生成される。`useCallback` の依存配列に含めると不要な再生成が発生するため、既存の `serviceRef` パターンに倣い refs を使用する:

```typescript
// GameProvider 内
const playerNamesRef = useRef(playerNames);
playerNamesRef.current = playerNames;
const blindsRef = useRef(blinds);
blindsRef.current = blinds;
const initialChipsRef = useRef(initialChips);
initialChipsRef.current = initialChips;

const rematch = useCallback(() => {
  const names = playerNamesRef.current;
  const bl = blindsRef.current;
  const chips = initialChipsRef.current;
  if (!names || !bl || !chips) return;
  serviceRef.current.startGame(names, bl, chips);
  serviceRef.current.startRound();
  setShowdownResult(null);
}, []);  // 依存配列は空 — refs経由で最新値にアクセス
```

### ディーラー位置

再戦時は `startGame()` で新しい `GameLoop` が生成されるため、ディーラーはseat 0にリセットされる（新しいゲームと同じ挙動）。

### BLEクライアント側の showdownResult クリア

ローカル/ホストモードでは `rematch()` 内で `setShowdownResult(null)` を直接呼ぶ。BLEクライアントでは `rematch()` が呼ばれないため、別のメカニズムが必要。

GameContext の subscribe ハンドラに、BLEクライアント向けのリセット検出を追加:

```typescript
// GameContext subscribe ハンドラ内に追加
if (mode === 'ble-client' && newState.phase === 'preflop' && prevPhaseRef.current !== 'preflop') {
  setShowdownResult(null);
}
```

これにより、ホストからの rematch → stateUpdate（phase: preflop）到着時に、クライアント側の `showdownResult` がクリアされ、ResultOverlay が閉じる。

### モード別の動作

| モード | rematch() の動作 |
|---|---|
| hotseat / debug | `LocalGameService.startGame()` → 新しいGameLoop生成 → `startRound()` |
| ble-host | `BleHostGameService.startGame()` → 新しいGameLoop生成 + rematchメッセージ送信（`notifyListeners()` は呼ばない — `waiting` phase の中間通知は不要） → `startRound()` → broadcastState + sendPrivateHands + notifyListeners |
| ble-client | `rematch()` は呼ばれない。ホストからのrematchメッセージ + stateUpdateで自動同期 |

---

## 3. BLEプロトコル拡張

### GameProtocol.ts への追加

```typescript
// GameHostMessage に追加
| {
    type: 'rematch';
    seq: number;
  }
```

### BleHostGameService の変更

`startGame()` 内で、既に `gameLoop` が存在する場合（= 再戦）のみ `rematch` メッセージを送信する。初回ゲーム開始時（`gameLoop === null`）にはメッセージを送らない。

```typescript
startGame(playerNames: string[], blinds: Blinds, initialChips: number): void {
  const isRematch = this.gameLoop !== null;

  // 新しいGameLoop生成（既存ロジック）
  const players: Player[] = playerNames.map((name, i) => ({ ... }));
  this.gameLoop = new GameLoop(players, blinds);

  // 再戦時のみクライアントに通知
  if (isRematch) {
    this.sendToAll('gameState', { type: 'rematch', seq: 0 });
  }
}
```

### BleClientGameService の変更

`handleMessage()` 内の `gameState` 特性ハンドラに `rematch` ケースを追加:

```typescript
case 'rematch':
  this.lastShowdownResult = null;
  this.myCards = [];
  this.notifyListeners();  // UIのResultOverlayをクリア
  break;
```

`notifyListeners()` を呼ぶことで、直後の `stateUpdate` 到着前にUIがResultOverlayを閉じる。

### フロー

```
ホスト: 「再戦」ボタン押下
  ├── GameContext.rematch()
  │     ├── service.startGame(...) → GameLoop再生成 + rematchメッセージ送信
  │     └── service.startRound() → broadcastState() + sendPrivateHands()

クライアント: rematch メッセージ受信
  ├── lastShowdownResult = null
  ├── myCards = []
  ├── notifyListeners() → ResultOverlay閉じる
  └── 直後の stateUpdate で新しいゲーム状態を受信 → UI自動更新
```

### rematch メッセージの必要性

- stateUpdate だけでは「新しいゲーム」か「同じゲームの次のラウンド」か区別できない
- クライアント側で `showdownResult` / `myCards` を確実にクリアするトリガーが必要
- ResultOverlay を閉じるための明示的なシグナル

### バリデーション

`validateGameHostMessage()` に `type: 'rematch'` ケースを追加:

```typescript
case 'rematch':
  if (typeof data.seq !== 'number') return null;
  return { type: 'rematch', seq: data.seq };
```

---

## 4. 永続化の再戦対応

### subscribePersistence の roundCount リセット

`subscribePersistence`（usePersistence.ts）は `roundCount` をクロージャで保持している。再戦で `startGame()` が再呼び出しされると、subscribe リスナーはそのまま継続するため、`roundCount` が前のゲームから引き継がれてしまう。

**修正:** `gameOver` を検出したらフラグを立て、次に `preflop` が来たときに `roundCount` をリセットする:

```typescript
// subscribePersistence 内に追加
let sawGameOver = false;

// subscribe コールバック内
if (currentPhase === 'gameOver' && prevPhase !== 'gameOver') {
  sawGameOver = true;
  // ... 既存の gameOver 処理（saveGameRecord）
}

if (sawGameOver && currentPhase === 'preflop') {
  roundCount = 0;
  sawGameOver = false;
}
```

**なぜ単純な `prevPhase === 'gameOver' && currentPhase === 'preflop'` ではないか:**
`LocalGameService.startGame()` は `notify()` を呼び、`waiting` phase を発行する。そのため、ローカルモードでは遷移が `gameOver → waiting → preflop` となり、`prevPhase` が `waiting` の時点で `preflop` が到着する。フラグベースのアプローチなら `gameOver` → 中間 phase → `preflop` のどちらのパスでも正しく動作する。

---

## 5. チップリセットUI

### LobbyView.tsx の変更

ローカルモードの設定セクションに「チップをリセット」ボタンを追加:

```
── モード ──
○ ホットシート  ○ デバッグ

[チップをリセット]        ← 新規
[ゲーム開始]              ← 既存
```

### 動作

1. ボタン押下 → 確認ダイアログ表示「全プレイヤーの保存済みチップをリセットしますか？」
2. 「はい」→ 現在のプレイヤー名リスト全員の `repository.savePlayerChips(name, Number(initialChips))` を呼び出し（初期チップ値で上書き。`initialChips` は string state なので `Number()` 変換必須）
3. 完了後、ボタン下にフィードバックテキスト「リセットしました」を3秒表示

### GameRepository への変更

不要。既存の `savePlayerChips()` で初期値を上書きすれば十分。

### スタイル

- 「チップをリセット」: 背景なし・テキストカラー（`Colors.subText`）の控えめなボタン
- 誤操作防止のため確認ダイアログ（`Alert.alert`）必須
- 「ゲーム開始」ボタンの視覚的優先度を維持

---

## 6. 既存ファイルへの変更一覧

| ファイル | 変更内容 |
|---|---|
| `src/components/result/ResultOverlay.tsx` | `useGame()` から `mode`, `rematch` を追加取得。「再戦」ボタン追加、BLEクライアント用待機テキスト、「ロビーに戻る」スタイル変更 |
| `src/contexts/GameContext.tsx` | `rematch()` メソッド追加、`playerNames` props追加 |
| `app/game.tsx` | `GameProvider` に `playerNames` を渡す |
| `src/hooks/usePersistence.ts` | `subscribePersistence` 内で再戦時の `roundCount` リセット追加 |
| `src/services/ble/GameProtocol.ts` | `rematch` メッセージ型追加、`validateGameHostMessage` に rematch バリデーション追加 |
| `src/services/ble/BleHostGameService.ts` | `startGame()` 内で `gameLoop !== null` 時に `rematch` メッセージ送信 |
| `src/services/ble/BleClientGameService.ts` | `handleMessage` の gameState ハンドラに `rematch` ケース追加（showdownResult/myCards クリア + notifyListeners） |
| `src/components/lobby/LobbyView.tsx` | 「チップをリセット」ボタン追加 |

### 既存の不整合修正（スコープに含める）

`BleHostGameService.startGame()` および `BleClientGameService.startGame()` のシグネチャに `savedChips?: Record<string, number>` を追加し、`GameService` インターフェースと一致させる（既存の不整合を修正）。rematch では savedChips を渡さないため動作に影響なし。

---

## 7. テスト方針

### テスト対象（全て既存ファイルの拡張）

| ファイル | テスト内容 |
|---|---|
| `tests/ui/components/ResultOverlay.test.tsx` | gameOver時に「再戦」「ロビーに戻る」の2ボタン表示。BLEクライアント時は「再戦」非表示+待機テキスト |
| `tests/ui/contexts/GameContext.test.tsx` | `rematch()` で `startGame` + `startRound` 呼び出し、`showdownResult` クリア |
| `tests/ble/GameProtocol.test.ts` | `rematch` メッセージのバリデーション（正常: seq付き、不正: seq欠損） |
| `tests/ble/BleHostGameService.test.ts` | 初回 `startGame()` では rematch メッセージ未送信。2回目の `startGame()` で rematch メッセージ送信確認 |
| `tests/ble/BleClientGameService.test.ts` | `rematch` 受信で `showdownResult` / `myCards` クリア + リスナー通知確認 |
| `tests/ui/components/LobbyView.test.tsx` | リセットボタン表示、確認ダイアログ、`savePlayerChips` が `Number(initialChips)` で呼ばれる |
| `tests/persistence/usePersistence.test.ts` | gameOver → preflop 遷移で roundCount がリセットされ、再戦後のゲーム記録で rounds が正しい |

### テスト方針

- 新規テストファイルは作成しない（全て既存ファイルの拡張）
- モック方針は既存パターンに準拠
- 既存テストのResultOverlay gameOverボタン構成変更に伴う修正あり

---

## 8. スコープ

### 今回のスコープ

- ResultOverlay の再戦ボタン追加（全モード対応）
- GameContext の `rematch()` メソッド
- BLE `rematch` プロトコルメッセージ
- subscribePersistence の再戦対応（roundCount リセット）
- BleHostGameService.startGame() シグネチャ修正
- LobbyView のチップリセットボタン
- 上記のテスト

### スコープ外

- 再戦前の設定変更UI
- 個別プレイヤーのチップリセット
- BLEクライアント側からの再戦リクエスト機能
- 再戦回数の記録・表示
