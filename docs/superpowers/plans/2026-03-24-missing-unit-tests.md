# Missing Unit Tests (useGame & transportRegistry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 2 missing unit test files (`useGame.test.tsx`, `transportRegistry.test.ts`) and update `tests/README.md` to reflect them.

**Architecture:** Each test file is independent. `useGame.test.tsx` uses `@testing-library/react-native`'s `renderHook` with `GameProvider` as a wrapper; it belongs to the `ui` Jest project. `transportRegistry.test.ts` uses plain ts-jest with no React dependencies; it belongs to the `engine` Jest project.

**Tech Stack:** TypeScript, Jest (ts-jest / react-native preset), `@testing-library/react-native` (`renderHook`)

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `tests/hooks/useGame.test.tsx` | Unit tests for `useGame` hook (error path + happy path) |
| Create | `tests/ble/transportRegistry.test.ts` | Unit tests for transport registry set/get/clear functions |
| Modify | `tests/README.md` | Update file counts and add entries for 2 new test files |

---

## Task 1: `tests/ble/transportRegistry.test.ts`

`transportRegistry.ts` has no React dependencies — simpler to write first.

**Files:**
- Create: `tests/ble/transportRegistry.test.ts`
- Reference: `src/services/ble/transportRegistry.ts`
- Reference: `src/services/ble/BleTransport.ts`

- [ ] **Step 1: Write the test file**

```typescript
import {
  setHostTransport,
  getHostTransport,
  clearHostTransport,
  setClientTransport,
  getClientTransport,
  clearClientTransport,
} from '../../src/services/ble/transportRegistry';
import { BleHostTransport, BleClientTransport } from '../../src/services/ble/BleTransport';

describe('transportRegistry', () => {
  afterEach(() => {
    clearHostTransport();
    clearClientTransport();
  });

  describe('host transport', () => {
    it('returns null initially', () => {
      expect(getHostTransport()).toBeNull();
    });

    it('stores and returns the transport after set', () => {
      const t = {} as BleHostTransport;
      setHostTransport(t);
      expect(getHostTransport()).toBe(t);
    });

    it('returns null after clear', () => {
      setHostTransport({} as BleHostTransport);
      clearHostTransport();
      expect(getHostTransport()).toBeNull();
    });
  });

  describe('client transport', () => {
    it('returns null initially', () => {
      expect(getClientTransport()).toBeNull();
    });

    it('stores and returns the transport after set', () => {
      const t = {} as BleClientTransport;
      setClientTransport(t);
      expect(getClientTransport()).toBe(t);
    });

    it('returns null after clear', () => {
      setClientTransport({} as BleClientTransport);
      clearClientTransport();
      expect(getClientTransport()).toBeNull();
    });
  });

  it('host and client transports are independent', () => {
    const host = {} as BleHostTransport;
    const client = {} as BleClientTransport;
    setHostTransport(host);
    setClientTransport(client);
    clearHostTransport();
    expect(getHostTransport()).toBeNull();
    expect(getClientTransport()).toBe(client);
  });
});
```

- [ ] **Step 2: Run the test and confirm it passes**

```bash
npx jest tests/ble/transportRegistry.test.ts --selectProjects engine
```

Expected: 7 tests pass, 0 fail.

- [ ] **Step 3: Commit**

```bash
git add tests/ble/transportRegistry.test.ts
git commit -m "test(ble): add unit tests for transportRegistry"
```

---

## Task 2: `tests/hooks/useGame.test.tsx`

**Files:**
- Create: `tests/hooks/useGame.test.tsx`
- Reference: `src/hooks/useGame.ts`
- Reference: `src/contexts/GameContext.tsx` (for `GameProvider`, `GameContextValue`)
- Reference: `tests/ui/helpers/renderWithGame.tsx` (for `createMockService`)

**Background:** `useGame` calls `useContext(GameContext)` and throws `'useGame must be used within a GameProvider'` when the context is `null`. `renderHook` re-throws synchronous hook errors directly to the caller — no error boundary is involved, so no `console.error` mocking is needed.

- [ ] **Step 1: Write the test file**

```tsx
import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { useGame } from '../../src/hooks/useGame';
import { GameProvider } from '../../src/contexts/GameContext';
import { createMockService } from '../ui/helpers/renderWithGame';

describe('useGame', () => {
  it('throws when used outside GameProvider', () => {
    expect(() => renderHook(() => useGame())).toThrow(
      'useGame must be used within a GameProvider',
    );
  });

  it('returns context value when used inside GameProvider', () => {
    const service = createMockService();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GameProvider service={service} mode="debug">
        {children}
      </GameProvider>
    );
    const { result } = renderHook(() => useGame(), { wrapper });
    expect(result.current.mode).toBe('debug');
    expect(result.current.service).toBe(service);
  });
});
```

- [ ] **Step 2: Run the test and confirm it passes**

```bash
npx jest tests/hooks/useGame.test.tsx --selectProjects ui
```

Expected: 2 tests pass, 0 fail.

- [ ] **Step 3: Commit**

```bash
git add tests/hooks/useGame.test.tsx
git commit -m "test(hooks): add unit tests for useGame"
```

---

## Task 3: Update `tests/README.md`

**Files:**
- Modify: `tests/README.md`

4 箇所を編集する。

- [ ] **Step 1: ディレクトリツリー内の BLE 行を更新**

`tests/README.md` のディレクトリ構成ブロック内：

```
# Before
├── ble/                 # BLEテスト（11ファイル）
# After
├── ble/                 # BLEテスト（12ファイル）
```

- [ ] **Step 2: Hooks Unit テスト セクションを更新**

```markdown
<!-- Before -->
### 4. Hooks Unit テスト（1ファイル）
...
| `tests/hooks/useActionTimer.test.tsx` | アクションタイマーフック（タイムアウト・リセット・無効化） |

<!-- After -->
### 4. Hooks Unit テスト（2ファイル）
...
| `tests/hooks/useActionTimer.test.tsx` | アクションタイマーフック（タイムアウト・リセット・無効化） |
| `tests/hooks/useGame.test.tsx` | useGame フック（コンテキスト外エラー・正常系） |
```

- [ ] **Step 3: BLE Unit テスト セクションを更新**

```markdown
<!-- Before -->
### 5. BLE Unit テスト（11ファイル）
...
| `tests/ble/BleClientTransportImpl.test.ts` | BLEクライアントトランスポート実装 |

<!-- After -->
### 5. BLE Unit テスト（12ファイル）
...
| `tests/ble/BleClientTransportImpl.test.ts` | BLEクライアントトランスポート実装 |
| `tests/ble/transportRegistry.test.ts` | トランスポートレジストリ（set/get/clear） |
```

- [ ] **Step 4: テスト数サマリーを更新**

```markdown
<!-- Before -->
| Hooks | Unit | 1 |
| BLE | Unit | 11 |
| **合計** | — | **58** |

<!-- After -->
| Hooks | Unit | 2 |
| BLE | Unit | 12 |
| **合計** | — | **60** |
```

- [ ] **Step 5: README の変更を確認してからコミット**

```bash
# 変更内容を確認
git diff tests/README.md

git add tests/README.md
git commit -m "docs(tests): update README for useGame and transportRegistry tests"
```

---

## Task 4: 最終確認

- [ ] **Step 1: 全テストを実行**

```bash
npm test
```

Expected: 既存テスト含め全テストがパスする。`A worker process has failed to exit gracefully` 警告はマルチプロジェクト構成に起因する既知の問題で無視してよい（`tests/README.md` の「既知の警告」セクション参照）。

- [ ] **Step 2: 新規テストファイルのみ再確認**

```bash
npx jest tests/hooks/useGame.test.tsx tests/ble/transportRegistry.test.ts
```

Expected: 9 tests pass（useGame: 2、transportRegistry: 7）。
