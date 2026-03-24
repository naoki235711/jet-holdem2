# Test Directory Reorganization Design

**Date:** 2026-03-24
**Status:** Approved

## Goal

Improve test visibility so that whether a file is a unit test or integration test is immediately clear at a glance, without changing the overall domain-based directory structure.

## Current State

```
tests/
├── gameEngine/       ← Unit (6) + GameLoopPotManager.integration.test.ts ⚠️ mixed
├── services/         ← Unit (1)
├── ble/              ← Unit (11) + integration/ (2) ✅ separated
├── persistence/      ← Unit (3)
├── integration/      ← 3 cross-layer integration files (test-guide.md says "予定" ⚠️ outdated)
└── ui/
    ├── components/   ← Unit (17)
    ├── contexts/     ← Unit (1)
    └── integration/  ← Integration (5) ✅ separated
```

**Problems:**
1. `tests/gameEngine/GameLoopPotManager.integration.test.ts` is a gameEngine-domain integration test mixed into the unit test directory.
2. `docs/test-guide.md` is outdated — lists `tests/integration/` as "予定" (planned) but it already contains 3 files.

## Design

### Convention

Every domain follows the same pattern:

```
tests/<domain>/
├── *.test.ts          ← unit tests
└── integration/       ← integration tests
    └── *.integration.test.ts
```

`tests/integration/` remains a dedicated location for cross-layer integration tests (tests that span multiple domains such as BLE + Service + Persistence).

### Changes

#### 1. Move misplaced file

```
FROM: tests/gameEngine/GameLoopPotManager.integration.test.ts
TO:   tests/gameEngine/integration/GameLoopPotManager.integration.test.ts
```

**Rationale:** This test combines `GameLoop` and `PotManager` — both gameEngine-domain classes. It is a within-domain integration test, consistent with how `ble/integration/` and `ui/integration/` are used.

#### 2. Update `docs/test-guide.md`

- Remove "予定" from the `tests/integration/` description
- Add the 3 existing cross-layer integration files to the test list
- Add `tests/gameEngine/integration/` to the directory structure diagram
- Update test count summary

### What does NOT change

- `jest.config.js` — no changes needed. `tests/gameEngine` is already under the `engine` project root, so `tests/gameEngine/integration/` is automatically picked up.
- All other directories — `ble/`, `ui/`, `persistence/`, `services/` are already correct.

## Target State

```
tests/
├── gameEngine/
│   ├── *.test.ts              ← unit (6 files)
│   └── integration/           ← NEW
│       └── GameLoopPotManager.integration.test.ts
├── services/                  ← unit (1)
├── ble/
│   ├── *.test.ts              ← unit (11)
│   └── integration/           ← integration (2)
├── persistence/               ← unit (3)
├── integration/               ← cross-layer integration (3)
└── ui/
    ├── components/            ← unit (17)
    ├── contexts/              ← unit (1)
    └── integration/           ← integration (5)
```

## Success Criteria

- Every domain follows the `<domain>/*.test.ts` + `<domain>/integration/` pattern consistently.
- `docs/test-guide.md` accurately reflects the actual file structure.
- `npm test` continues to pass without changes to `jest.config.js`.
