---
title: Missing Unit Tests — useGame & transportRegistry
date: 2026-03-24
status: approved
---

# Missing Unit Tests — useGame & transportRegistry

## 背景

`docs/features.md` に実装済み（✅）として記載されているが、`tests/README.md` に対応するテストファイルが存在しないモジュールが 2 件確認された。

| モジュール | ファイル |
|---|---|
| `useGame` フック | `src/hooks/useGame.ts` |
| `transportRegistry` | `src/services/ble/transportRegistry.ts` |

`GameContext.test.tsx` は `useGame` を間接的に使用しているが、フック単体のテスト（特にコンテキスト外エラー）は未検証。`transportRegistry` はテストファイルが存在しない。

---

## 追加するファイル

### 1. `tests/hooks/useGame.test.tsx`

**Jest プロジェクト:** `ui`（`tests/hooks/` は jest.config.js の `ui` roots に含まれる）

**テストケース:**

| # | describe / it | 内容 |
|---|---|---|
| 1 | 異常系 | `GameProvider` 外で `renderHook(() => useGame())` を呼んだとき `'useGame must be used within a GameProvider'` を throw する |
| 2 | 正常系 | `GameProvider` を wrapper として渡したとき、コンテキスト値（`mode`, `service`）を返す |

**実装方針:**

- **異常系のアサーション:** `renderHook` はフックが throw した場合にその例外を呼び出し元に再スローするため、`expect(() => renderHook(() => useGame())).toThrow('useGame must be used within a GameProvider')` で検証する。`console.error` のモックは不要（`renderHook` は error boundary を経由しない）。

- **正常系のセットアップ:**
  - `GameProvider`（`src/contexts/GameContext`）と `createMockService`（`tests/ui/helpers/renderWithGame.tsx`）をインポートする
  - `wrapper` として `GameProvider` に最低限必要な props（`service` と `mode="debug"`）を渡す
  - `repository` は省略可能（`GameProvider` の optional prop）であり、`usePersistence` の追加モックは不要
  - `result.current.mode === 'debug'` および `result.current.service === service` を検証する

---

### 2. `tests/ble/transportRegistry.test.ts`

**Jest プロジェクト:** `engine`（`tests/ble/` は jest.config.js の `engine` roots に含まれる）

**テストケース:**

| # | describe / it | 内容 |
|---|---|---|
| 1 | host / 初期値 | `getHostTransport()` は `null` を返す |
| 2 | host / set & get | `setHostTransport(t)` 後に `getHostTransport()` が同一オブジェクトを返す |
| 3 | host / clear | `clearHostTransport()` 後に `getHostTransport()` が `null` を返す |
| 4 | client / 初期値 | `getClientTransport()` は `null` を返す |
| 5 | client / set & get | `setClientTransport(t)` 後に `getClientTransport()` が同一オブジェクトを返す |
| 6 | client / clear | `clearClientTransport()` 後に `getClientTransport()` が `null` を返す |
| 7 | 独立性 | ホストをクリアしてもクライアントの値が保持される |

**実装方針:**

- `transportRegistry.ts` はモジュールレベルの変数で状態を保持するため、`afterEach` で `clearHostTransport` / `clearClientTransport` を呼んでテスト間（このファイル内）の状態を初期化する。Jest のモジュールキャッシュにより状態は同一ワーカー内で保持されるが、このファイル内のテストは `afterEach` クリーンアップで十分に分離される。`jest.resetModules()` や `jest.isolateModules()` は不要。
- モックは `{} as BleHostTransport` / `{} as BleClientTransport` のキャストを使用（実装詳細は不要）

---

### 3. `tests/README.md` 更新（4箇所）

| 箇所 | 変更内容 |
|---|---|
| ディレクトリ構成のツリー内 `ble/` の行 | `# BLEテスト（11ファイル）` → `# BLEテスト（12ファイル）` |
| Hooks Unit テスト セクション | ファイル数 1 → 2、`useGame.test.tsx` のエントリ追加 |
| BLE Unit テスト セクション | ファイル数 11 → 12、`transportRegistry.test.ts` のエントリ追加 |
| テスト数サマリー | Hooks 1→2、BLE 11→12、合計 58→60 |

---

## 変更しないファイル

- `tests/ui/contexts/GameContext.test.tsx` — `useGame` を正常系で利用しているが、コンテキストのテストとして適切。変更不要。
- その他すべての既存テストファイル

---

## 検証方法

```bash
# useGame のみ
npx jest tests/hooks/useGame.test.tsx

# transportRegistry のみ
npx jest tests/ble/transportRegistry.test.ts

# hooks プロジェクト全体
npx jest tests/hooks/

# 全テスト
npm test
```
