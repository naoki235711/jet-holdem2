# Test Directory Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `GameLoopPotManager.integration.test.ts` into a new `tests/gameEngine/integration/` subdirectory and update `docs/test-guide.md` to match the actual file structure.

**Architecture:** The `tests/` directory follows a domain-based layout where each domain has `*.test.ts` (unit) at the top level and an `integration/` subdirectory for integration tests. `ble/` and `ui/` already follow this pattern; this plan makes `gameEngine/` consistent. `tests/integration/` remains the home for cross-layer integration tests. No changes to `jest.config.js` are needed — `tests/gameEngine` is already a root in the `engine` project, so `tests/gameEngine/integration/` is automatically discovered.

**Tech Stack:** Jest (ts-jest), Node.js, TypeScript

---

### Task 1: Move the integration test file

**Files:**
- Move: `tests/gameEngine/GameLoopPotManager.integration.test.ts` → `tests/gameEngine/integration/GameLoopPotManager.integration.test.ts`

- [ ] **Step 1: Create the new directory and move the file**

```bash
mkdir -p tests/gameEngine/integration
git mv tests/gameEngine/GameLoopPotManager.integration.test.ts tests/gameEngine/integration/GameLoopPotManager.integration.test.ts
```

- [ ] **Step 2: Verify the test still passes**

Run the engine project tests:

```bash
npx jest --selectProjects engine
```

Expected: All tests pass. The moved file should be discovered automatically because `tests/gameEngine` is a root in `jest.config.js` and Jest recurses into subdirectories.

- [ ] **Step 3: Commit**

```bash
git add tests/gameEngine/integration/GameLoopPotManager.integration.test.ts tests/gameEngine/GameLoopPotManager.integration.test.ts
git commit -m "refactor(tests): move GameLoopPotManager integration test into gameEngine/integration/"
```

---

### Task 2: Update docs/test-guide.md

**Files:**
- Modify: `docs/test-guide.md`

The document has several sections out of sync with reality:

1. `tests/gameEngine/` description says 6 files — add a note that `integration/` subfolder now exists
2. `tests/integration/` is listed as "（予定）" (planned) but already has 3 files — update the description and add the 3 files to the test table
3. The directory structure diagram is missing `tests/gameEngine/integration/`
4. The test count summary is outdated

- [ ] **Step 1: Update the `tests/gameEngine/` section**

Find the `### 1. ゲームエンジン Unit テスト（6ファイル）` heading. Add a new subsection below the table for the integration test:

```markdown
#### GameEngine Integration テスト（1ファイル）

| ファイル | テスト対象 |
|---------|-----------|
| `tests/gameEngine/integration/GameLoopPotManager.integration.test.ts` | GameLoop と PotManager の連携（サイドポット、オールイン） |
```

- [ ] **Step 2: Update the `tests/integration/` section**

Find `### 8.` or wherever `tests/integration/` appears (currently described as cross-layer テスト and marked 予定). Replace "（予定）" with the actual file listing:

```markdown
### 8. クロスレイヤー Integration テスト（3ファイル）

Jest プロジェクト: `engine` / 環境: Node.js

| ファイル | テスト対象 |
|---------|-----------|
| `tests/integration/lobbyToGame.integration.test.ts` | ロビーからゲーム開始までのフロー |
| `tests/integration/persistenceLifecycle.integration.test.ts` | 永続化のライフサイクル |
| `tests/integration/repositoryResilience.integration.test.ts` | リポジトリの耐障害性 |
```

(Adjust the section number to fit the existing document structure.)

- [ ] **Step 3: Update the directory structure diagram**

Find the `## ディレクトリ構成` section. Replace it with:

```markdown
## ディレクトリ構成

\`\`\`
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
\`\`\`
```

- [ ] **Step 4: Update the test count summary table**

Find `## テスト数サマリー` and update to reflect current counts:

```markdown
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
```

- [ ] **Step 5: Verify all tests still pass**

```bash
npm test
```

Expected: All tests pass (same count as before, no regressions).

- [ ] **Step 6: Commit**

```bash
git add docs/test-guide.md
git commit -m "docs(test-guide): update to reflect actual test structure and file counts"
```
