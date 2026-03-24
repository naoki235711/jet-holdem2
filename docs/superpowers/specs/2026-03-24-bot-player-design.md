# Bot Player — Design Spec

**Date:** 2026-03-24
**Status:** Approved

---

## 1. Overview

LocalモードおよびBLEホストモードにCPU対戦相手（Bot）を追加する。最大9席すべてをBotで埋めることができ、人間プレイヤーが退場するまでゲームを継続する。

**方針:**
- プリフロップ: 既存の `preflopData.ts` GTO RFIデータを参照
- ポストフロップ: ルールベース（ハンド強度・SPR・ポジション考慮）
- 完全オフライン動作（機内モード対応）
- Botは `LocalGameService` / `BleHostGameService` 内で自動アクション（1秒ディレイ後）
- BLEモードではホスト側でBotを管理し、クライアントからは通常プレイヤーとして見える

---

## 2. Data Model

### `src/gameEngine/types.ts`

`Player` インターフェースに `isBot` フラグを追加する。

```typescript
export interface Player {
  seat: number;
  name: string;
  chips: number;
  status: PlayerStatus;
  bet: number;
  cards: Card[];
  isBot?: boolean;   // 省略時 = false（人間）
}
```

既存コードはすべて `isBot` を参照しないため破壊的変更なし。

---

## 3. BotPlayerService

### ファイル構成

```
src/bot/
├── BotPlayerService.ts          ← エントリポイント
└── strategy/
    ├── preflopStrategy.ts       ← GTO RFIデータ参照
    └── postflopStrategy.ts      ← ルールベース
```

### インターフェース

```typescript
// src/bot/BotPlayerService.ts
export interface BotContext {
  gameState: GameState;
  holeCards: Card[];
  seat: number;
}

export function decide(ctx: BotContext): PlayerAction
```

- 純粋関数（副作用なし）
- 同期実行（非同期処理不要）
- 外部ライブラリ依存なし

---

## 4. プリフロップ戦略（preflopStrategy.ts）

### ポジション算出とグループしきい値

アクティブプレイヤー（`status !== 'out'`）のseatをディーラーボタン基準で順番に並べ、各ポジションに以下の**openThreshold**（このポジションでRaiseできる最大グループ番号）を割り当てる。

| ポジション | openThreshold | 備考 |
|-----------|--------------|------|
| BTN | 6 | 後ろに2人 |
| CO | 5 | 後ろに3人 |
| HJ | 4 | 後ろに4,5人 |
| LJ | 4 | 後ろに4,5人 |
| UTG+2 | 3 | 後ろに6,7人 |
| UTG+1 | 3 | 後ろに6,7人 |
| UTG | 2 | 後ろに8人 |
| SB | 7 | 後ろに1人（BB） |
| BB | 1 | 特殊（RFI未適用） |

**ポジション割り当て手順:**
1. アクティブプレイヤーのseatをディーラーから時計回りに並べる（ディーラー自身=BTN、次=SB、次=BB、...）
2. プレイヤー数が9未満の場合、UTG側から省略（5人テーブルならBTN/SB/BB/CO/UTGのみ）
3. Botのseatがどのポジションに当たるかを求め、そのポジションの`openThreshold`を使う

### アクション決定

**group === 0 → 無条件Fold**（freqTierは参照しない）

**アンオープンポット（RFI状況）:**

| freqTier | ふるまい |
|----------|---------|
| 1 (100%) | 必ずRaise（3BB） |
| 2 (75–99%) | `Math.random() < 0.87` → Raise、それ以外 → Fold |
| 3 (50–74%) | `Math.random() < 0.62` → Raise、それ以外 → Fold |

`group > openThreshold` の場合はfold（このポジションでは開けないハンド）。

**レイズ済みポット（コール/3ベット状況）:**
- group 1〜2: 3ベット（currentBet × 3）
- group 3〜4: コール
- group 5〜7: `Math.random() < 0.15` → コール、それ以外 → Fold
- group 0 (fold): Fold

### レイズサイズ
- オープンレイズ: BB × 3
- 3ベット: currentBet × 3
- チップ不足時: All-in

---

## 5. ポストフロップ戦略（postflopStrategy.ts）

### ハンド強度分類

`evaluate7Cards(holeCards + community)` の `HandRank` を使用：

| 分類 | HandRank |
|------|---------|
| Strong | Straight以上（4〜9） |
| Medium | TwoPair〜ThreeOfAKind（2〜3） |
| Weak | OnePair（1） |
| Draw | フラッシュドロー or ストレートドロー（HighCard時のみ判定） |
| Air | HighCard かつドローなし |

**ドロー判定（`holeCards + community` で判定）:**
- フラッシュドロー: 同スートが4枚
- ストレートドロー: 連続する4枚（OESD）またはガットショット

### SPR（Stack-to-Pot Ratio）計算

```
effectiveStack = min(botPlayer.chips, maxOpponentChips)
totalPot = sum(pots[*].amount)
SPR = effectiveStack / totalPot
```

| SPR | 状況 |
|-----|------|
| < 4 | コミット（強ハンドでAll-in傾向） |
| 4〜10 | 通常 |
| > 10 | ビッグポット回避 |

### ポジション判定

- **IP (In Position)**: BotのseatがディーラーからBB方向で後ろ（最後にアクションする）
- **OOP (Out of Position)**: それ以外

### アクション決定テーブル

`currentBet === 0`（誰もベットしていない）かどうかでCheckが可能かを判定する。

| ハンド | SPR | ポジション | Check可能 | アクション |
|--------|-----|-----------|----------|-----------|
| Strong | 低(<4) | any | any | Raise/All-in |
| Strong | 中/高 | IP | any | Raise (pot×0.75) |
| Strong | 中/高 | OOP | yes | Bet (pot×0.75) |
| Strong | 中/高 | OOP | no | Call |
| Medium | 低 | any | yes | Check |
| Medium | 低 | any | no | Call |
| Medium | 中/高 | IP | yes | Bet (pot×0.5) |
| Medium | 中/高 | IP | no | Call |
| Medium | 中/高 | OOP | yes | Check |
| Medium | 中/高 | OOP | no | Call（コール額がスタックの30%以内）またはFold |
| Weak | any | any | yes | Check |
| Weak | any | any | no | Fold（コール額がスタックの15%以内のみCall） |
| Draw | any | IP | yes | `Math.random() < 0.4` → Bet (pot×0.5)、else Check |
| Draw | any | IP | no | Call（コール額がスタックの25%以内）またはFold |
| Draw | any | OOP | yes | Check |
| Draw | any | OOP | no | Fold |
| Air | any | IP | yes | `Math.random() < 0.25` → Bluff (pot×0.5)、else Check |
| Air | any | IP | no | Fold |
| Air | any | OOP | yes | Check |
| Air | any | OOP | no | Fold |

### ベットサイズ補正
- 最小レイズ未満の場合は `getMinRaiseSize()` の値に切り上げ
- チップ不足時: All-in

---

## 6. LocalGameService 統合

### `src/services/LocalGameService.ts` への変更

#### `startGame` シグネチャ

`botCount` を末尾のオプションパラメータとして追加し、既存の呼び出しを壊さない。

```typescript
startGame(
  playerNames: string[],
  blinds: Blinds,
  initialChips: number,
  savedChips?: Record<string, number>,
  botCount?: number   // ← 末尾に追加（デフォルト0）
): void
```

`GameService` インターフェース（`src/services/GameService.ts`）にも同様にオプションパラメータとして追加する。`BleClientGameService` の `startGame` スタブも署名を合わせるが内部実装変更は不要。

#### ロビーからの既存呼び出し箇所（すべて更新が必要）

- `app/game.tsx` — LocalGameService呼び出し箇所
- `app/game.tsx` — BleHostGameService呼び出し箇所
- `src/contexts/GameContext.tsx` の `rematch` コールバック（後述）

#### Bot席のセットアップ

```typescript
private botSeats = new Set<number>();
private pendingBotTimer: ReturnType<typeof setTimeout> | null = null;

startGame(playerNames, blinds, initialChips, savedChips?, botCount = 0) {
  // 既存の staleタイマーをキャンセル
  if (this.pendingBotTimer !== null) {
    clearTimeout(this.pendingBotTimer);
    this.pendingBotTimer = null;
  }
  this.botSeats.clear();

  // "Bot 1"〜"Bot N" を生成
  const botNames = Array.from({ length: botCount }, (_, i) => `Bot ${i + 1}`);
  const allNames = [...playerNames, ...botNames];

  // Fisher-Yatesシャッフルでseat割り当て（全員まとめてシャッフル）
  // ※BLEモードでは人間のseatは固定済みのため下記BLE節を参照
  const shuffled = fisherYatesShuffle(allNames);

  const players: Player[] = shuffled.map((name, i) => ({
    seat: i,
    name,
    chips: savedChips?.[name] ?? initialChips,
    status: 'active' as PlayerStatus,
    bet: 0,
    cards: [],
    isBot: botNames.includes(name),
  }));

  // Bot席を記録
  players.filter(p => p.isBot).forEach(p => this.botSeats.add(p.seat));

  this.gameLoop = new GameLoop(players, blinds);
  this.notify();
}
```

#### Bot自動アクション

```typescript
handleAction(seat: number, action: PlayerAction): ActionResult {
  const result = this.gameLoop.handleAction(seat, action);
  if (!result.valid && result.reason) {
    return { valid: false, reason: translateError(result.reason) };
  }
  this.notify();
  this.scheduleBotIfNeeded();
  return result;
}

startRound(): void {
  this.gameLoop.startRound();
  this.notify();
  this.scheduleBotIfNeeded();
}

private scheduleBotIfNeeded(): void {
  const state = this.gameLoop.getState();
  if (state.activePlayer === -1) return;
  if (!this.botSeats.has(state.activePlayer)) return;

  // 既存タイマーをキャンセルして重複を防ぐ
  if (this.pendingBotTimer !== null) {
    clearTimeout(this.pendingBotTimer);
  }

  this.pendingBotTimer = setTimeout(() => {
    this.pendingBotTimer = null;
    const s = this.gameLoop.getState();
    const botSeat = s.activePlayer;
    if (botSeat === -1 || !this.botSeats.has(botSeat)) return;

    const holeCards = this.gameLoop.getPrivateHand(botSeat);
    const action = decide({ gameState: s, holeCards, seat: botSeat });
    this.handleAction(botSeat, action);  // 再帰的に次のBotも処理
  }, 1000);
}
```

### `src/contexts/GameContext.tsx` の `rematch` 対応

`botCount` をコンテキスト内に保持し、rematch時に引き継ぐ。

```typescript
const [botCount, setBotCount] = useState(0);  // ← 追加

// startGame呼び出し時にbotCountを保存
// rematch内でも同じbotCountを渡す:
service.startGame(names, blinds, chips, undefined, botCount);
```

---

## 7. useActionTimer のBot席対応

`src/hooks/useActionTimer.ts` または `src/contexts/GameContext.tsx` の `handleTimeout` にBot席ガードを追加する。

```typescript
const handleTimeout = useCallback((seat: number) => {
  if (botSeats.has(seat)) return;  // ← Bot席はタイムアウト処理しない
  doAction({ action: 'fold' });
}, [botSeats, doAction]);
```

### `botSeats` の取得方法

`GameService` インターフェースにオプションメソッドを追加する：

```typescript
// src/services/GameService.ts
getBotSeats?(): ReadonlySet<number>;
```

- `LocalGameService` と `BleHostGameService`: `this.botSeats` を返すよう実装
- `BleClientGameService`: 実装しない（`undefined` のまま）

`GameContext` では `service.getBotSeats?.() ?? new Set()` でNull安全に参照する。`GameState` 型の変更・BLEプロトコルへの追加は不要。

---

## 8. PassDeviceScreen の抑制

`app/game.tsx` のホットシートモードでは `activePlayer` が変わるたびに `PassDeviceScreen` を表示している。Bot席への切り替わり時は表示しない。

```typescript
// PassDeviceScreen の表示条件:
const showPassScreen = activePlayer !== myHumanSeat && !isBotSeat(activePlayer);
```

---

## 9. ロビーUI

### ローカルモード: `src/components/lobby/HostSetupForm.tsx`

`onSubmit` に `botCount: number` を追加し、`+` / `−` ボタンで0〜8を選択できるUIを追加する。

```typescript
type HostSetupFormProps = {
  onSubmit: (settings: {
    hostName: string;
    sb: string;
    bb: string;
    initialChips: string;
    botCount: number;   // ← 追加
  }) => void;
};
```

UI例:
```
Bot人数
  [ − ]  [ 3 ]  [ + ]
```

### BLEホストモード

**BLE Botは本スペックのスコープ外とし、フォローアップスペックで対応する。**

理由: BLEモードでは人間プレイヤーのseatがロビーフェーズで `clientSeatMap` により確定済みのため、Bot席挿入のためには `BleHostGameService.startGame` シグネチャへの別途変更が必要。Local Botが安定してからBLEへ拡張する。

将来対応の方針（メモ）:
- 空き席のみにBotをランダム配置
- `BleHostGameService` に `addBot(seat: number)` 等の別メソッドを追加する方向で検討

---

## 10. ゲームUI

### Botバッジ

`Player.isBot === true` の席にはシート名の横に「BOT」バッジを表示する。

- ロビー: `PlayerSlot.tsx` に `isBot` 条件でバッジ追加
- テーブル: テーブル上のプレイヤー名表示部分に同様に追加

### アクションボタン無効化

`activePlayer` がBot席のとき、アクションボタン（ActionButtons）を非活性化する（`disabled` prop）。Botが1秒後に自動アクションするため操作不要。

### Bot勝利時の自動進行

Botが最後の1人になり `roundEnd` になった場合、`ResultOverlay` は表示するが「次のラウンド」ボタンは人間プレイヤーが押す（自動進行はしない）。人間プレイヤーが全員 `out` になった場合は `gameOver` として通常通り処理する。

---

## 11. テスト方針

- `BotPlayerService.decide()` は純粋関数のためユニットテストが容易
- プリフロップ: 各ポジション・各ハンドカテゴリでの出力を検証
- ポストフロップ: Strong/Medium/Weak/Draw/Airの各ケース（Check可/不可）で想定アクションを検証
- `LocalGameService` 統合: Bot席を含むゲームで `startRound()` 後に1秒後に自動アクションが発火することを確認
- タイマー競合: Bot席の `handleTimeout` がno-opになることを確認

---

## 12. Out of Scope（将来対応）

- 難易度選択（Easy/Hard）
- ポストフロップCFRテーブル
- Botのアクション履歴表示
- Botのブラフ頻度チューニングUI
- BLEクライアント側でのBot操作（ホスト専権）
- gameOver後の自動rematch
