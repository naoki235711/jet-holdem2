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

### 2. サービス Unit テスト（1ファイル）

| ファイル | テスト対象 |
|---------|-----------|
| `tests/services/LocalGameService.test.ts` | LocalGameService（UIとエンジンの橋渡し） |

### 3. UIコンポーネント Unit テスト（11ファイル）

Jest プロジェクト: `ui` / 環境: React Native / フレームワーク: @testing-library/react-native

| ファイル | テスト対象 |
|---------|-----------|
| `tests/ui/components/ActionButtons.test.tsx` | アクションボタン（Fold/Call/Raise） |
| `tests/ui/components/ChipAmount.test.tsx` | チップ表示 |
| `tests/ui/components/CommunityCards.test.tsx` | コミュニティカード表示 |
| `tests/ui/components/LobbyView.test.tsx` | ロビー画面 |
| `tests/ui/components/PassDeviceScreen.test.tsx` | ホットシートモードの端末パス画面 |
| `tests/ui/components/PlayerSeat.test.tsx` | プレイヤー座席表示 |
| `tests/ui/components/PlayingCard.test.tsx` | トランプカード表示 |
| `tests/ui/components/PotDisplay.test.tsx` | ポット表示 |
| `tests/ui/components/RaiseSlider.test.tsx` | レイズスライダー |
| `tests/ui/components/ResultOverlay.test.tsx` | 結果オーバーレイ |
| `tests/ui/contexts/GameContext.test.tsx` | GameContext（状態管理） |

### 4. UI Integration テスト（5ファイル）

実際の `LocalGameService` + `GameLoop` を使用してUI↔エンジンの結合をテスト

| ファイル | テスト対象 |
|---------|-----------|
| `tests/ui/integration/gameFlow.integration.test.tsx` | UIからエンジンへの全体フロー、フェーズ遷移 |
| `tests/ui/integration/bettingActions.integration.test.tsx` | ベッティング操作 |
| `tests/ui/integration/hotseatMode.integration.test.tsx` | ホットシートモード |
| `tests/ui/integration/resultAndNextRound.integration.test.tsx` | 結果表示・次ラウンドへの遷移 |
| `tests/ui/integration/edgeCases.integration.test.tsx` | エッジケース（サイドポット、オールインなど） |

### 5. E2E テスト - Playwright（4ファイル）

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
├── services/            # サービスUnitテスト（1ファイル）
└── ui/
    ├── setup.js         # React Native テストセットアップ
    ├── helpers/         # テストヘルパー（renderWithGame等）
    ├── components/      # コンポーネントUnitテスト（11ファイル）
    ├── contexts/        # コンテキストテスト（1ファイル）
    └── integration/     # 統合テスト（5ファイル）
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
| サービス | Unit | 1 |
| UIコンポーネント | Unit | 11 |
| UI統合 | Integration | 5 |
| ブラウザE2E | Playwright | 4 |
| **合計** | — | **27** |
