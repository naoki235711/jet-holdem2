# Jet Holdem — 実装済み機能一覧

_最終更新: 2026-03-24_

---

## 概覧

| カテゴリ | 機能 | 状態 |
|---|---|---|
| ゲームエンジン | Deck / Card / HandEvaluator / BettingRound / PotManager / GameLoop | ✅ 実装済 |
| BLE通信 | ChunkManager / GameProtocol / LobbyProtocol / Host & Client Transport | ✅ 実装済 |
| ゲームサービス | LocalGameService / BleHostGameService / BleClientGameService | ✅ 実装済 |
| UI - テーブル | PlayerSeat / CommunityCards / PotDisplay / ActionTimerBar | ✅ 実装済 |
| UI - アクション | ActionButtons / RaiseSlider / Raise Presets / PreActionBar | ✅ 実装済 |
| UI - ロビー | LobbyModeSelector / HostSetupForm / JoinSetupForm / BleHostLobby / BleJoinLobby / LobbyView / HostList / PlayerSlot | ✅ 実装済 |
| UI - 共通 | PlayingCard / ChipAmount / PassDeviceScreen / ResultOverlay | ✅ 実装済 |
| コンテキスト・フック | GameContext / useActionTimer / usePersistence / useGame | ✅ 実装済 |
| 永続化 | GameRepository / InMemoryGameRepository / AsyncStorageGameRepository | ✅ 実装済 |
| プリフロップチャート | チャート画面コンポーネント | 🚧 進行中 |
| アクション履歴バー | ActionHistoryBar UI | ❌ 未実装 |
| ブラインドレベル | 時間経過によるブラインド段階増加 | ❌ 未実装 |
| アニメーション・SE | カード配布・チップ移動アニメ / サウンド | ❌ 未実装 |
| ゲーム履歴UI | 戦績・統計表示画面 | ❌ 未実装 |
| 観戦モード | Spectator Mode | ❌ 未実装 |

---

## カテゴリ別詳細

### ゲームエンジン

`src/gameEngine/`

| モジュール | 説明 |
|---|---|
| `Card.ts` | カードの型定義とランク/スートの表現（例: `Ah` = Ace of Hearts） |
| `Deck.ts` | 52枚のデッキ生成、シャッフル、配布 |
| `HandEvaluator.ts` | 7枚から最強5枚を選択し役を判定（Royal Flush〜High Card）。同役はキッカーで比較 |
| `BettingRound.ts` | 各ベッティングラウンドのアクション処理（fold/check/call/raise/allin）と終了判定 |
| `PotManager.ts` | オールイン時のメインポット・サイドポット分割計算 |
| `GameLoop.ts` | ゲームフェーズ制御（Preflop → Flop → Turn → River → Showdown → 次ラウンド）。ディーラーボタン回転、早期終了（全員フォールド時）処理 |

---

### BLE通信

`src/services/ble/`

| モジュール | 説明 |
|---|---|
| `BleTransport.ts` | `BleHostTransport` / `BleClientTransport` インターフェース定義。具象実装と Mock が共有する抽象層 |
| `bleConstants.ts` | GATT サービス/Characteristic の UUID 定義 |
| `ChunkManager.ts` | MTU制約（185バイト想定）に対応したJSON分割送信・受信結合。3バイトヘッダ（chunkIndex / totalChunks / reserved）を使用 |
| `GameProtocol.ts` | GameState・PrivateHand・PlayerAction メッセージのシリアライズ/デシリアライズ |
| `LobbyProtocol.ts` | join / joinResponse / ready / gameStart / playerUpdate メッセージの型定義とパース |
| `LobbyHost.ts` | ホスト側のロビー状態機械。参加受付・シート割り当て・全員 ready 後のゲーム開始管理 |
| `LobbyClient.ts` | クライアント側のロビー処理。join 送信・seat ID 取得・playerUpdate 受信 |
| `BleHostTransportImpl.ts` | `react-native-multi-ble-peripheral` を使った GATT Server 実装（Peripheral モード） |
| `BleClientTransportImpl.ts` | `react-native-ble-plx` を使った GATT Central 実装。Notify 購読・Write 送信 |
| `MockBleTransport.ts` | テスト用のインメモリ BLE トランスポート |
| `transportRegistry.ts` | 実環境 / Mock のトランスポート切り替えレジストリ |

---

### ゲームサービス

`src/services/`

| サービス | 説明 |
|---|---|
| `LocalGameService.ts` | シングルデバイスのホットシートモード。BLE なしでゲームエンジンを直接駆動 |
| `BleHostGameService.ts` | ホスト端末用。GameLoop を保持し、アクション受信→状態更新→全クライアントへ Notify を担当 |
| `BleClientGameService.ts` | クライアント端末用。ホストから GameState を受信して UI に反映。PlayerAction を Write 送信。リマッチ処理にも対応 |

---

### UI - テーブル

`src/components/table/`

| コンポーネント | 説明 |
|---|---|
| `PlayerSeat.tsx` | プレイヤー情報表示（名前・チップ残高・カード・ステータスバッジ）。アクティブプレイヤーはシアンボーダー、フォールドは半透明。ディーラーボタンとベット額はシート外に配置 |
| `ActionTimerBar.tsx` | アクション残り時間のプログレスバー。残り時間に応じて緑→黄→赤にカラー補間。`timerRemainingMs` / `timerDurationMs` を props で受け取る |
| `CommunityCards.tsx` | コミュニティカード5枚の表示。未公開スロットはダークグレーの空フレーム |
| `PotDisplay.tsx` | ポット総額と BB 換算額を表示 |

---

### UI - アクション

`src/components/actions/`

| コンポーネント/モジュール | 説明 |
|---|---|
| `ActionButtons.tsx` | FOLD / CHECK・CALL / RAISE・ALLIN ボタン。自分のターン以外は非活性。ライズプリセットボタン（最大5つ）を内包 |
| `RaiseSlider.tsx` | レイズ金額スライダー（最小レイズ〜オールイン） |
| `presetCalculator.ts` | プリフロップ: BB倍数（2.5BB / 3BB / 4BB）、ポストフロップ: ポット比率（1/3 / 1/2 / 2/3 / 3/4 / Pot）でプリセット金額を計算 |
| `PreActionBar.tsx` | 自分のターン前に「Check/Fold」「Check」「Fold」を事前選択するチェックボックスUI。ターンが来た際に自動実行 |
| `types.ts` | `PreActionType` の共有型定義 |

---

### UI - ロビー

`src/components/lobby/`

| コンポーネント | 説明 |
|---|---|
| `LobbyModeSelector.tsx` | ゲーム開始画面。「ホストとしてプレイ」「参加する」の選択 |
| `HostSetupForm.tsx` | ホスト設定フォーム（プレイヤー名・ブラインド・初期チップ） |
| `JoinSetupForm.tsx` | 参加者設定フォーム（プレイヤー名入力） |
| `BleHostLobby.tsx` | ホスト側ロビー画面。BLE アドバタイズ開始・参加者待機・ゲーム開始ボタン |
| `BleJoinLobby.tsx` | クライアント側ロビー画面。ホストスキャン・接続・待機 |
| `HostList.tsx` | BLE スキャンで見つかったホスト一覧の表示 |
| `LobbyView.tsx` | ロビー待機室。参加中プレイヤーのスロット表示・チップリセットボタン |
| `PlayerSlot.tsx` | ロビー内の各プレイヤー枠（名前・準備状態） |

---

### UI - 共通

`src/components/common/` / `src/components/result/`

| コンポーネント | 説明 |
|---|---|
| `PlayingCard.tsx` | トランプカードの表示（表面: ランク+スート, 裏面: ダークグレー） |
| `ChipAmount.tsx` | チップ金額の整形表示 |
| `PassDeviceScreen.tsx` | ホットシートモード用のデバイス手渡し画面。次のプレイヤーに端末を渡すよう促すUI |
| `ResultOverlay.tsx` | ラウンド終了オーバーレイ。勝者・役名・全員の手札公開・ポット分配内訳を表示。リマッチボタンとロビーへ戻るボタンを含む |

---

### コンテキスト・フック

`src/contexts/` / `src/hooks/`

| モジュール | 説明 |
|---|---|
| `GameContext.tsx` | ゲーム全体の状態管理。`hotseat` / `debug` / `ble-host` / `ble-client` の4モードに対応。`doAction` / `nextRound` / `rematch` / `setPreAction` などのAPIを提供 |
| `useActionTimer.ts` | アクションタイムアウトのカウントダウン管理（デフォルト30秒）。タイムアウト時にチェック可能ならチェック、それ以外はフォールドを自動実行 |
| `usePersistence.ts` | ゲーム開始・終了・リマッチ時のチップ残高永続化。`GameRepository` インターフェースを通じて保存先を抽象化 |
| `useGame.ts` | `GameContext` から値を取り出すユーティリティフック |

---

### 永続化

`src/services/persistence/`

| モジュール | 説明 |
|---|---|
| `GameRepository.ts` | プレイヤー統計・ゲーム履歴の保存/取得インターフェース |
| `InMemoryGameRepository.ts` | セッション内メモリのみに保存（Phase 1デフォルト） |
| `AsyncStorageGameRepository.ts` | `@react-native-async-storage/async-storage` を使ったローカル永続化（Phase 2） |

---

## 未実装機能（設計仕様あり）

設計仕様ドキュメントは `docs/superpowers/specs/` に存在するが、実装ブランチは未作成。

| 機能 | 設計仕様ファイル | 概要 |
|---|---|---|
| アクション履歴バー | `2026-03-16-action-history-bar-design.md` | ゲーム画面上部に横スクロールで各アクションをピル形式で表示 |
| ブラインドレベル | `2026-03-16-blind-level-design.md` | トーナメント形式の時間経過ブラインド増加。ホストがタイマー管理、クライアントに同期 |
| アニメーション・SE | `2026-03-16-animation-sound-design.md` | カード配布・コミュニティカード公開・チップ移動のアニメ。各アクションのサウンド |
| ゲーム履歴UI | `2026-03-16-game-history-ui-design.md` | プレイ履歴・勝率・チップ増減グラフの表示画面 |
| 観戦モード | `2026-03-16-spectator-mode-design.md` | プレイヤーとして参加せず、ゲームを観戦するモード |
