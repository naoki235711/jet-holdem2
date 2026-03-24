# tests/README.md 最終コミットカラム追加 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `tests/README.md` の全12テーブルに `最終コミット` カラム（短縮ハッシュ）を追加する。

**Architecture:** `tests/README.md` の1ファイルのみを編集する。全ハッシュは事前取得済み。テストは不要（markdownドキュメント変更のみ）。3タスクに分割し、各タスク後にコミット。

**Tech Stack:** Markdown, git

**Spec:** `docs/superpowers/specs/2026-03-24-readme-commit-column-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `tests/README.md` | 全12テーブルに `最終コミット` カラムを追加 |

---

## Task 1: セクション 1〜4（ゲームエンジン・サービス・Hooks）

**Files:**
- Modify: `tests/README.md`（セクション 1〜4 のテーブル）

- [ ] **Step 1: セクション 1〜4 のテーブルを編集**

`tests/README.md` の以下の4テーブルを置換する。

**セクション1（ゲームエンジン Unit、行78-85）**

```
# Before
| ファイル | テスト対象 |
|---------|-----------|
| `tests/gameEngine/Card.test.ts` | カードの生成・比較 |
| `tests/gameEngine/Deck.test.ts` | デッキのシャッフル・配布 |
| `tests/gameEngine/HandEvaluator.test.ts` | ハンド評価（役の判定） |
| `tests/gameEngine/PotManager.test.ts` | ポット計算・サイドポット |
| `tests/gameEngine/BettingRound.test.ts` | ベッティングラウンドのロジック |
| `tests/gameEngine/GameLoop.test.ts` | ゲーム全体のフロー制御 |

# After
| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/gameEngine/Card.test.ts` | カードの生成・比較 | `8beacab` |
| `tests/gameEngine/Deck.test.ts` | デッキのシャッフル・配布 | `312a34d` |
| `tests/gameEngine/HandEvaluator.test.ts` | ハンド評価（役の判定） | `8beacab` |
| `tests/gameEngine/PotManager.test.ts` | ポット計算・サイドポット | `0a66623` |
| `tests/gameEngine/BettingRound.test.ts` | ベッティングラウンドのロジック | `93e9218` |
| `tests/gameEngine/GameLoop.test.ts` | ゲーム全体のフロー制御 | `0ede0d4` |
```

**セクション2（ゲームエンジン Integration、行89-91）**

```
# Before
| ファイル | テスト対象 |
|---------|-----------|
| `tests/gameEngine/integration/GameLoopPotManager.integration.test.ts` | GameLoop + PotManager 結合（サイドポット、オールイン） |

# After
| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/gameEngine/integration/GameLoopPotManager.integration.test.ts` | GameLoop + PotManager 結合（サイドポット、オールイン） | `889a355` |
```

**セクション3（サービス Unit、行95-97）**

```
# Before
| ファイル | テスト対象 |
|---------|-----------|
| `tests/services/LocalGameService.test.ts` | LocalGameService（UIとエンジンの橋渡し、エラーハンドリング） |

# After
| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/services/LocalGameService.test.ts` | LocalGameService（UIとエンジンの橋渡し、エラーハンドリング） | `26d9231` |
```

**セクション4（Hooks Unit、行101-104）**

```
# Before
| ファイル | テスト対象 |
|---------|-----------|
| `tests/hooks/useActionTimer.test.tsx` | アクションタイマーフック（タイムアウト・リセット・無効化） |
| `tests/hooks/useGame.test.tsx` | useGame フック（コンテキスト外エラー・正常系） |

# After
| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/hooks/useActionTimer.test.tsx` | アクションタイマーフック（タイムアウト・リセット・無効化） | `888314c` |
| `tests/hooks/useGame.test.tsx` | useGame フック（コンテキスト外エラー・正常系） | `53fef08` |
```

- [ ] **Step 2: 変更を確認**

```bash
grep -c "最終コミット" tests/README.md
```

Expected: `4`（セクション1〜4のヘッダー行が4つ）

- [ ] **Step 3: コミット**

```bash
git add tests/README.md
git commit -m "docs(tests): add 最終コミット column to sections 1-4 in README"
```

---

## Task 2: セクション 5〜8（BLE・Persistence・UIコンポーネント）

**Files:**
- Modify: `tests/README.md`（セクション 5〜8 のテーブル）

- [ ] **Step 1: セクション 5〜8 のテーブルを編集**

**セクション5（BLE Unit、行110-123）**

```
# Before
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

# After
| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/ble/bleConstants.test.ts` | BLE定数 | `2948995` |
| `tests/ble/ChunkManager.test.ts` | メッセージチャンク分割・結合 | `f657d8a` |
| `tests/ble/MockBleTransport.test.ts` | モックBLEトランスポート | `d9f1040` |
| `tests/ble/LobbyProtocol.test.ts` | ロビープロトコルメッセージ検証 | `1a023d1` |
| `tests/ble/GameProtocol.test.ts` | ゲームプロトコルメッセージ検証 | `7ec5c6b` |
| `tests/ble/LobbyHost.test.ts` | ロビーホスト（プレイヤー管理） | `fb27b49` |
| `tests/ble/LobbyClient.test.ts` | ロビークライアント（参加・準備） | `00190f1` |
| `tests/ble/BleHostGameService.test.ts` | BLEホストゲームサービス | `3d54346` |
| `tests/ble/BleClientGameService.test.ts` | BLEクライアントゲームサービス | `8682457` |
| `tests/ble/BleHostTransportImpl.test.ts` | BLEホストトランスポート実装 | `c3caba1` |
| `tests/ble/BleClientTransportImpl.test.ts` | BLEクライアントトランスポート実装 | `b519d76` |
| `tests/ble/transportRegistry.test.ts` | トランスポートレジストリ（set/get/clear） | `c1f82ec` |
```

**セクション6（BLE Integration、行127-130）**

```
# Before
| ファイル | テスト対象 |
|---------|-----------|
| `tests/ble/integration/LobbyFlow.test.ts` | ロビーフロー（join/ready/disconnect） |
| `tests/ble/integration/BleGameFlow.test.ts` | BLEゲームフロー（ラウンド進行、切断処理） |

# After
| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/ble/integration/LobbyFlow.test.ts` | ロビーフロー（join/ready/disconnect） | `00190f1` |
| `tests/ble/integration/BleGameFlow.test.ts` | BLEゲームフロー（ラウンド進行、切断処理） | `e6be04b` |
```

**セクション7（Persistence Unit、行136-140）**

```
# Before
| ファイル | テスト対象 |
|---------|-----------|
| `tests/persistence/InMemoryGameRepository.test.ts` | インメモリリポジトリ |
| `tests/persistence/AsyncStorageGameRepository.test.ts` | AsyncStorageリポジトリ |
| `tests/persistence/usePersistence.test.ts` | subscribePersistence（モックService経由） |

# After
| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/persistence/InMemoryGameRepository.test.ts` | インメモリリポジトリ | `ce045e3` |
| `tests/persistence/AsyncStorageGameRepository.test.ts` | AsyncStorageリポジトリ | `986fbd6` |
| `tests/persistence/usePersistence.test.ts` | subscribePersistence（モックService経由） | `baca875` |
```

**セクション8（UIコンポーネント Unit、行146-167）**

```
# Before
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

# After
| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/ui/components/ActionButtons.test.tsx` | アクションボタン（Fold/Call/Raise） | `90e0b57` |
| `tests/ui/components/ActionTimerBar.test.tsx` | アクションタイマーバー（カラー補間） | `f98b6de` |
| `tests/ui/components/BleHostLobby.test.tsx` | BLEホストロビー画面 | `93186fa` |
| `tests/ui/components/BleJoinLobby.test.tsx` | BLE参加ロビー画面 | `fd5528a` |
| `tests/ui/components/ChipAmount.test.tsx` | チップ表示 | `c2cdaeb` |
| `tests/ui/components/CommunityCards.test.tsx` | コミュニティカード表示 | `78739aa` |
| `tests/ui/components/HostList.test.tsx` | ホスト一覧 | `89d6193` |
| `tests/ui/components/HostSetupForm.test.tsx` | ホスト設定フォーム | `832b591` |
| `tests/ui/components/JoinSetupForm.test.tsx` | 参加設定フォーム | `a5705bd` |
| `tests/ui/components/LobbyModeSelector.test.tsx` | ロビーモード選択 | `eb9d512` |
| `tests/ui/components/LobbyView.test.tsx` | ロビー画面 | `17e7c7f` |
| `tests/ui/components/PassDeviceScreen.test.tsx` | ホットシートモードの端末パス画面 | `19a802c` |
| `tests/ui/components/PlayerSeat.test.tsx` | プレイヤー座席表示 | `e560fe2` |
| `tests/ui/components/PlayerSlot.test.tsx` | プレイヤースロット | `fba8c97` |
| `tests/ui/components/PlayingCard.test.tsx` | トランプカード表示 | `a36247f` |
| `tests/ui/components/PotDisplay.test.tsx` | ポット表示 | `b09cc6e` |
| `tests/ui/components/PreActionBar.test.tsx` | プリアクションバー（チェック/コール予約） | `12c89f2` |
| `tests/ui/components/presetCalculator.test.ts` | レイズ額プリセット計算 | `0e0cea2` |
| `tests/ui/components/RaiseSlider.test.tsx` | レイズスライダー | `79f52c7` |
| `tests/ui/components/ResultOverlay.test.tsx` | 結果オーバーレイ | `fce1582` |
```

- [ ] **Step 2: 変更を確認**

```bash
grep -c "最終コミット" tests/README.md
```

Expected: `8`（セクション1〜8のヘッダー行が8つ）

- [ ] **Step 3: コミット**

```bash
git add tests/README.md
git commit -m "docs(tests): add 最終コミット column to sections 5-8 in README"
```

---

## Task 3: セクション 9〜12（UIコンテキスト・UI Integration・クロスレイヤー・E2E）

**Files:**
- Modify: `tests/README.md`（セクション 9〜12 のテーブル）

- [ ] **Step 1: セクション 9〜12 のテーブルを編集**

**セクション9（UIコンテキスト Unit、行171-173）**

```
# Before
| ファイル | テスト対象 |
|---------|-----------|
| `tests/ui/contexts/GameContext.test.tsx` | GameContext（状態管理） |

# After
| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/ui/contexts/GameContext.test.tsx` | GameContext（状態管理） | `279e052` |
```

**セクション10（UI Integration、行179-187）**

```
# Before
| ファイル | テスト対象 |
|---------|-----------|
| `tests/ui/integration/gameFlow.integration.test.tsx` | UIからエンジンへの全体フロー、フェーズ遷移 |
| `tests/ui/integration/bettingActions.integration.test.tsx` | ベッティング操作 |
| `tests/ui/integration/hotseatMode.integration.test.tsx` | ホットシートモード |
| `tests/ui/integration/resultAndNextRound.integration.test.tsx` | 結果表示・次ラウンドへの遷移 |
| `tests/ui/integration/edgeCases.integration.test.tsx` | エッジケース（サイドポット、オールインなど） |
| `tests/ui/integration/preAction.integration.test.tsx` | プリアクション（チェック/コール予約） |
| `tests/ui/integration/gameProviderModes.integration.test.tsx` | GameProviderのモード切替 |

# After
| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/ui/integration/gameFlow.integration.test.tsx` | UIからエンジンへの全体フロー、フェーズ遷移 | `f57aaf0` |
| `tests/ui/integration/bettingActions.integration.test.tsx` | ベッティング操作 | `9d35738` |
| `tests/ui/integration/hotseatMode.integration.test.tsx` | ホットシートモード | `9d35738` |
| `tests/ui/integration/resultAndNextRound.integration.test.tsx` | 結果表示・次ラウンドへの遷移 | `f57aaf0` |
| `tests/ui/integration/edgeCases.integration.test.tsx` | エッジケース（サイドポット、オールインなど） | `9d35738` |
| `tests/ui/integration/preAction.integration.test.tsx` | プリアクション（チェック/コール予約） | `fe734ca` |
| `tests/ui/integration/gameProviderModes.integration.test.tsx` | GameProviderのモード切替 | `029d20f` |
```

**セクション11（クロスレイヤー Integration、行193-197）**

```
# Before
| ファイル | テスト対象 |
|---------|-----------|
| `tests/integration/lobbyToGame.integration.test.ts` | ロビーからゲーム開始までのフロー |
| `tests/integration/persistenceLifecycle.integration.test.ts` | Persistence ライフサイクル |
| `tests/integration/repositoryResilience.integration.test.ts` | リポジトリ耐障害性 |

# After
| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `tests/integration/lobbyToGame.integration.test.ts` | ロビーからゲーム開始までのフロー | `657710e` |
| `tests/integration/persistenceLifecycle.integration.test.ts` | Persistence ライフサイクル | `6c913f8` |
| `tests/integration/repositoryResilience.integration.test.ts` | リポジトリ耐障害性 | `cd4333e` |
```

**セクション12（E2E、行203-205）**

```
# Before
| ファイル | テスト対象 |
|---------|-----------|
| `e2e/hotseat.spec.ts` | ホットシートモードのブラウザテスト |
| `e2e/lobby.spec.ts` | ロビー画面 |

# After
| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
| `e2e/hotseat.spec.ts` | ホットシートモードのブラウザテスト | `2d0c47e` |
| `e2e/lobby.spec.ts` | ロビー画面 | `2d0c47e` |
```

- [ ] **Step 2: 最終確認**

```bash
grep -c "最終コミット" tests/README.md
```

Expected: `12`（全12セクションのヘッダー行）

```bash
grep -E "^\| \`(tests|e2e)/" tests/README.md | grep -vc "[0-9a-f]\{7\}"
```

Expected: `0`（ハッシュ列のないファイル行が残っていない）

- [ ] **Step 3: コミット**

```bash
git add tests/README.md
git commit -m "docs(tests): add 最終コミット column to sections 9-12 in README"
```
