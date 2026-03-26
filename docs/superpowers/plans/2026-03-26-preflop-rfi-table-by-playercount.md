# Preflop RFI Table by Player Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `preflopStrategy.ts` の二重補正バグを修正し、プレイヤー数別 RFI しきい値テーブルに置き換える。

**Architecture:** 既存の `OPEN_THRESHOLD`（旧・9人固定）を `OPEN_THRESHOLD_BY_COUNT`（人数 → ポジション → グループしきい値）に置き換え、`decideRFI` 内のマルチウェイ補正ロジックを削除する。関数シグネチャは変更しない。

**Tech Stack:** TypeScript, Jest (npm test)

---

## File Map

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `src/bot/strategy/preflopStrategy.ts` | Modify | `OPEN_THRESHOLD` → `OPEN_THRESHOLD_BY_COUNT`、マルチウェイ補正削除 |
| `tests/bot/preflopStrategy.test.ts` | Modify | 古いバグ前提テストを更新、回帰テスト追加 |

---

## ハンド参照（テスト設計用）

| ハンド | カード | 計算 | group | tier | 特記 |
|---|---|---|---|---|---|
| QJs | Qh Jh | MATRIX[min(2,3)][max(2,3)] = MATRIX[2][3] = 31 | 3 | 1 | 常に raise |
| A9o | Ah 9d | MATRIX[max(0,5)][min(0,5)] = MATRIX[5][0] = 33 | 3 | 3 | 62% raise |
| A8o | Ah 8d | MATRIX[max(0,6)][min(0,6)] = MATRIX[6][0] = 51 | 5 | 1 | 常に raise |
| QJo | Qh Jd | MATRIX[max(2,3)][min(2,3)] = MATRIX[3][2] = 51 | 5 | 1 | 常に raise |
| JTo | Jh Td | MATRIX[max(3,4)][min(3,4)] = MATRIX[4][3] = 62 | 6 | 2 | 87% raise |
| J8s | Jh 8h | MATRIX[min(3,6)][max(3,6)] = MATRIX[3][6] = 62 | 6 | 2 | 87% raise |

---

## Task 1: テストを更新・追加（失敗するテストを先に書く）

**Files:**
- Modify: `tests/bot/preflopStrategy.test.ts:62-75`

### 背景

既存のテスト「6人卓 BTN JTo → fold（マルチウェイ補正でレンジ絞り）」は**バグの動作を正としてテストしている**。これを修正後の正しい動作（BTN JTo が RFI できる）に書き直す。さらに報告されたバグの回帰テストを追加する。

- [ ] **Step 1: 既存のバグ前提テストを削除し、正しい期待値のテストに置き換える**

`tests/bot/preflopStrategy.test.ts` の 62〜75 行を以下に**置き換える**（`describe('decidePreflopAction — RFI', ...)` ブロック内の最後のテスト）：

```typescript
  it('6人卓 BTN JTo → RFI 可能（group 6 ≤ threshold 6）', () => {
    // numActive=6, OPEN_THRESHOLD_BY_COUNT[6].BTN=6 → effectiveThreshold=6
    // JTo = MATRIX[4][3]=62 → group 6 ≤ 6 → raise (freqTier=2, 87%)
    const players: Player[] = [
      { seat: 0, name: 'BTN', chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'SB',  chips: 990, status: 'active', bet: 5,  cards: [] },
      { seat: 2, name: 'BB',  chips: 990, status: 'active', bet: 10, cards: [] },
      { seat: 3, name: 'UTG', chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 4, name: 'HJ',  chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 5, name: 'CO',  chips: 990, status: 'active', bet: 0,  cards: [] },
    ];
    const state = makeState({ players, dealer: 0, currentBet: 10, activePlayer: 0 });
    // 500回試行して大半が raise になることを確認（freqTier=2 → 87%）
    let raises = 0;
    for (let i = 0; i < 500; i++) {
      const r = decidePreflopAction(state, ['Jh', 'Td'], 0);
      if (r.action === 'raise' || r.action === 'allIn') raises++;
    }
    expect(raises / 500).toBeGreaterThan(0.70); // 87% ± 許容
  });
```

- [ ] **Step 2: 9人テーブルでの回帰テストを追加する**

`describe('decidePreflopAction — RFI', ...)` ブロック内（Step 1 のテストの直後）に追加：

```typescript
  it('9人卓 HJ QJs → RFI（group 3 ≤ threshold 4）', () => {
    // OPEN_THRESHOLD_BY_COUNT[9].HJ=4, QJs=group3,tier1 → 100% raise
    const players: Player[] = [
      { seat: 0, name: 'BTN',   chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'SB',    chips: 990, status: 'active', bet: 5,  cards: [] },
      { seat: 2, name: 'BB',    chips: 990, status: 'active', bet: 10, cards: [] },
      { seat: 3, name: 'UTG',   chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 4, name: 'UTG+1', chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 5, name: 'UTG+2', chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 6, name: 'LJ',    chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 7, name: 'HJ',    chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 8, name: 'CO',    chips: 990, status: 'active', bet: 0,  cards: [] },
    ];
    // dealer=8=CO → BTN=seat0, SB=seat1, BB=seat2, UTG=seat3, ..., HJ=seat7
    const state = makeState({ players, dealer: 8, currentBet: 10, activePlayer: 7 });
    const result = decidePreflopAction(state, ['Qh', 'Jh'], 7);
    expect(['raise', 'allIn']).toContain(result.action);
  });

  it('9人卓 BTN A8o → RFI（group 5 ≤ threshold 6）', () => {
    // OPEN_THRESHOLD_BY_COUNT[9].BTN=6, A8o=group5,tier1 → 100% raise
    const players: Player[] = [
      { seat: 0, name: 'BTN',   chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'SB',    chips: 990, status: 'active', bet: 5,  cards: [] },
      { seat: 2, name: 'BB',    chips: 990, status: 'active', bet: 10, cards: [] },
      { seat: 3, name: 'UTG',   chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 4, name: 'UTG+1', chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 5, name: 'UTG+2', chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 6, name: 'LJ',    chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 7, name: 'HJ',    chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 8, name: 'CO',    chips: 990, status: 'active', bet: 0,  cards: [] },
    ];
    // dealer=8=CO → BTN=seat0
    const state = makeState({ players, dealer: 8, currentBet: 10, activePlayer: 0 });
    const result = decidePreflopAction(state, ['Ah', '8d'], 0);
    expect(['raise', 'allIn']).toContain(result.action);
  });

  it('4人卓 UTG QJo → RFI（group 5 ≤ threshold 5）', () => {
    // OPEN_THRESHOLD_BY_COUNT[4].UTG=5, QJo=group5,tier1 → 100% raise
    const players: Player[] = [
      { seat: 0, name: 'BTN', chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'SB',  chips: 990, status: 'active', bet: 5,  cards: [] },
      { seat: 2, name: 'BB',  chips: 990, status: 'active', bet: 10, cards: [] },
      { seat: 3, name: 'UTG', chips: 990, status: 'active', bet: 0,  cards: [] },
    ];
    // dealer=0=BTN → UTG=seat3
    const state = makeState({ players, dealer: 0, currentBet: 10, activePlayer: 3 });
    const result = decidePreflopAction(state, ['Qh', 'Jd'], 3);
    expect(['raise', 'allIn']).toContain(result.action);
  });

  it('2人卓 BTN J8s → RFI（group 6 ≤ threshold 7）', () => {
    // OPEN_THRESHOLD_BY_COUNT[2].BTN=7, J8s=group6,tier2 → 87% raise
    const state = makeState({ currentBet: 10, activePlayer: 0 });
    let raises = 0;
    for (let i = 0; i < 500; i++) {
      const r = decidePreflopAction(state, ['Jh', '8h'], 0);
      if (r.action === 'raise' || r.action === 'allIn') raises++;
    }
    expect(raises / 500).toBeGreaterThan(0.70); // 87% ± 許容
  });
```

- [ ] **Step 3: テストを実行して失敗を確認する**

```bash
cd /home/ub180822/00_hobby/jet-holdem2
npx jest tests/bot/preflopStrategy.test.ts --no-coverage 2>&1 | tail -30
```

期待される結果: `6人卓 BTN JTo → RFI 可能`、`9人卓 HJ QJs`、`9人卓 BTN A8o`、`4人卓 UTG QJo`、`2人卓 BTN J8s` が **FAIL** すること（現在のコードはマルチウェイ補正で全てフォールドしてしまう）

---

## Task 2: 実装（`preflopStrategy.ts` を修正する）

**Files:**
- Modify: `src/bot/strategy/preflopStrategy.ts:8-12` (OPEN_THRESHOLD 削除)
- Modify: `src/bot/strategy/preflopStrategy.ts:89-108` (decideRFI 内の補正ロジック)

- [ ] **Step 1: `OPEN_THRESHOLD` を `OPEN_THRESHOLD_BY_COUNT` に置き換える**

`src/bot/strategy/preflopStrategy.ts` の 8〜12 行（`OPEN_THRESHOLD` の定義）を以下に**置き換える**：

```typescript
const OPEN_THRESHOLD_BY_COUNT: Record<number, Partial<Record<string, number>>> = {
  2: { BTN: 7, BB: 1 },
  3: { BTN: 7, SB: 7, BB: 1 },
  4: { BTN: 7, SB: 7, BB: 1, UTG: 5 },
  5: { BTN: 7, SB: 7, BB: 1, UTG: 4, CO: 6 },
  6: { BTN: 6, SB: 7, BB: 1, UTG: 3, HJ: 5, CO: 6 },
  7: { BTN: 6, SB: 7, BB: 1, UTG: 3, LJ: 4, HJ: 5, CO: 5 },
  8: { BTN: 6, SB: 7, BB: 1, UTG: 3, 'UTG+1': 3, LJ: 4, HJ: 4, CO: 5 },
  9: { BTN: 6, SB: 7, BB: 1, UTG: 2, 'UTG+1': 3, 'UTG+2': 3, LJ: 4, HJ: 4, CO: 5 },
};
```

- [ ] **Step 2: `decideRFI` のマルチウェイ補正ロジックを削除し、新テーブルを使うよう変更する**

`decideRFI` 関数内（通常スタックの手前）の以下のコードを**置き換える**：

変更前（93〜96行目）:
```typescript
  // マルチウェイ補正: 参加者数が増えるほどレンジを絞る
  const penaltyGroups = Math.max(0, numActive - 3);
  const threshold = OPEN_THRESHOLD[position] ?? 2;
  const effectiveThreshold = Math.max(1, threshold - penaltyGroups);
```

変更後:
```typescript
  const thresholdTable = OPEN_THRESHOLD_BY_COUNT[numActive] ?? OPEN_THRESHOLD_BY_COUNT[9]!;
  const effectiveThreshold = thresholdTable[position] ?? 2;
```

- [ ] **Step 3: テストを実行してすべてパスすることを確認する**

```bash
cd /home/ub180822/00_hobby/jet-holdem2
npx jest tests/bot/preflopStrategy.test.ts --no-coverage 2>&1 | tail -20
```

期待される結果: すべてのテストが **PASS**

- [ ] **Step 4: 全テストを実行して既存テストが壊れていないことを確認する**

```bash
cd /home/ub180822/00_hobby/jet-holdem2
npm test -- --no-coverage 2>&1 | tail -20
```

期待される結果: 全テスト PASS

- [ ] **Step 5: コミットする**

```bash
cd /home/ub180822/00_hobby/jet-holdem2
git add src/bot/strategy/preflopStrategy.ts tests/bot/preflopStrategy.test.ts
git commit -m "$(cat <<'EOF'
fix(bot): replace multiway penalty with per-player-count RFI threshold table

OPEN_THRESHOLD was designed for 9-player full ring, but an additional
multiway penalty (numActive - 3) was applied on top, causing effectiveThreshold
to collapse to 1 for all positions in 9-player games. This made the bot fold
hands like A8o on BTN or QJs on HJ.

Replace with OPEN_THRESHOLD_BY_COUNT keyed by numActive, and remove the
penalty calculation entirely.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## 自己レビュー

**スペック対照:**
- ✅ `OPEN_THRESHOLD_BY_COUNT` 定義（2〜9人分）
- ✅ マルチウェイ補正ロジック削除
- ✅ HJ A9o 回帰テスト（QJs tier1 で代替、より決定論的）
- ✅ BTN A8o 回帰テスト
- ✅ 少人数テーブル（4人UTG、2人BTN）テスト
- ✅ 既存テストの更新（バグ前提テストの書き直し）

**型・関数名の一貫性:**
- `OPEN_THRESHOLD_BY_COUNT` は Task 2 Step 1 で定義、Task 2 Step 2 で参照 ✅
- `decideRFI` のシグネチャ変更なし（`numActive` は引き続き使用）✅
