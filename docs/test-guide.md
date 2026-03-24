# テストガイド

## クイックリファレンス

| コマンド | 説明 |
|---------|------|
| `npm test` | 全テスト実行（Unit + Integration） |
| `npm run test:watch` | ウォッチモードで実行（ファイル変更で自動再実行） |
| `npm run test:e2e` | E2Eテスト実行（Playwright） |

### 特定テストの実行

```bash
# ゲームエンジンのテストのみ
npx jest --selectProjects engine

# UIテストのみ
npx jest --selectProjects ui

# 特定ファイルのみ
npx jest GameLoop.test.ts
npx jest ActionButtons.test.tsx

# 特定ディレクトリのみ
npx jest tests/gameEngine/
npx jest tests/services/
npx jest tests/ble/
npx jest tests/persistence/
npx jest tests/integration/
npx jest tests/ui/components/
npx jest tests/ui/integration/

# テスト名でフィルタ
npx jest -t "should deal cards"
```

---

## テスト一覧

### 1. ゲームエンジン Unit テスト（6ファイル）

Jest プロジェクト: `engine` / 環境: Node.js / フレームワーク: ts-jest

| ファイル | テスト対象 |
|---------|-----------|
| `tests/gameEngine/Card.test.ts` | カードの生成・比較 |
| `tests/gameEngine/Deck.test.ts` | デッキのシャッフル・配布 |
| `tests/gameEngine/HandEvaluator.test.ts` | ハンド評価（役の判定） |
| `tests/gameEngine/PotManager.test.ts` | ポット計算・サイドポット |
| `tests/gameEngine/BettingRound.test.ts` | ベッティングラウンドのロジック |
| `tests/gameEngine/GameLoop.test.ts` | ゲーム全体のフロー制御 |

#### GameEngine Integration テスト（1ファイル）

| ファイル | テスト対象 |
|---------|-----------|
| `tests/gameEngine/integration/GameLoopPotManager.integration.test.ts` | GameLoop と PotManager の連携（サイドポット、オールイン） |

### 2. サービス Unit テスト（1ファイル）

| ファイル | テスト対象 |
|---------|-----------|
| `tests/services/LocalGameService.test.ts` | LocalGameService（UIとエンジンの橋渡し、エラーハンドリング） |

### 3. BLE Unit テスト（11ファイル）

Jest プロジェクト: `engine` / 環境: Node.js

| ファイル | テスト対象 |
|---------|-----------|
| `tests/ble/bleConstants.test.ts` | BLE定数 |
| `tests/ble/ChunkManager.test.ts` | メッセージチャンク分割・結合 |
| `tests/ble/MockBleTransport.test.ts` | モックBLEトランスポート |
| `tests/ble/LobbyProtocol.test.ts` | ロビープロトコルメッセージ検証 |
| `tests/ble/GameProtocol.test.ts` | ゲームプロトコルメッセージ検証 |
| `tests/ble/LobbyHost.test.ts` | ロビーホスト（プレイヤー管理） |
| `tests/ble/LobbyClient.test.ts` | ロビークライアント（参加・準備） |
| `tests/ble/BleHostGameService.test.ts` | BLEホストゲームサービス |
| `tests/ble/BleClientGameService.test.ts` | BLEクライアントゲームサービス |
| `tests/ble/BleHostTransportImpl.test.ts` | BLEホストトランスポート実装 |
| `tests/ble/BleClientTransportImpl.test.ts` | BLEクライアントトランスポート実装 |

### 4. Persistence Unit テスト（3ファイル）

Jest プロジェクト: `engine` / 環境: Node.js

| ファイル | テスト対象 |
|---------|-----------|
| `tests/persistence/InMemoryGameRepository.test.ts` | インメモリリポジトリ |
| `tests/persistence/AsyncStorageGameRepository.test.ts` | AsyncStorageリポジトリ |
| `tests/persistence/usePersistence.test.ts` | subscribePersistence（モックService経由） |

### 5. UIコンポーネント Unit テスト（20ファイル）

Jest プロジェクト: `ui` / 環境: React Native / フレームワーク: @testing-library/react-native

| ファイル | テスト対象 |
|---------|-----------|
| `tests/ui/components/ActionButtons.test.tsx` | アクションボタン（Fold/Call/Raise） |
| `tests/ui/components/ActionTimerBar.test.tsx` | アクションタイマーバー |
| `tests/ui/components/BleHostLobby.test.tsx` | BLEホストロビー画面 |
| `tests/ui/components/BleJoinLobby.test.tsx` | BLE参加ロビー画面 |
| `tests/ui/components/ChipAmount.test.tsx` | チップ表示 |
| `tests/ui/components/CommunityCards.test.tsx` | コミュニティカード表示 |
| `tests/ui/components/HostList.test.tsx` | ホスト一覧 |
| `tests/ui/components/HostSetupForm.test.tsx` | ホスト設定フォーム |
| `tests/ui/components/JoinSetupForm.test.tsx` | 参加設定フォーム |
| `tests/ui/components/LobbyModeSelector.test.tsx` | ロビーモード選択 |
| `tests/ui/components/LobbyView.test.tsx` | ロビー画面 |
| `tests/ui/components/PassDeviceScreen.test.tsx` | ホットシートモードの端末パス画面 |
| `tests/ui/components/PreActionBar.test.tsx` | プリアクションバー |
| `tests/ui/components/PlayerSeat.test.tsx` | プレイヤー座席表示 |
| `tests/ui/components/PlayerSlot.test.tsx` | プレイヤースロット |
| `tests/ui/components/PlayingCard.test.tsx` | トランプカード表示 |
| `tests/ui/components/PotDisplay.test.tsx` | ポット表示 |
| `tests/ui/components/RaiseSlider.test.tsx` | レイズスライダー |
| `tests/ui/components/ResultOverlay.test.tsx` | 結果オーバーレイ |
| `tests/ui/components/presetCalculator.test.ts` | プリセットベット計算 |
| `tests/ui/contexts/GameContext.test.tsx` | GameContext（状態管理） |

### 6. UI Integration テスト（7ファイル）

実際の `LocalGameService` + `GameLoop` を使用してUI↔エンジンの結合をテスト

| ファイル | テスト対象 |
|---------|-----------|
| `tests/ui/integration/gameFlow.integration.test.tsx` | UIからエンジンへの全体フロー、フェーズ遷移 |
| `tests/ui/integration/bettingActions.integration.test.tsx` | ベッティング操作 |
| `tests/ui/integration/hotseatMode.integration.test.tsx` | ホットシートモード |
| `tests/ui/integration/resultAndNextRound.integration.test.tsx` | 結果表示・次ラウンドへの遷移 |
| `tests/ui/integration/edgeCases.integration.test.tsx` | エッジケース（サイドポット、オールインなど） |
| `tests/ui/integration/gameProviderModes.integration.test.tsx` | GameProviderモード切替 |
| `tests/ui/integration/preAction.integration.test.tsx` | プリアクション（アクション前の状態） |

### 7. BLE Integration テスト（2ファイル）

| ファイル | テスト対象 |
|---------|-----------|
| `tests/ble/integration/LobbyFlow.test.ts` | ロビーフロー（join/ready/disconnect） |
| `tests/ble/integration/BleGameFlow.test.ts` | BLEゲームフロー（ラウンド進行、切断処理） |

### 8. クロスレイヤー Integration テスト（3ファイル）

Jest プロジェクト: `engine` / 環境: Node.js

| ファイル | テスト対象 |
|---------|-----------|
| `tests/integration/lobbyToGame.integration.test.ts` | ロビーからゲーム開始までのフロー（BLE経由） |
| `tests/integration/persistenceLifecycle.integration.test.ts` | 永続化のライフサイクル |
| `tests/integration/repositoryResilience.integration.test.ts` | リポジトリの耐障害性 |

### 9. E2E テスト - Playwright（4ファイル）

ブラウザ上でExpo Webサーバーに接続してテスト / Base URL: `http://localhost:8081`

| ファイル | テスト対象 |
|---------|-----------|
| `e2e/game-flow.spec.ts` | プリフロップからショーダウンまでの全体フロー |
| `e2e/hotseat.spec.ts` | ホットシートモードのブラウザテスト |
| `e2e/lobby.spec.ts` | ロビー画面 |
| `e2e/actions.spec.ts` | アクションボタンの操作 |

---

## ディレクトリ構成

```
tests/
├── gameEngine/          # エンジンUnitテスト（6ファイル）
│   └── integration/     # エンジンIntegrationテスト（1ファイル）
├── services/            # サービスUnitテスト（1ファイル）
├── ble/                 # BLEテスト（11ファイル）
│   └── integration/     # BLE統合テスト（2ファイル）
├── persistence/         # Persistenceテスト（3ファイル）
├── integration/         # クロスレイヤー統合テスト（3ファイル）
└── ui/
    ├── setup.js         # React Native テストセットアップ
    ├── helpers/         # テストヘルパー（renderWithGame等）
    ├── components/      # コンポーネントUnitテスト（20ファイル）
    ├── contexts/        # コンテキストテスト（1ファイル）
    └── integration/     # UI統合テスト（7ファイル）
        └── helpers/     # 統合テストヘルパー

e2e/
├── playwright.config.ts # Playwright設定
├── helpers.ts           # E2Eヘルパー関数
└── *.spec.ts            # E2Eテスト（4ファイル）
```

---

## 設定ファイル

| ファイル | 説明 |
|---------|------|
| `jest.config.js` | Jest設定（engine/uiの2プロジェクト構成） |
| `e2e/playwright.config.ts` | Playwright設定（Chromium、タイムアウト60秒） |
| `tests/ui/setup.js` | UIテスト用セットアップ（Modalモック等） |

---

## E2Eテストの実行前提

E2Eテストを実行するにはExpo Webサーバーが起動している必要があります。Playwrightの設定で自動起動されますが、手動で起動する場合：

```bash
npx expo start --web --port 8081
```

---

## テスト数サマリー

| カテゴリ | 種別 | ファイル数 |
|---------|------|-----------|
| ゲームエンジン | Unit | 6 |
| ゲームエンジン | Integration | 1 |
| サービス | Unit | 1 |
| BLE | Unit | 11 |
| BLE | Integration | 2 |
| Persistence | Unit | 3 |
| クロスレイヤー | Integration | 3 |
| UIコンポーネント | Unit | 20 |
| UIコンテキスト | Unit | 1 |
| UI統合 | Integration | 7 |
| ブラウザE2E | Playwright | 4 |
| **合計** | — | **59** |

---

## 既知の警告

### "A worker process has failed to exit gracefully"

`npm test`（全テスト実行）で以下の警告が表示されることがあります：

```
A worker process has failed to exit gracefully and has been force exited.
This is likely caused by tests leaking due to improper teardown.
```

**これはテスト結果に影響しない既知の問題です。**

- **原因:** Jest のマルチプロジェクト構成（`engine`: ts-jest/node + `ui`: react-native プリセット）でワーカーを並行実行した際の終了タイミングの競合
- **再現条件:** 2プロジェクト同時実行時のみ発生。`npx jest --selectProjects engine` や `npx jest --selectProjects ui` では発生しない
- **対処不要:** 全テストは正常にパスしており、テストの正確性に影響なし
