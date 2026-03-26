# ソロ vs Botモード 設計書

Date: 2026-03-26

## 概要

自分1人 + 残り全員Botでプレイできる「ソロ」モードをロビーに追加する。現状は `PLAYER_COUNTS = [2, ...]` の制約によりプレイヤー数最低2人が必要で、1人でBotと対戦することができない。

## 目標

- プレイヤーが1人（自分）で残り全員Botのゲームを開始できるようにする
- ロビーUIをシンプルに保つ（既存のホットシートモードと混同しない）
- 既存コード（LocalGameService、BotPlayerService、game.tsx）は変更しない

## UI設計

`LobbyModeSelector` に `'solo'` タブを追加する。

`lobbyMode === 'solo'` のとき表示する `SoloSetupForm` の内容：

```
プレイヤー名  [ テキスト入力 ]

総プレイヤー数（自分含む）
  [2] [3] [4] [5] [6] [7] [8] [9]

初期チップ   [ 数値入力 ]
SB [ ]   BB [ ]

[ゲーム開始]
```

表示しない項目：
- Bot人数（= 総数 − 1 が自動でBot）
- モード選択（ソロは常にhotseat相当）
- 他プレイヤー名入力欄

## アーキテクチャ

### データフロー

1. ユーザーが「ソロ」タブを選択 → `SoloSetupForm` を表示
2. ゲーム開始時: `playerNames = [自分の名前]`, `botCount = totalCount - 1` を `LocalGameService.startGame()` に渡す
3. `LocalGameService` が残り席をBotとして配置（既存ロジック）
4. `game.tsx` の PassDeviceScreen はBotでない=自分だけなので実質表示されない（既存の `!player.isBot` チェックで対応済み）

### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `src/components/lobby/LobbyModeSelector.tsx` | `LobbyMode` 型に `'solo'` 追加、ボタン「ソロ」追加 |
| `src/components/lobby/LobbyView.tsx` | `lobbyMode === 'solo'` のUI分岐と `handleStart` 拡張 |
| `src/components/lobby/SoloSetupForm.tsx` | 新規作成（自分の名前・総数・チップ・ブラインド入力） |

### 変更しないファイル

- `src/services/LocalGameService.ts` — `botCount` パラメータは既に対応済み
- `src/bot/BotPlayerService.ts` — 変更不要
- `app/game.tsx` — PassDeviceScreenのBotスキップは既に対応済み

## テスト方針

- `SoloSetupForm` の入力バリデーション（名前空欄は開始ボタンを無効化）
- ソロモードで開始したとき `botCount = totalCount - 1` が正しく渡されることを確認
- 既存のローカルモードのテストがリグレッションしないことを確認
