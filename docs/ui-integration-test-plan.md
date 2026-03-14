# UI結合テスト計画書

## 1. 概要

### 目的
UIコンポーネントと実際のゲームエンジン（`LocalGameService` + `GameLoop`）を結合した状態で、ユーザー操作からゲーム状態の変化・画面反映までの一連のフローを検証する。

### 現状のテストカバレッジ

| レイヤー | テスト種別 | 状態 | ファイル数 |
|---------|-----------|------|-----------|
| GameEngine (Card, Deck, Hand, Betting, Pot, GameLoop) | ユニットテスト | 実装済み | 6 |
| LocalGameService | ユニットテスト | 実装済み | 1 |
| UIコンポーネント (ActionButtons, PlayerSeat, etc.) | ユニットテスト（モック使用） | 実装済み | 10 |
| GameContext | ユニットテスト | 実装済み | 1 |
| **UI → Service → Engine 結合** | **結合テスト** | **未実装** | **0** |

### 結合テストで埋めるギャップ
既存のUIテストは全て `createMockService()` でサービスをモックしているため、以下が未検証:
- UIのボタン押下 → 実際の `LocalGameService.handleAction()` → `GameLoop` の状態変化 → UIへの反映
- フェーズ遷移（preflop → flop → turn → river → showdown → roundEnd）がUIに正しく反映されるか
- 複数プレイヤーの連続アクションによるゲーム進行
- サイドポット・オールイン等のエッジケースでのUI表示

---

## 2. テスト環境・ツール

### 使用ツール（既存）
- **@testing-library/react-native** — コンポーネントレンダリング・操作
- **@testing-library/jest-native** — カスタムマッチャー
- **jest-expo** — React Native用Jestプリセット
- **Jest 30** — テストランナー

### 追加が必要なもの
- **なし** — 既存の依存関係で結合テストは実装可能

### テスト実行コマンド
```bash
# 全テスト
npm test

# 結合テストのみ
npx jest --selectProjects ui --testPathPattern="tests/ui/integration"
```

---

## 3. テストインフラ準備

### 3.1 ディレクトリ構成
```
tests/ui/integration/
├── helpers/
│   └── integrationTestHelper.tsx   # 実サービスを使うレンダリングヘルパー
├── gameFlow.integration.test.tsx    # ゲーム全体フロー
├── bettingActions.integration.test.tsx  # ベッティング操作
├── hotseatMode.integration.test.tsx    # ホットシートモード
├── resultAndNextRound.integration.test.tsx  # 結果表示・次ラウンド
└── edgeCases.integration.test.tsx      # エッジケース
```

### 3.2 結合テスト用ヘルパー（新規作成）

既存の `renderWithGame.tsx` はモックサービスを使用しているため、**実際の `LocalGameService`** を使うヘルパーを新規作成する。

```typescript
// tests/ui/integration/helpers/integrationTestHelper.tsx

import React from 'react';
import { render } from '@testing-library/react-native';
import { GameProvider } from '../../../../src/contexts/GameContext';
import { LocalGameService } from '../../../../src/services/LocalGameService';

interface SetupOptions {
  playerNames?: string[];
  blinds?: { sb: number; bb: number };
  initialChips?: number;
  mode?: 'hotseat' | 'debug';
}

export function setupIntegrationTest(options: SetupOptions = {}) {
  const {
    playerNames = ['Alice', 'Bob', 'Charlie'],
    blinds = { sb: 5, bb: 10 },
    initialChips = 1000,
    mode = 'debug',
  } = options;

  const service = new LocalGameService();
  service.startGame(playerNames, blinds, initialChips);
  service.startRound();

  return { service, mode, playerNames, blinds, initialChips };
}

export function renderGameScreen(
  ui: React.ReactElement,
  service: LocalGameService,
  mode: 'hotseat' | 'debug' = 'debug',
) {
  return render(
    <GameProvider service={service} mode={mode}>
      {ui}
    </GameProvider>,
  );
}
```

### 3.3 jest.config.js の変更
既存の `ui` プロジェクトの `roots` に `tests/ui/integration` が含まれる（`<rootDir>/tests/ui` 配下のため変更不要）。

---

## 4. テストケース一覧

### 4.1 ゲーム全体フロー (`gameFlow.integration.test.tsx`)

ゲーム開始から1ラウンド完了までの一連のフローを検証する。

| # | テストケース | 操作 | 検証ポイント |
|---|-------------|------|-------------|
| F-1 | ゲーム開始時の初期表示 | サービスで `startGame` + `startRound` 実行後にGameViewをレンダリング | - フェーズが `preflop` であること<br>- 3人のプレイヤーシートが表示されること<br>- ブラインドが正しく徴収されていること（SB=5, BB=10）<br>- ポット表示が15（SB+BB）であること<br>- アクティブプレイヤーのアクションボタンが有効であること |
| F-2 | Preflopベッティング完了→Flop遷移 | 全プレイヤーがcall/check | - コミュニティカードが3枚表示されること<br>- フェーズがflopに遷移すること<br>- ポットが更新されること |
| F-3 | 全フェーズ通過→Showdown | Preflop→Flop→Turn→Riverを全てcheck/callで通過 | - 各フェーズでコミュニティカードが正しい枚数表示<br>- Flop: 3枚, Turn: 4枚, River: 5枚<br>- Showdown後にResultOverlayが表示されること |
| F-4 | ResultOverlayから次のラウンドへ | 「次のラウンドへ」ボタンを押下 | - ResultOverlayが閉じること<br>- 新しいラウンドが開始されること（フェーズがpreflopに戻る）<br>- ディーラーボタンが回転していること |

#### テスト実装の方針（F-3の例）
```typescript
it('全フェーズを通過してShowdown→ResultOverlay表示', async () => {
  const { service } = setupIntegrationTest({ mode: 'debug' });
  const { getByTestId, getByText, queryByTestId } = renderGameScreen(
    <GameView />, service, 'debug',
  );

  const state = service.getState();
  // Preflopの全プレイヤーにcall/checkアクション実行
  // → フェーズ遷移を確認
  // Flop, Turn, Riverも同様に全プレイヤーcheck
  // → ResultOverlayが表示されることを確認
});
```

---

### 4.2 ベッティング操作 (`bettingActions.integration.test.tsx`)

各アクション（Fold, Check, Call, Raise, All-in）がUIから正しくゲームエンジンに伝達され、結果がUIに反映されることを検証。

| # | テストケース | 操作 | 検証ポイント |
|---|-------------|------|-------------|
| B-1 | Foldボタン押下 | アクティブプレイヤーがFOLDを押す | - 該当プレイヤーのステータスが `folded` に変わること<br>- PlayerSeatの表示が暗くなる（dimmed）こと<br>- 次のプレイヤーにターンが移ること |
| B-2 | Checkボタン押下 | currentBet === playerBet の時にCHECKを押す | - ターンが次のプレイヤーに移ること<br>- ポットが変わらないこと |
| B-3 | Callボタン押下 | currentBet > playerBet の時にCALLを押す | - プレイヤーのチップが減少すること<br>- ポットが増加すること<br>- ターンが次のプレイヤーに移ること |
| B-4 | Raiseスライダー操作→Raise実行 | スライダーで金額を設定しRAISEを押す | - currentBetがレイズ額に更新されること<br>- プレイヤーのチップが正しく減少すること<br>- 他のプレイヤーに再度アクション権が回ること |
| B-5 | All-in実行 | スライダーを最大に設定しALL INを押す | - プレイヤーのチップが0になること<br>- ステータスが `allIn` になること<br>- ポットに全チップが加算されること |
| B-6 | 無効アクションのエラー表示 | 他プレイヤーのターンにボタン押下を試行 | - ボタンがdisabledであること<br>- エラーメッセージが表示されないこと（押せないため） |
| B-7 | 全員Fold→最後の1人が勝利 | 2人がFold（3人ゲーム） | - Showdownを経由せずにroundEndになること<br>- ResultOverlayにFold勝利メッセージが表示されること<br>- 残った1人にポットが付与されること |

---

### 4.3 ホットシートモード (`hotseatMode.integration.test.tsx`)

端末を渡す（ホットシート）モードのUI遷移を検証。

| # | テストケース | 操作 | 検証ポイント |
|---|-------------|------|-------------|
| H-1 | ターン変更時にPassDeviceScreenが表示 | プレイヤーAがアクション実行 | - PassDeviceScreenが表示されること<br>- 「端末を [プレイヤーB名] に渡してください」のメッセージが表示されること |
| H-2 | PassDeviceScreenタップで消去 | PassDeviceScreenをタップ | - PassDeviceScreenが消えること<br>- 次のプレイヤーの視点でゲーム画面が表示されること |
| H-3 | viewingSeatの自動切替 | ホットシートモードでアクション実行 | - viewingSeatがactivePlayerに自動追従すること<br>- 手札が現在のアクティブプレイヤーのものに切り替わること |
| H-4 | Showdown/RoundEnd時はPassDeviceScreen非表示 | ラウンド終了フェーズに到達 | - Showdown・RoundEndフェーズではPassDeviceScreenが表示されないこと<br>- ResultOverlayが正常に表示されること |

---

### 4.4 結果表示・次ラウンド遷移 (`resultAndNextRound.integration.test.tsx`)

ラウンド終了時のResultOverlay表示と次ラウンドへの遷移を検証。

| # | テストケース | 操作 | 検証ポイント |
|---|-------------|------|-------------|
| R-1 | Showdown結果の表示 | 全フェーズを通過してShowdownに到達 | - 勝者の名前が表示されること<br>- 各プレイヤーの手札が公開されること<br>- 勝利ハンドの説明（例: "Pair of Aces"）が表示されること<br>- 勝者の行にハイライト（★マーク・シアンボーダー）があること |
| R-2 | Fold勝利の表示 | 全員Foldで1人残り | - 「[名前] wins!」が表示されること<br>- Showdown結果のハンド情報は表示されないこと |
| R-3 | 次のラウンドへボタン | 「次のラウンドへ」を押下 | - ResultOverlayが消えること<br>- 新ラウンドが開始すること（preflop）<br>- ディーラーが次のプレイヤーに移動していること<br>- 各プレイヤーのチップが前ラウンドの結果を反映していること |
| R-4 | ゲームオーバー→ロビー遷移 | チップが0のプレイヤーがいる状態で最終ラウンド終了 | - 「ロビーに戻る」ボタンが表示されること<br>- 「次のラウンドへ」ボタンが表示されないこと |

---

### 4.5 エッジケース (`edgeCases.integration.test.tsx`)

境界条件やゲームエンジンの複雑なロジックがUIに正しく反映されることを検証。

| # | テストケース | 操作 | 検証ポイント |
|---|-------------|------|-------------|
| E-1 | サイドポット発生時の表示 | プレイヤーAがAll-in、B,Cが継続 | - メインポット・サイドポットがPotDisplayに正しく表示されること<br>- ResultOverlayで各ポットの配分が表示されること |
| E-2 | 2人対戦（ヘッズアップ） | 2人でゲーム開始 | - テーブルレイアウトが2人用になること（TopとBottomのみ）<br>- ブラインド配置がヘッズアップルール（ディーラー=SB）に従うこと |
| E-3 | 4人対戦のレイアウト | 4人でゲーム開始 | - 4つのPlayerSeatが上・左・右・下に配置されること |
| E-4 | チップ不足時のAll-in表示 | プレイヤーのチップ < currentBet | - CALLボタンの代わりにALL INが表示されること<br>- RAISEボタンが無効化されること |
| E-5 | 連続ラウンドでのディーラー回転 | 3ラウンド連続プレイ | - ディーラーが 0→1→2→0 と正しく回転すること<br>- ブラインドポジションがそれに従うこと |
| E-6 | プレイヤー脱落後のラウンド | チップ0のプレイヤーが出た後のラウンド | - 脱落プレイヤーのステータスが `out` であること<br>- 残りのプレイヤーでゲームが続行すること |

---

## 5. テスト実装の注意点

### 5.1 `act()` の使用
`LocalGameService` のアクション実行は同期的だが、React の状態更新は非同期。`fireEvent` や `service.handleAction()` を直接呼ぶ場合は `act()` でラップする。

```typescript
import { act } from '@testing-library/react-native';

act(() => {
  fireEvent.press(getByText('FOLD'));
});
// この時点でUIが更新済み
```

### 5.2 デバッグモードでのテスト推奨
結合テストは基本的に `mode: 'debug'` で実施する。理由:
- 全プレイヤーの手札が見える（テスト検証が容易）
- `actingSeat` が `state.activePlayer` に基づく（viewingSeatに依存しない）
- PassDeviceScreenの介在がなく、フロー検証に集中できる

ホットシートモード専用テスト（4.3）のみ `mode: 'hotseat'` を使用する。

### 5.3 ゲーム状態の直接確認
UIの表示だけでなく、`service.getState()` でゲームエンジンの内部状態も併せて検証する。

```typescript
// UIの表示を確認
expect(getByText(/CALL/)).toBeTruthy();

// エンジン状態も確認
const state = service.getState();
expect(state.phase).toBe('flop');
expect(state.community.length).toBe(3);
```

### 5.4 expo-router のモック
`ResultOverlay` と `LobbyView` は `expo-router` の `useRouter` / `useLocalSearchParams` を使用している。結合テストでは以下のモックが必要:

```typescript
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
```

### 5.5 連続アクションのヘルパー関数
テストコードの可読性向上のため、ベッティングラウンドを一括で進めるヘルパーを用意する。

```typescript
/**
 * 全アクティブプレイヤーにcheckアクションを実行してフェーズを進める
 */
function advancePhaseWithChecks(service: LocalGameService): void {
  let state = service.getState();
  while (state.phase === currentPhase && state.activePlayer >= 0) {
    const info = service.getActionInfo(state.activePlayer);
    if (info.canCheck) {
      service.handleAction(state.activePlayer, { action: 'check' });
    } else {
      service.handleAction(state.activePlayer, { action: 'call' });
    }
    state = service.getState();
  }
}

/**
 * 指定フェーズまでゲームを進める（全員check/call）
 */
function advanceToPhase(
  service: LocalGameService,
  targetPhase: string,
): void {
  let state = service.getState();
  while (state.phase !== targetPhase) {
    const info = service.getActionInfo(state.activePlayer);
    if (info.canCheck) {
      service.handleAction(state.activePlayer, { action: 'check' });
    } else {
      service.handleAction(state.activePlayer, { action: 'call' });
    }
    state = service.getState();
    // showdownに達したら自動resolveが必要な場合がある
  }
}
```

---

## 6. 優先度と実装順序

### Phase 1: 基盤整備（最優先）
1. `tests/ui/integration/helpers/integrationTestHelper.tsx` の作成
2. expo-routerモック設定
3. ヘルパー関数（`advanceToPhase` 等）の実装

### Phase 2: コアフロー（高優先）
4. `gameFlow.integration.test.tsx` — ゲーム全体の1ラウンドフロー (F-1〜F-4)
5. `bettingActions.integration.test.tsx` — 各アクションの動作 (B-1〜B-7)

### Phase 3: モード固有（中優先）
6. `hotseatMode.integration.test.tsx` — ホットシートモード (H-1〜H-4)
7. `resultAndNextRound.integration.test.tsx` — 結果表示と遷移 (R-1〜R-4)

### Phase 4: エッジケース（低優先）
8. `edgeCases.integration.test.tsx` — 境界条件 (E-1〜E-6)

---

## 7. テストケース総数

| カテゴリ | テストケース数 |
|---------|--------------|
| ゲーム全体フロー | 4 |
| ベッティング操作 | 7 |
| ホットシートモード | 4 |
| 結果表示・次ラウンド | 4 |
| エッジケース | 6 |
| **合計** | **25** |

---

## 8. 成功基準

- 全25テストケースがパスすること
- テスト実行時間が30秒以内であること（結合テスト全体）
- 既存のユニットテスト（engine + ui）が引き続きパスすること
- `npm test` で全テスト（ユニット + 結合）が一括実行できること
