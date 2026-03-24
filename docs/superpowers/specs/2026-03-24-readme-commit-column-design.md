# tests/README.md 最終コミットカラム追加 設計書

## 目的

`tests/README.md` の各テストファイル一覧テーブルに `最終コミット` カラムを追加し、各ファイルが最後に更新されたコミットハッシュを記録する。

## 設計

### 変更内容

全 12 テーブルのヘッダーを以下のように変更する：

```markdown
<!-- Before -->
| ファイル | テスト対象 |
|---------|-----------|

<!-- After -->
| ファイル | テスト対象 | 最終コミット |
|---------|-----------|-------------|
```

各行に短縮ハッシュ（7文字）を追加する：

```markdown
| `tests/ble/transportRegistry.test.ts` | トランスポートレジストリ（set/get/clear） | `c1f82ec` |
```

### スコープ

`tests/README.md` 内の全テーブル（Jestテスト + E2Eテスト）、計 60 エントリ。

### ハッシュ取得方法

```bash
git log --follow -1 --format="%h" <file>
```

---

## 全ファイル ハッシュ一覧

### 1. ゲームエンジン Unit テスト

| ファイル | ハッシュ |
|---------|---------|
| `tests/gameEngine/Card.test.ts` | `8beacab` |
| `tests/gameEngine/Deck.test.ts` | `312a34d` |
| `tests/gameEngine/HandEvaluator.test.ts` | `8beacab` |
| `tests/gameEngine/PotManager.test.ts` | `0a66623` |
| `tests/gameEngine/BettingRound.test.ts` | `93e9218` |
| `tests/gameEngine/GameLoop.test.ts` | `0ede0d4` |

### 2. ゲームエンジン Integration テスト

| ファイル | ハッシュ |
|---------|---------|
| `tests/gameEngine/integration/GameLoopPotManager.integration.test.ts` | `889a355` |

### 3. サービス Unit テスト

| ファイル | ハッシュ |
|---------|---------|
| `tests/services/LocalGameService.test.ts` | `26d9231` |

### 4. Hooks Unit テスト

| ファイル | ハッシュ |
|---------|---------|
| `tests/hooks/useActionTimer.test.tsx` | `888314c` |
| `tests/hooks/useGame.test.tsx` | `53fef08` |

### 5. BLE Unit テスト

| ファイル | ハッシュ |
|---------|---------|
| `tests/ble/bleConstants.test.ts` | `2948995` |
| `tests/ble/ChunkManager.test.ts` | `f657d8a` |
| `tests/ble/MockBleTransport.test.ts` | `d9f1040` |
| `tests/ble/LobbyProtocol.test.ts` | `1a023d1` |
| `tests/ble/GameProtocol.test.ts` | `7ec5c6b` |
| `tests/ble/LobbyHost.test.ts` | `fb27b49` |
| `tests/ble/LobbyClient.test.ts` | `00190f1` |
| `tests/ble/BleHostGameService.test.ts` | `3d54346` |
| `tests/ble/BleClientGameService.test.ts` | `8682457` |
| `tests/ble/BleHostTransportImpl.test.ts` | `c3caba1` |
| `tests/ble/BleClientTransportImpl.test.ts` | `b519d76` |
| `tests/ble/transportRegistry.test.ts` | `c1f82ec` |

### 6. BLE Integration テスト

| ファイル | ハッシュ |
|---------|---------|
| `tests/ble/integration/LobbyFlow.test.ts` | `00190f1` |
| `tests/ble/integration/BleGameFlow.test.ts` | `e6be04b` |

### 7. Persistence Unit テスト

| ファイル | ハッシュ |
|---------|---------|
| `tests/persistence/InMemoryGameRepository.test.ts` | `ce045e3` |
| `tests/persistence/AsyncStorageGameRepository.test.ts` | `986fbd6` |
| `tests/persistence/usePersistence.test.ts` | `baca875` |

### 8. UIコンポーネント Unit テスト

| ファイル | ハッシュ |
|---------|---------|
| `tests/ui/components/ActionButtons.test.tsx` | `90e0b57` |
| `tests/ui/components/ActionTimerBar.test.tsx` | `f98b6de` |
| `tests/ui/components/BleHostLobby.test.tsx` | `93186fa` |
| `tests/ui/components/BleJoinLobby.test.tsx` | `fd5528a` |
| `tests/ui/components/ChipAmount.test.tsx` | `c2cdaeb` |
| `tests/ui/components/CommunityCards.test.tsx` | `78739aa` |
| `tests/ui/components/HostList.test.tsx` | `89d6193` |
| `tests/ui/components/HostSetupForm.test.tsx` | `832b591` |
| `tests/ui/components/JoinSetupForm.test.tsx` | `a5705bd` |
| `tests/ui/components/LobbyModeSelector.test.tsx` | `eb9d512` |
| `tests/ui/components/LobbyView.test.tsx` | `17e7c7f` |
| `tests/ui/components/PassDeviceScreen.test.tsx` | `19a802c` |
| `tests/ui/components/PlayerSeat.test.tsx` | `e560fe2` |
| `tests/ui/components/PlayerSlot.test.tsx` | `fba8c97` |
| `tests/ui/components/PlayingCard.test.tsx` | `a36247f` |
| `tests/ui/components/PotDisplay.test.tsx` | `b09cc6e` |
| `tests/ui/components/PreActionBar.test.tsx` | `12c89f2` |
| `tests/ui/components/presetCalculator.test.ts` | `0e0cea2` |
| `tests/ui/components/RaiseSlider.test.tsx` | `79f52c7` |
| `tests/ui/components/ResultOverlay.test.tsx` | `fce1582` |

### 9. UIコンテキスト Unit テスト

| ファイル | ハッシュ |
|---------|---------|
| `tests/ui/contexts/GameContext.test.tsx` | `279e052` |

### 10. UI Integration テスト

| ファイル | ハッシュ |
|---------|---------|
| `tests/ui/integration/gameFlow.integration.test.tsx` | `f57aaf0` |
| `tests/ui/integration/bettingActions.integration.test.tsx` | `9d35738` |
| `tests/ui/integration/hotseatMode.integration.test.tsx` | `9d35738` |
| `tests/ui/integration/resultAndNextRound.integration.test.tsx` | `f57aaf0` |
| `tests/ui/integration/edgeCases.integration.test.tsx` | `9d35738` |
| `tests/ui/integration/preAction.integration.test.tsx` | `fe734ca` |
| `tests/ui/integration/gameProviderModes.integration.test.tsx` | `029d20f` |

### 11. クロスレイヤー Integration テスト

| ファイル | ハッシュ |
|---------|---------|
| `tests/integration/lobbyToGame.integration.test.ts` | `657710e` |
| `tests/integration/persistenceLifecycle.integration.test.ts` | `6c913f8` |
| `tests/integration/repositoryResilience.integration.test.ts` | `cd4333e` |

### 12. E2E テスト

| ファイル | ハッシュ |
|---------|---------|
| `e2e/hotseat.spec.ts` | `2d0c47e` |
| `e2e/lobby.spec.ts` | `2d0c47e` |
