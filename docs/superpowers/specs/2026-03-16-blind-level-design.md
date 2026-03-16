# Blind Level Structure (Time-Based Blind Increases) Design

**Date:** 2026-03-16
**Branch:** (未作成)
**Depends on:** Main Design (Doc 0, Section 3), BLE Game Play (Doc 3), UI Design (Doc 2)

## Overview

トーナメントスタイルのブラインドレベル構造を実装する。時間経過に応じてブラインドが段階的に増加し、ゲームに自然な収束（終了圧力）をもたらす。ホストがタイマーを管理し、BLEクライアントには現在のレベル情報を同期する。

### 現状

- ブラインドはゲーム開始時に固定値（デフォルト SB=5, BB=10）
- ゲーム中にブラインドが変化しない
- メインデザインドキュメント Section 3 に「将来的にブラインドレベル構造（時間経過で増加）を追加可能」と記載済み

### 設計原則

1. **レベル変更はラウンド間のみ:** ハンド途中でブラインドが変わることはない（公平性のため）
2. **ホストが単一のタイマー管理者:** BLE環境ではホストのみがタイマーを保持し、クライアントは表示用の残り時間を受信する
3. **オプトイン機能:** ブラインドレベルはデフォルトOFF。ロビーUIでトグルして有効化する
4. **既存インターフェースへの最小限の変更:** `GameService` インターフェースは拡張のみ、既存メソッドのシグネチャは変更しない

---

## 1. ブラインドレベルスケジュール定義

### 型定義

```typescript
// src/gameEngine/types.ts に追加

export interface BlindLevel {
  level: number;       // 1-indexed level number
  sb: number;
  bb: number;
  ante?: number;       // 将来拡張用（Phase 1では未使用）
}

export interface BlindSchedule {
  levels: BlindLevel[];
  levelDurationMs: number;  // 各レベルの持続時間（ミリ秒）
}

export interface BlindLevelState {
  currentLevel: number;       // 現在のレベル（1-indexed）
  sb: number;
  bb: number;
  remainingMs: number;        // 現在のレベルの残り時間（ミリ秒）
  nextSb: number | null;      // 次のレベルのSB（最終レベルならnull）
  nextBb: number | null;      // 次のレベルのBB（最終レベルならnull）
}
```

### デフォルトスケジュール

```typescript
// src/gameEngine/BlindSchedule.ts (新規ファイル)

export const DEFAULT_BLIND_LEVELS: BlindLevel[] = [
  { level: 1,  sb: 5,    bb: 10 },
  { level: 2,  sb: 10,   bb: 20 },
  { level: 3,  sb: 15,   bb: 30 },
  { level: 4,  sb: 25,   bb: 50 },
  { level: 5,  sb: 50,   bb: 100 },
  { level: 6,  sb: 75,   bb: 150 },
  { level: 7,  sb: 100,  bb: 200 },
  { level: 8,  sb: 150,  bb: 300 },
  { level: 9,  sb: 200,  bb: 400 },
  { level: 10, sb: 300,  bb: 600 },
  { level: 11, sb: 500,  bb: 1000 },
];

export const LEVEL_DURATION_OPTIONS_MS = [
  3 * 60 * 1000,   //  3分
  5 * 60 * 1000,   //  5分
  10 * 60 * 1000,  // 10分
  15 * 60 * 1000,  // 15分
];

export const DEFAULT_LEVEL_DURATION_MS = 5 * 60 * 1000; // 5分
```

### 最終レベルの扱い

最終レベル（level 11）に到達した場合、ブラインドはそのまま固定される。タイマーは停止し、レベルアップは発生しない。ゲームは通常通り続行する。

---

## 2. BlindLevelManager

### クラス設計

```typescript
// src/gameEngine/BlindLevelManager.ts (新規ファイル)

export class BlindLevelManager {
  private schedule: BlindSchedule;
  private currentLevelIndex: number = 0;
  private levelStartTime: number = 0;   // Date.now() at level start
  private pausedAt: number | null = null;
  private elapsedBeforePause: number = 0;

  constructor(schedule: BlindSchedule) { ... }

  /** ゲーム開始時・再戦時に呼び出し。タイマーをリセットしてレベル1から開始 */
  start(): void { ... }

  /** 現在のブラインド値を返す */
  getCurrentBlinds(): Blinds { ... }

  /** 現在のレベル状態（UI表示用）を返す */
  getState(): BlindLevelState { ... }

  /**
   * レベルアップ判定。ラウンド間（roundEnd → 次のstartRound前）に呼び出す。
   * 経過時間が levelDurationMs を超えていたら次のレベルに進める。
   * 複数レベル分の時間が経過していた場合、該当レベルまで一気にスキップする。
   * @returns レベルが変更された場合 true
   */
  checkAndAdvance(): boolean { ... }

  /** ゲーム一時停止（切断時など） */
  pause(): void { ... }

  /** ゲーム再開 */
  resume(): void { ... }

  /** 現在が最終レベルかどうか */
  isMaxLevel(): boolean { ... }
}
```

### タイマー管理の詳細

タイマーは `Date.now()` ベースの経過時間計算で管理する。`setInterval` は使用しない。

```
経過時間 = (pausedAt ?? Date.now()) - levelStartTime - elapsedBeforePause ではなく
経過時間 = pausedAt !== null
           ? pausedAt - levelStartTime
           : Date.now() - levelStartTime
残り時間 = levelDurationMs - 経過時間
```

**ポーズ/リジューム:**
- `pause()`: `pausedAt = Date.now()` を記録
- `resume()`: `levelStartTime += (Date.now() - pausedAt)` でスタート時刻をずらし、`pausedAt = null`

**レベルスキップ:**
- 1ハンドが非常に長い場合（例: 10分のハンド中にレベルが2回分進むケース）、`checkAndAdvance()` は複数レベルを一度にスキップする
- 計算: `levelsToAdvance = Math.floor(elapsed / levelDurationMs)`、ただし最終レベルを超えない

---

## 3. GameLoop の変更

### コンストラクタ拡張

```typescript
export class GameLoop {
  private _blinds: Blinds;
  private blindLevelManager: BlindLevelManager | null;  // null = 固定ブラインド

  constructor(
    players: Player[],
    blinds: Blinds,
    dealer = 0,
    blindSchedule?: BlindSchedule,  // 新規オプション引数
  ) {
    this._blinds = blinds;
    this.blindLevelManager = blindSchedule
      ? new BlindLevelManager(blindSchedule)
      : null;
    // ...
  }
```

### startRound() の変更

`startRound()` の冒頭で、`BlindLevelManager` が存在する場合はレベルアップ判定を行い、ブラインド値を更新する。

```typescript
startRound(): void {
  // --- 新規: ブラインドレベルチェック ---
  if (this.blindLevelManager) {
    this.blindLevelManager.checkAndAdvance();
    this._blinds = this.blindLevelManager.getCurrentBlinds();
  }
  // --- 既存コード ---
  this.deck.reset();
  // ...
  this.bettingRound = BettingRound.createPreflop(this._players, this._dealer, this._blinds);
}
```

### 初回ラウンド開始

`BlindLevelManager.start()` は `GameLoop` のコンストラクタ内、または最初の `startRound()` 呼び出し時にトリガーする。コンストラクタ内で呼ぶ方がシンプル（`startGame()` と `startRound()` の間にタイムラグがあるとレベルアップ判定がずれるため）。

```typescript
constructor(...) {
  // ...
  if (this.blindLevelManager) {
    this.blindLevelManager.start();
  }
}
```

### getState() の拡張

```typescript
// GameState に追加
export interface GameState {
  // ... 既存フィールド ...
  blindLevel?: BlindLevelState;  // undefined = 固定ブラインドモード
}
```

```typescript
getState(): GameState {
  return {
    // ... 既存 ...
    blindLevel: this.blindLevelManager?.getState(),
  };
}
```

### ゲッター追加

```typescript
/** BlindLevelManager へのアクセス（pause/resume用） */
get blindManager(): BlindLevelManager | null {
  return this.blindLevelManager;
}
```

---

## 4. GameService インターフェース変更

### startGame() の拡張

```typescript
// src/services/GameService.ts
export interface GameService {
  // ... 既存 ...
  startGame(
    playerNames: string[],
    blinds: Blinds,
    initialChips: number,
    savedChips?: Record<string, number>,
    blindSchedule?: BlindSchedule,  // 新規オプション引数
  ): void;
}
```

### LocalGameService の変更

```typescript
startGame(
  playerNames: string[],
  blinds: Blinds,
  initialChips: number,
  savedChips?: Record<string, number>,
  blindSchedule?: BlindSchedule,
): void {
  const players: Player[] = playerNames.map((name, i) => ({
    seat: i,
    name,
    chips: savedChips?.[name] ?? initialChips,
    status: 'active' as PlayerStatus,
    bet: 0,
    cards: [],
  }));
  this.gameLoop = new GameLoop(players, blinds, 0, blindSchedule);
  this.notify();
}
```

### BleHostGameService の変更

```typescript
private blindSchedule?: BlindSchedule;

startGame(
  playerNames: string[],
  blinds: Blinds,
  initialChips: number,
  _savedChips?: Record<string, number>,
  blindSchedule?: BlindSchedule,
): void {
  const isRematch = this.gameLoop !== null;
  this.blindSchedule = blindSchedule;
  // ...
  this.gameLoop = new GameLoop(players, blinds, 0, blindSchedule);
  // ...
}
```

---

## 5. BLE プロトコル同期

### 方針: stateUpdate メッセージに blindLevel を追加

独立したメッセージではなく、既存の `stateUpdate` メッセージに `blindLevel` フィールドを追加する。

**理由:**
- ブラインドレベル情報はゲーム状態の一部であり、stateUpdateと同じタイミングで送信するのが自然
- 別メッセージにすると順序保証や同期の複雑さが増す
- stateUpdate はラウンド間にも送信されるため、レベル変更通知として十分

### GameProtocol.ts の変更

```typescript
// GameHostMessage の stateUpdate に追加
| {
    type: 'stateUpdate';
    // ... 既存フィールド ...
    blindLevel?: {
      currentLevel: number;
      sb: number;
      bb: number;
      remainingMs: number;
      nextSb: number | null;
      nextBb: number | null;
    };
  }
```

### バリデーション追加

```typescript
// validateStateUpdate() 内に追加
if (data.blindLevel !== undefined) {
  if (!isObject(data.blindLevel)) return null;
  const bl = data.blindLevel;
  if (typeof bl.currentLevel !== 'number') return null;
  if (typeof bl.sb !== 'number') return null;
  if (typeof bl.bb !== 'number') return null;
  if (typeof bl.remainingMs !== 'number') return null;
  if (bl.nextSb !== null && typeof bl.nextSb !== 'number') return null;
  if (bl.nextBb !== null && typeof bl.nextBb !== 'number') return null;
  msg.blindLevel = {
    currentLevel: bl.currentLevel as number,
    sb: bl.sb as number,
    bb: bl.bb as number,
    remainingMs: bl.remainingMs as number,
    nextSb: (bl.nextSb ?? null) as number | null,
    nextBb: (bl.nextBb ?? null) as number | null,
  };
}
```

### BleHostGameService.broadcastState() の変更

```typescript
private broadcastState(): void {
  if (!this.gameLoop) return;
  const state = this.gameLoop.getState();

  const msg: GameHostMessage = {
    type: 'stateUpdate',
    // ... 既存フィールド ...
    blinds: state.blinds,
    // 新規: blindLevel
    ...(state.blindLevel ? { blindLevel: state.blindLevel } : {}),
    // ...
  };
  // ...
}
```

### 残り時間の精度

`remainingMs` はホストが `broadcastState()` を呼んだ瞬間の値。BLEの通信遅延（数十ms〜数百ms）は許容範囲内とする。クライアント側では受信した `remainingMs` から `Date.now()` ベースでローカルにカウントダウン表示を行い、次の stateUpdate で再同期する。

### BleClientGameService の変更

`stateUpdate` ハンドラで `blindLevel` フィールドを `GameState` にパススルーする（既存のフィールドマッピングに追加するだけ）。

---

## 6. UI表示

### BlindLevelIndicator コンポーネント（新規）

ゲーム画面のテーブル上部に表示するコンパクトなインジケーター。

```
// src/components/table/BlindLevelIndicator.tsx (新規ファイル)
```

### レイアウト

```
┌─────────────────────────────┐
│  Lv.3  25/50  ⏱ 3:42       │  ← テーブル上部
│  Next: 50/100               │
└─────────────────────────────┘
```

- 1行目: 現在のレベル番号、SB/BB、残り時間
- 2行目: 次のレベルのSB/BB（最終レベルでは非表示）
- 残り時間はカウントダウン表示（mm:ss形式）

### スタイル

| 要素 | スタイル |
|---|---|
| レベル番号 | `Colors.active` (#06B6D4), fontWeight: 'bold', fontSize: 12 |
| SB/BB | `Colors.text` (#FFFFFF), fontSize: 14, fontWeight: 'bold' |
| 残り時間 | `Colors.pot` (#10B981), fontSize: 12. 残り30秒以下で `Colors.call` (#EF4444) に変更 |
| Next: | `Colors.subText` (#9CA3AF), fontSize: 10 |
| 背景 | `Colors.table` (#16213E), borderRadius: 8, padding: 4 8 |

### 表示条件

- `state.blindLevel` が存在する場合のみ表示
- 固定ブラインドモード（`blindLevel` が `undefined`）では非表示

### カウントダウンの実装

クライアント側では `stateUpdate` 受信時の `remainingMs` を起点に、`useEffect` + `setInterval(1000)` でローカルにカウントダウンを表示する。次の `stateUpdate` で `remainingMs` が再同期される。

```typescript
// BlindLevelIndicator 内
const [displayMs, setDisplayMs] = useState(blindLevel.remainingMs);
const baseRef = useRef({ remainingMs: blindLevel.remainingMs, receivedAt: Date.now() });

useEffect(() => {
  baseRef.current = { remainingMs: blindLevel.remainingMs, receivedAt: Date.now() };
  setDisplayMs(blindLevel.remainingMs);
}, [blindLevel.remainingMs, blindLevel.currentLevel]);

useEffect(() => {
  const timer = setInterval(() => {
    const elapsed = Date.now() - baseRef.current.receivedAt;
    const remaining = Math.max(0, baseRef.current.remainingMs - elapsed);
    setDisplayMs(remaining);
  }, 1000);
  return () => clearInterval(timer);
}, []);
```

### GameScreen への配置

```typescript
// app/game.tsx の TableLayout 内
<View style={styles.table}>
  <BlindLevelIndicator />     {/* 新規: テーブル上部 */}
  <View style={styles.topRow}>
    {/* ... 既存 ... */}
```

`BlindLevelIndicator` は `useGame()` から `state.blindLevel` を取得する。

---

## 7. ロビーUI設定

### ローカルモード (LobbyView.tsx)

既存のSB/BB入力の下にブラインドレベル設定セクションを追加。

```
── SB / BB ──
[5]  [10]                     ← 既存（ブラインドレベルON時は初期レベルとして使用）

── ブラインドレベル ──          ← 新規セクション
[OFF]  [ON]                   ← トグルスイッチ

レベル間隔                     ← ON時のみ表示
○ 3分  ○ 5分  ● 10分  ○ 15分
```

### 状態管理

```typescript
// LobbyView.tsx に追加
const [blindLevelEnabled, setBlindLevelEnabled] = useState(false);
const [levelDurationMs, setLevelDurationMs] = useState(DEFAULT_LEVEL_DURATION_MS);
```

### handleStart() の変更

```typescript
const handleStart = async () => {
  // ... 既存 ...
  router.push({
    pathname: '/game',
    params: {
      // ... 既存 ...
      blindLevelEnabled: blindLevelEnabled ? 'true' : 'false',
      levelDurationMs: String(levelDurationMs),
    },
  });
};
```

### SB/BB入力との関係

- **ブラインドレベルOFF:** 従来通り、SB/BB入力値が固定ブラインドとして使用される
- **ブラインドレベルON:** SB/BB入力は非表示にする。初期ブラインドは `DEFAULT_BLIND_LEVELS[0]`（SB=5, BB=10）が自動適用される
- これにより、ユーザーがブラインドレベルON時に手動でSB/BB値を入力しても無視されるという混乱を防ぐ

### BLEホストモード (HostSetupForm.tsx)

HostSetupForm にも同様のトグルとレベル間隔選択を追加。

```typescript
type HostSetupFormProps = {
  onSubmit: (settings: {
    hostName: string;
    sb: string;
    bb: string;
    initialChips: string;
    blindLevelEnabled: boolean;      // 新規
    levelDurationMs: number;         // 新規
  }) => void;
};
```

### app/game.tsx の変更

`GameScreen` コンポーネントで `blindSchedule` を組み立てて `startGame()` に渡す。

```typescript
const blindSchedule: BlindSchedule | undefined = React.useMemo(() => {
  if (params.blindLevelEnabled !== 'true') return undefined;
  return {
    levels: DEFAULT_BLIND_LEVELS,
    levelDurationMs: Number(params.levelDurationMs ?? DEFAULT_LEVEL_DURATION_MS),
  };
}, [params.blindLevelEnabled, params.levelDurationMs]);

// service 初期化時
svc.startGame(playerNames, blinds, initialChips, playerChipsMap, blindSchedule);
```

### GameContext の変更

`GameProvider` に `blindSchedule` を追加し、rematch 時にも同じスケジュールを適用する。

```typescript
interface GameProviderProps {
  // ... 既存 ...
  blindSchedule?: BlindSchedule;  // 新規
}
```

```typescript
const rematch = useCallback(() => {
  // ...
  serviceRef.current.startGame(names, bl, chips, undefined, blindScheduleRef.current);
  serviceRef.current.startRound();
  setShowdownResult(null);
}, []);
```

### 設定の永続化

`repository.saveSettings()` / `repository.getSettings()` に `blindLevelEnabled` と `levelDurationMs` を追加。ロビー復帰時に前回の設定を復元する。

```typescript
// Settings 型に追加
interface Settings {
  // ... 既存 ...
  blindLevelEnabled?: boolean;
  levelDurationMs?: number;
}
```

---

## 8. レベル変更タイミングの詳細

### ライフサイクル

```
ラウンド N 終了 (roundEnd phase)
    │
    ▼
prepareNextRound()
    │
    ▼
startRound()
    │
    ├── BlindLevelManager.checkAndAdvance()
    │     ├── 時間経過してない → 現在のブラインド維持
    │     └── 時間経過した → レベルアップ → this._blinds 更新
    │
    ├── BettingRound.createPreflop(..., this._blinds)
    │     └── 更新後のブラインドで SB/BB 投稿
    │
    ▼
broadcastState() → stateUpdate に新しい blinds + blindLevel を含む
```

### ラウンド中のタイマー

- ラウンド中もタイマーは進行する（ポーズしない）
- しかし、レベルアップの適用は次の `startRound()` まで遅延される
- UI上のカウントダウンが 0:00 になっても、ハンドが終わるまで現在のブラインドが適用される
- 0:00 を過ぎた場合、UI表示は「Level Up!」に切り替え（次ラウンド開始を待機中であることを示す）

### 切断時のタイマーポーズ

- クライアント切断 → frozenSeats にセットされた時点で `BlindLevelManager.pause()` は呼ばない
- **判断:** ポーカートーナメントでは切断してもタイマーは止まらないのが一般的。公平性のため、タイマーは常に進行する
- ただし、全クライアントが切断した場合（ホストのみ残った）は例外的にポーズを検討 → **Phase 1ではスコープ外**

---

## 9. 既存ファイルへの変更一覧

| ファイル | 変更内容 |
|---|---|
| `src/gameEngine/types.ts` | `BlindLevel`, `BlindSchedule`, `BlindLevelState` 型追加。`GameState` に `blindLevel?` フィールド追加 |
| `src/gameEngine/GameLoop.ts` | コンストラクタに `blindSchedule?` 引数追加。`startRound()` 冒頭でレベルアップ判定。`getState()` に `blindLevel` 追加。`blindManager` ゲッター追加 |
| `src/services/GameService.ts` | `startGame()` に `blindSchedule?` 引数追加 |
| `src/services/LocalGameService.ts` | `startGame()` に `blindSchedule?` 引数追加、`GameLoop` コンストラクタに渡す |
| `src/services/ble/BleHostGameService.ts` | `startGame()` に `blindSchedule?` 引数追加。`broadcastState()` に `blindLevel` フィールド追加 |
| `src/services/ble/GameProtocol.ts` | `stateUpdate` の `GameHostMessage` に `blindLevel?` フィールド追加。`validateStateUpdate` にバリデーション追加 |
| `src/services/ble/BleClientGameService.ts` | `stateUpdate` ハンドラで `blindLevel` フィールドを `GameState` にパススルー |
| `src/contexts/GameContext.tsx` | `GameProviderProps` に `blindSchedule?` 追加。`rematch()` で `blindSchedule` を渡す |
| `app/game.tsx` | URL params から `blindSchedule` を組み立て。`GameProvider` に渡す |
| `src/components/lobby/LobbyView.tsx` | ブラインドレベルON/OFFトグル、レベル間隔選択ボタン追加 |
| `src/components/lobby/HostSetupForm.tsx` | ブラインドレベルON/OFFトグル、レベル間隔選択ボタン追加 |
| `src/theme/colors.ts` | 変更なし（既存の色を使用） |

### 新規ファイル

| ファイル | 内容 |
|---|---|
| `src/gameEngine/BlindSchedule.ts` | `DEFAULT_BLIND_LEVELS`, `LEVEL_DURATION_OPTIONS_MS` 定数 |
| `src/gameEngine/BlindLevelManager.ts` | `BlindLevelManager` クラス |
| `src/components/table/BlindLevelIndicator.tsx` | ブラインドレベル表示コンポーネント |

---

## 10. テスト方針

### BlindLevelManager 単体テスト（新規ファイル）

`tests/gameEngine/BlindLevelManager.test.ts`

| テストケース | 内容 |
|---|---|
| 初期状態 | `start()` 後にレベル1のブラインドが返る |
| レベルアップ | `levelDurationMs` 経過後に `checkAndAdvance()` でレベル2に進む |
| 複数レベルスキップ | `2 * levelDurationMs` 経過後に `checkAndAdvance()` でレベル3に進む |
| 最終レベル停止 | 最終レベルで `checkAndAdvance()` を呼んでもレベルが進まない |
| `getState()` | 残り時間・次レベル情報が正しい |
| 最終レベルの `getState()` | `nextSb`, `nextBb` が `null` |
| pause/resume | ポーズ中は経過時間が進まない。リジューム後に正常にカウント再開 |

**タイマーテスト:** `jest.useFakeTimers()` と `jest.advanceTimersByTime()` で `Date.now()` をモックする。

### GameLoop ブラインドレベル統合テスト

`tests/gameEngine/GameLoop.test.ts` に追加

| テストケース | 内容 |
|---|---|
| スケジュールなし | `blindSchedule` を渡さない場合、従来通り固定ブラインド |
| ラウンド間レベルアップ | タイマー経過後の `startRound()` で新しいブラインドが適用される |
| ラウンド中はブラインド不変 | タイマー経過してもラウンド中の `_blinds` は変わらない |
| `getState().blindLevel` | スケジュールありの場合に `BlindLevelState` が含まれる |
| `getState().blindLevel` なし | スケジュールなしの場合に `undefined` |

### BLEプロトコルテスト

`tests/ble/GameProtocol.test.ts` に追加

| テストケース | 内容 |
|---|---|
| `blindLevel` 付き stateUpdate | バリデーション通過 |
| `blindLevel` なし stateUpdate | 従来通りバリデーション通過（後方互換） |
| 不正な `blindLevel` | バリデーション失敗 |

### UIコンポーネントテスト（新規ファイル）

`tests/ui/components/BlindLevelIndicator.test.tsx`

| テストケース | 内容 |
|---|---|
| 表示 | `blindLevel` がある場合にレベル・ブラインド・残り時間が表示される |
| 非表示 | `blindLevel` が `undefined` の場合にコンポーネントが描画されない |
| 残り30秒以下 | 残り時間の色が赤に変わる |
| 最終レベル | 「Next:」行が非表示 |

### ロビーUIテスト

`tests/ui/components/LobbyView.test.tsx` に追加

| テストケース | 内容 |
|---|---|
| トグルOFF初期状態 | レベル間隔選択が非表示 |
| トグルON | レベル間隔選択が表示される |
| トグルON時SB/BB非表示 | SB/BB入力フィールドが非表示になる |
| レベル間隔選択 | 選択した値がパラメータに渡される |

---

## 11. スコープ

### Phase 1（今回のスコープ）

- `BlindLevelManager` クラス
- `DEFAULT_BLIND_LEVELS` 定数スケジュール
- `GameLoop` のブラインドレベル統合
- `GameService` / `LocalGameService` / `BleHostGameService` の `startGame()` 拡張
- BLEプロトコル `stateUpdate` への `blindLevel` フィールド追加
- `BlindLevelIndicator` UIコンポーネント
- ロビーUI（ローカル + BLEホスト）のトグルとレベル間隔設定
- 上記のテスト

### スコープ外（将来の拡張）

- アンティの追加（`BlindLevel.ante`）
- カスタムブラインドスケジュール（ユーザーが各レベルのSB/BBを自由に設定）
- レベル間にブレイクタイムを挟む機能
- 全クライアント切断時のタイマーポーズ
- ブラインドスケジュールのプリセット（ターボ、ディープスタック等）
- レベルアップ時のサウンド/バイブレーション通知
- `BleClientGameService` でのローカルカウントダウン精度向上（NTPベースのクロック同期等）
