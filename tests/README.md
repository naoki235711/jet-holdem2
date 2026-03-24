# Tests

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
npx jest tests/hooks/
npx jest tests/integration/
npx jest tests/ui/components/
npx jest tests/ui/integration/

# 結合テストのみ
npx jest --selectProjects ui --testPathPattern="tests/ui/integration"

# テスト名でフィルタ
npx jest -t "should deal cards"
```

---

## ディレクトリ構成

```
tests/
├── gameEngine/          # エンジンUnitテスト（6ファイル）
│   └── integration/     # エンジン内結合テスト（1ファイル）
├── services/            # サービスUnitテスト（1ファイル）
├── ble/                 # BLEテスト（12ファイル）
│   └── integration/     # BLE統合テスト（2ファイル）
├── persistence/         # Persistenceテスト（3ファイル）
├── hooks/               # Hooksテスト（2ファイル）
├── integration/         # クロスレイヤー統合テスト（3ファイル）
└── ui/
    ├── setup.js         # React Native テストセットアップ
    ├── helpers/         # テストヘルパー（renderWithGame等）
    ├── components/      # コンポーネントUnitテスト（20ファイル）
    ├── contexts/        # コンテキストテスト（1ファイル）
    └── integration/     # UI統合テスト（7ファイル）
        └── helpers/     # 統合テストヘルパー

e2e/
├── TESTS.md             # E2Eテスト詳細
├── playwright.config.ts # Playwright設定
├── helpers.ts           # E2Eヘルパー関数
└── *.spec.ts            # E2Eテスト（2ファイル）
```

---

## テスト一覧

### 1. ゲームエンジン Unit テスト（6ファイル）

Jest プロジェクト: `engine` / 環境: Node.js / フレームワーク: ts-jest

| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/gameEngine/Card.test.ts` | カードの生成・比較 | `8beacab` |
| `tests/gameEngine/Deck.test.ts` | デッキのシャッフル・配布 | `312a34d` |
| `tests/gameEngine/HandEvaluator.test.ts` | ハンド評価（役の判定） | `8beacab` |
| `tests/gameEngine/PotManager.test.ts` | ポット計算・サイドポット | `0a66623` |
| `tests/gameEngine/BettingRound.test.ts` | ベッティングラウンドのロジック | `93e9218` |
| `tests/gameEngine/GameLoop.test.ts` | ゲーム全体のフロー制御 | `0ede0d4` |

### 2. ゲームエンジン Integration テスト（1ファイル）

| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/gameEngine/integration/GameLoopPotManager.integration.test.ts` | GameLoop + PotManager 結合（サイドポット、オールイン） | `889a355` |

### 3. サービス Unit テスト（1ファイル）

| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/services/LocalGameService.test.ts` | LocalGameService（UIとエンジンの橋渡し、エラーハンドリング） | `26d9231` |

### 4. Hooks Unit テスト（2ファイル）

| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/hooks/useActionTimer.test.tsx` | アクションタイマーフック（タイムアウト・リセット・無効化） | `888314c` |
| `tests/hooks/useGame.test.tsx` | useGame フック（コンテキスト外エラー・正常系） | `53fef08` |

### 5. BLE Unit テスト（12ファイル）

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
| `tests/ble/transportRegistry.test.ts` | トランスポートレジストリ（set/get/clear） |

### 6. BLE Integration テスト（2ファイル）

| ファイル | テスト対象 |
|---------|-----------|
| `tests/ble/integration/LobbyFlow.test.ts` | ロビーフロー（join/ready/disconnect） |
| `tests/ble/integration/BleGameFlow.test.ts` | BLEゲームフロー（ラウンド進行、切断処理） |

### 7. Persistence Unit テスト（3ファイル）

Jest プロジェクト: `engine` / 環境: Node.js

| ファイル | テスト対象 |
|---------|-----------|
| `tests/persistence/InMemoryGameRepository.test.ts` | インメモリリポジトリ |
| `tests/persistence/AsyncStorageGameRepository.test.ts` | AsyncStorageリポジトリ |
| `tests/persistence/usePersistence.test.ts` | subscribePersistence（モックService経由） |

### 8. UIコンポーネント Unit テスト（20ファイル）

Jest プロジェクト: `ui` / 環境: React Native / フレームワーク: @testing-library/react-native

| ファイル | テスト対象 |
|---------|-----------|
| `tests/ui/components/ActionButtons.test.tsx` | アクションボタン（Fold/Call/Raise） |
| `tests/ui/components/ActionTimerBar.test.tsx` | アクションタイマーバー（カラー補間） |
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
| `tests/ui/components/PlayerSeat.test.tsx` | プレイヤー座席表示 |
| `tests/ui/components/PlayerSlot.test.tsx` | プレイヤースロット |
| `tests/ui/components/PlayingCard.test.tsx` | トランプカード表示 |
| `tests/ui/components/PotDisplay.test.tsx` | ポット表示 |
| `tests/ui/components/PreActionBar.test.tsx` | プリアクションバー（チェック/コール予約） |
| `tests/ui/components/presetCalculator.test.ts` | レイズ額プリセット計算 |
| `tests/ui/components/RaiseSlider.test.tsx` | レイズスライダー |
| `tests/ui/components/ResultOverlay.test.tsx` | 結果オーバーレイ |

### 9. UIコンテキスト Unit テスト（1ファイル）

| ファイル | テスト対象 |
|---------|-----------|
| `tests/ui/contexts/GameContext.test.tsx` | GameContext（状態管理） |

### 10. UI Integration テスト（7ファイル）

実際の `LocalGameService` + `GameLoop` を使用してUI↔エンジンの結合をテスト

| ファイル | テスト対象 |
|---------|-----------|
| `tests/ui/integration/gameFlow.integration.test.tsx` | UIからエンジンへの全体フロー、フェーズ遷移 |
| `tests/ui/integration/bettingActions.integration.test.tsx` | ベッティング操作 |
| `tests/ui/integration/hotseatMode.integration.test.tsx` | ホットシートモード |
| `tests/ui/integration/resultAndNextRound.integration.test.tsx` | 結果表示・次ラウンドへの遷移 |
| `tests/ui/integration/edgeCases.integration.test.tsx` | エッジケース（サイドポット、オールインなど） |
| `tests/ui/integration/preAction.integration.test.tsx` | プリアクション（チェック/コール予約） |
| `tests/ui/integration/gameProviderModes.integration.test.tsx` | GameProviderのモード切替 |

### 11. クロスレイヤー Integration テスト（3ファイル）

複数ドメイン（BLE + Service + Persistence など）をまたぐ結合テスト

| ファイル | テスト対象 |
|---------|-----------|
| `tests/integration/lobbyToGame.integration.test.ts` | ロビーからゲーム開始までのフロー |
| `tests/integration/persistenceLifecycle.integration.test.ts` | Persistence ライフサイクル |
| `tests/integration/repositoryResilience.integration.test.ts` | リポジトリ耐障害性 |

### 12. E2E テスト - Playwright（2ファイル）

ブラウザ上でExpo Webサーバーに接続してテスト / Base URL: `http://localhost:8081`

| ファイル | テスト対象 |
|---------|-----------|
| `e2e/hotseat.spec.ts` | ホットシートモードのブラウザテスト |
| `e2e/lobby.spec.ts` | ロビー画面 |

---

## 結合テストの実装ノート

### `act()` の使用

`LocalGameService` のアクション実行は同期的だが、React の状態更新は非同期。`fireEvent` や `service.handleAction()` を直接呼ぶ場合は `act()` でラップする。

```typescript
import { act } from '@testing-library/react-native';

act(() => {
  fireEvent.press(getByText('FOLD'));
});
// この時点でUIが更新済み
```

### デバッグモード推奨

結合テストは基本的に `mode: 'debug'` で実施する:

- 全プレイヤーの手札が見える（テスト検証が容易）
- `actingSeat` が `state.activePlayer` に基づく（viewingSeatに依存しない）
- PassDeviceScreenの介在がなく、フロー検証に集中できる

ホットシートモード専用テストのみ `mode: 'hotseat'` を使用する。

### エンジン状態の直接確認

UIの表示だけでなく、`service.getState()` でゲームエンジンの内部状態も併せて検証する。

```typescript
// UIの表示を確認
expect(getByText(/CALL/)).toBeTruthy();

// エンジン状態も確認
const state = service.getState();
expect(state.phase).toBe('flop');
expect(state.community.length).toBe(3);
```

### expo-router のモック

`ResultOverlay` と `LobbyView` は `expo-router` の `useRouter` / `useLocalSearchParams` を使用している。結合テストでは以下のモックが必要:

```typescript
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
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
| Hooks | Unit | 2 |
| BLE | Unit | 12 |
| BLE | Integration | 2 |
| Persistence | Unit | 3 |
| UIコンポーネント | Unit | 20 |
| UIコンテキスト | Unit | 1 |
| UI | Integration | 7 |
| クロスレイヤー | Integration | 3 |
| E2E | Playwright | 2 |
| **合計** | — | **60** |

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
