# Tests README Design

**Date:** 2026-03-24
**Status:** Approved

## Goal

Create `tests/README.md` as the single authoritative reference for the test suite — combining and updating the content of `docs/test-guide.md` and key implementation notes from `docs/ui-integration-test-plan.md`. Delete `docs/test-guide.md` afterward.

## Motivation

- `docs/test-guide.md` is outdated: missing several test files added after it was written, and lists `tests/integration/` as "予定" (planned) when 3 files already exist.
- Placing the reference doc inside `tests/` keeps documentation co-located with the code it describes.
- `docs/ui-integration-test-plan.md` contains implementation notes (§5) that are still useful as ongoing guidance but are buried in a design document that reads like a planning artifact.

## Approach

**Approach A (chosen):** Create `tests/README.md` as the authoritative reference; delete `docs/test-guide.md`; keep `docs/ui-integration-test-plan.md` as historical design context.

## `tests/README.md` Structure

```
# Tests

## クイックリファレンス
## ディレクトリ構成
## テスト一覧
## 結合テストの実装ノート
## 設定ファイル
## E2Eテストの前提
## 既知の警告
```

### Section: クイックリファレンス

Execution commands table from `docs/test-guide.md` — no changes needed.

### Section: ディレクトリ構成

Reflects the **target state** from the approved reorganization spec (`2026-03-24-test-directory-reorganization-design.md`):

```
tests/
├── gameEngine/
│   ├── *.test.ts              ← unit (6 files)
│   └── integration/
│       └── GameLoopPotManager.integration.test.ts
├── services/                  ← unit (1)
├── ble/
│   ├── *.test.ts              ← unit (11)
│   └── integration/           ← integration (2)
├── persistence/               ← unit (3)
├── hooks/                     ← unit (1)
├── integration/               ← cross-layer integration (3)
└── ui/
    ├── setup.js               ← UIテスト用セットアップ（Modalモック等）
    ├── helpers/               ← テストヘルパー（renderWithGame等）
    ├── components/            ← unit (20)
    ├── contexts/              ← unit (1)
    └── integration/           ← integration (7)
        └── helpers/
```

### Section: テスト一覧

Updates from `docs/test-guide.md`:

| Category | Additions |
|----------|-----------|
| UIコンポーネント | `ActionTimerBar.test.tsx`, `PreActionBar.test.tsx`, `presetCalculator.test.ts` |
| UI統合 | `preAction.integration.test.tsx`, `gameProviderModes.integration.test.tsx` |
| クロスレイヤー統合 | `lobbyToGame.integration.test.ts`, `persistenceLifecycle.integration.test.ts`, `repositoryResilience.integration.test.ts` (remove "予定" label) |
| Hooks | New category: `tests/hooks/useActionTimer.test.tsx` |
| ゲームエンジン統合 | New sub-category: `tests/gameEngine/integration/GameLoopPotManager.integration.test.ts` |

### Section: 結合テストの実装ノート

Extracted from `docs/ui-integration-test-plan.md` §5, keeping only the durable implementation guidance:

- **`act()` の使用** — `fireEvent` や `service.handleAction()` 呼び出しは `act()` でラップする。理由: LocalGameService のアクションは同期的だが React の状態更新は非同期のため。
- **デバッグモード推奨** — 結合テストは `mode: 'debug'` を基本とする。全プレイヤーの手札が見えること、`actingSeat` が `state.activePlayer` に基づくことでテスト検証が容易になる。ホットシートモード専用テストのみ `mode: 'hotseat'` を使用。
- **エンジン状態の直接確認** — UI 表示の検証に加え `service.getState()` でゲームエンジンの内部状態も併せて検証する。
- **expo-router のモック** — `ResultOverlay` と `LobbyView` は `expo-router` を使用するため、結合テストでは `jest.mock('expo-router', ...)` が必要。

### Section: 設定ファイル / E2Eテストの前提 / 既知の警告

Carried over from `docs/test-guide.md` unchanged.

## Prerequisites

The reorganization spec `2026-03-24-test-directory-reorganization-design.md` must be applied before or in the same commit/PR as this work. The `tests/README.md` directory diagram and test list reference the post-reorganization path `tests/gameEngine/integration/GameLoopPotManager.integration.test.ts`, which does not yet exist at the time of writing.

## File Operations

| Operation | File |
|-----------|------|
| Create | `tests/README.md` |
| Delete | `docs/test-guide.md` |
| Keep (no change) | `docs/ui-integration-test-plan.md` |

## Success Criteria

- `tests/README.md` accurately reflects all test files in the post-reorganization target state.
- `docs/test-guide.md` is deleted.
- `npm test` continues to pass (this change is documentation-only).
