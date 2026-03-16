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

### ボタンスタイル

- 「再戦」: 既存の緑ボタン（`Colors.pot`）と同じスタイル
- 「ロビーに戻る」: 背景なし・テキストカラー（`Colors.subText`）の控えめなスタイルに変更。再戦が主アクション

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

`game.tsx` から `playerNames` を `GameProvider` に渡す。

### rematch() 実装

```typescript
const rematch = useCallback(() => {
  if (!playerNames) return;
  serviceRef.current.startGame(
    playerNames,
    blinds ?? { sb: 0, bb: 0 },
    initialChips ?? 0,
    // savedChips なし → 全員初期チップ
  );
  serviceRef.current.startRound();
  setShowdownResult(null);
}, [playerNames, blinds, initialChips]);
```

### モード別の動作

| モード | rematch() の動作 |
|---|---|
| hotseat / debug | `LocalGameService.startGame()` → 新しいGameLoop生成 → `startRound()` |
| ble-host | `BleHostGameService.startGame()` → 新しいGameLoop生成 → rematchメッセージ送信 → `startRound()` → broadcastState + sendPrivateHands |
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

### フロー

```
ホスト: 「再戦」ボタン押下
  ├── GameContext.rematch()
  │     ├── service.startGame(...) → 新しいGameLoop生成
  │     └── service.startRound() → broadcastState() + sendPrivateHands()
  └── BleHostGameService内部:
        ├── startGame() で rematch メッセージを全クライアントに送信
        └── startRound() で通常の stateUpdate + privateHand を配信

クライアント: rematch メッセージ受信
  ├── lastShowdownResult をクリア
  ├── myCards をクリア
  └── 直後の stateUpdate で新しいゲーム状態を受信 → UI自動更新
```

### rematch メッセージの必要性

- stateUpdate だけでは「新しいゲーム」か「同じゲームの次のラウンド」か区別できない
- クライアント側で `showdownResult` / `myCards` を確実にクリアするトリガーが必要
- ResultOverlay を閉じるための明示的なシグナル

### バリデーション

`validateGameHostMessage()` に `type: 'rematch'` ケースを追加。`seq` フィールドのみの単純なメッセージ。

---

## 4. チップリセットUI

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
2. 「はい」→ 現在のプレイヤー名リスト全員の `repository.savePlayerChips(name, initialChips)` を呼び出し（初期チップ値で上書き）
3. 完了後、ボタン下にフィードバックテキスト「リセットしました」を3秒表示

### GameRepository への変更

不要。既存の `savePlayerChips()` で初期値を上書きすれば十分。

### スタイル

- 「チップをリセット」: 背景なし・テキストカラー（`Colors.subText`）の控えめなボタン
- 誤操作防止のため確認ダイアログ（`Alert.alert`）必須
- 「ゲーム開始」ボタンの視覚的優先度を維持

---

## 5. 既存ファイルへの変更一覧

| ファイル | 変更内容 |
|---|---|
| `src/components/result/ResultOverlay.tsx` | 「再戦」ボタン追加、BLEクライアント用待機テキスト、「ロビーに戻る」スタイル変更 |
| `src/contexts/GameContext.tsx` | `rematch()` メソッド追加、`playerNames` props追加 |
| `app/game.tsx` | `GameProvider` に `playerNames` を渡す |
| `src/services/ble/GameProtocol.ts` | `rematch` メッセージ型追加、バリデーション追加 |
| `src/services/ble/BleHostGameService.ts` | `startGame()` 内で `rematch` メッセージ送信 |
| `src/services/ble/BleClientGameService.ts` | `rematch` メッセージ受信ハンドラ追加 |
| `src/components/lobby/LobbyView.tsx` | 「チップをリセット」ボタン追加 |

---

## 6. テスト方針

### テスト対象（全て既存ファイルの拡張）

| ファイル | テスト内容 |
|---|---|
| `tests/ui/components/ResultOverlay.test.tsx` | gameOver時に「再戦」「ロビーに戻る」の2ボタン表示。BLEクライアント時は「再戦」非表示+待機テキスト |
| `tests/ui/contexts/GameContext.test.tsx` | `rematch()` で `startGame` + `startRound` 呼び出し、`showdownResult` クリア |
| `tests/ble/GameProtocol.test.ts` | `rematch` メッセージのバリデーション（正常・不正） |
| `tests/ble/BleHostGameService.test.ts` | `startGame()` 再呼び出し時に `rematch` メッセージ配信 |
| `tests/ble/BleClientGameService.test.ts` | `rematch` 受信で `showdownResult` / `myCards` クリア |
| `tests/ui/components/LobbyView.test.tsx` | リセットボタン表示、確認ダイアログ、`savePlayerChips` 呼び出し |

### テスト方針

- 新規テストファイルは作成しない（全て既存ファイルの拡張）
- モック方針は既存パターンに準拠
- 既存テストのResultOverlay gameOverボタン構成変更に伴う修正あり

---

## 7. スコープ

### 今回のスコープ

- ResultOverlay の再戦ボタン追加（全モード対応）
- GameContext の `rematch()` メソッド
- BLE `rematch` プロトコルメッセージ
- LobbyView のチップリセットボタン
- 上記のテスト

### スコープ外

- 再戦前の設定変更UI
- 個別プレイヤーのチップリセット
- BLEクライアント側からの再戦リクエスト機能
- 再戦回数の記録・表示
