# BLE Game Play Design — Doc 3

## Overview

BLE経由でのゲームプレイを実現する。ホスト端末がGameLoopを所有し、GameState/PrivateHand/PlayerActionをBLE特性経由で配信・受信する。既存の`GameService`インターフェースを実装し、UI層（GameView等）からは`LocalGameService`と同じように利用可能にする。

## Context

### 前提条件
- Doc 1: BLEロビーロジック（LobbyHost, LobbyClient, LobbyProtocol, ChunkManager, MockBleTransport）が実装済み
- Doc 1b: BLEトランスポート実装設計（BleHostTransportImpl, BleClientTransportImpl, GATT特性定義）が設計済み
- Doc 2: BLEロビーUI（LobbyModeSelector, BleHostLobby, BleJoinLobby, game.tsxのBLEプレースホルダー）が設計済み
- `GameService`インターフェース + `LocalGameService`パターンが確立済み
- `GameLoop.getPrivateHand(seat)` / `GameLoop.getMinRaiseSize()` が実装済み
- `BleHostTransport` / `BleClientTransport` インターフェースが分離済み

### 制約
- ホスト端末がGameLoopを所有し、唯一の権威（authoritative source）
- クライアントはホストからの状態配信を受信するのみ（アクションはBLE経由でホストに送信）
- BLE MTU制約: ChunkManager（3バイトヘッダ + 182バイトペイロード）で対応済み
- トランスポート層は同一インスタンスをロビーとゲームで共有

---

## 1. Architecture

### BleHostGameService / BleClientGameService 分離

`LocalGameService`がGameLoopを直接操作するのと同様に、ホスト側は`BleHostGameService`がGameLoopを所有する。クライアント側は`BleClientGameService`がホストからの状態配信を受け取り、`GameService`インターフェースを実装する。

```
ホスト端末:
┌─────────────────────────────────────────────────┐
│ GameView (既存UI)                                │
│     ↕ GameService interface                     │
│ BleHostGameService                               │
│     ├── GameLoop (所有)                          │
│     ├── GameProtocol (メッセージ型・バリデーション) │
│     └── ChunkManager                            │
│         ↕ Uint8Array                            │
│     BleHostTransport                             │
└─────────────────────────────────────────────────┘

クライアント端末:
┌─────────────────────────────────────────────────┐
│ GameView (既存UI)                                │
│     ↕ GameService interface                     │
│ BleClientGameService                             │
│     ├── GameProtocol (メッセージ型・バリデーション) │
│     └── ChunkManager                            │
│         ↕ Uint8Array                            │
│     BleClientTransport                           │
└─────────────────────────────────────────────────┘
```

### GATT特性（ゲームフェーズ）

Doc 1bで定義済みのUUID（`bleConstants.ts`）を使用:

| 特性 | Properties | 方向 | 用途 |
|---|---|---|---|
| `gameState` | Read, Notify | Host→All | 公開GameState配信（手札は空配列） |
| `privateHand` | Read, Notify | Host→Individual | 各プレイヤーの手札配信 |
| `playerAction` | Write | Client→Host | プレイヤーアクション送信 |

**論理名 → UUID マッピング:** 上位層（BleHostGameService, BleClientGameService）は論理名（`'gameState'`, `'privateHand'`, `'playerAction'`）を使用。トランスポート実装層がUUIDに解決する（Doc 1b設計準拠）。

### トランスポートの引き継ぎ

ロビーからゲームへの遷移時、同じBleHostTransport / BleClientTransportインスタンスを継続使用する。ゲームサービスが`onMessageReceived`を再登録することで、ロビー用のメッセージハンドラからゲーム用に切り替わる。

```
LobbyHost.onGameStart → BleHostGameService生成
  ├── transport.onMessageReceived を再登録（playerAction特性のみ処理）
  └── gameState / privateHand 特性でゲーム状態を配信開始

LobbyClient.onGameStart → BleClientGameService生成
  ├── transport.onMessageReceived を再登録（gameState / privateHand 特性を処理）
  └── playerAction 特性でアクションを送信
```

### ディレクトリ構成

```
src/services/ble/
├── BleTransport.ts            — (既存) トランスポートインターフェース
├── MockBleTransport.ts        — (既存) テスト用モック
├── LobbyHost.ts               — (既存) ロビーホスト
├── LobbyClient.ts             — (既存) ロビークライアント
├── LobbyProtocol.ts           — (既存) ロビーメッセージ型
├── ChunkManager.ts            — (既存) チャンク分割・再組立
├── GameProtocol.ts            — (新規) ゲームメッセージ型・バリデーション
├── BleHostGameService.ts      — (新規) ホスト側GameService実装
├── BleClientGameService.ts    — (新規) クライアント側GameService実装
└── transportRegistry.ts       — (新規) トランスポートインスタンス受け渡し

tests/ble/
├── GameProtocol.test.ts       — (新規)
├── BleHostGameService.test.ts — (新規)
├── BleClientGameService.test.ts — (新規)
└── integration/
    └── BleGameFlow.test.ts    — (新規) Host + Client結合テスト
```

---

## 2. Game Protocol

### メッセージ型定義（GameProtocol.ts）

```typescript
import { Card, Phase, Pot, Blinds, PlayerStatus, ActionType } from '../../gameEngine/types';

export const GAME_PROTOCOL_VERSION = 1;

// --- Host → Client (gameState characteristic) ---

export type GameStatePlayer = {
  seat: number;
  name: string;
  chips: number;
  status: PlayerStatus;
  bet: number;
  cards: Card[];  // 常に [] （手札はprivateHand経由）
};

export type GameHostMessage =
  | {
      type: 'stateUpdate';
      seq: number;
      phase: Phase;
      community: Card[];
      pots: Pot[];
      currentBet: number;
      activePlayer: number;
      dealer: number;
      blinds: Blinds;
      players: GameStatePlayer[];
      minRaiseSize: number;
      frozenSeats: number[];
      foldWin?: { seat: number; amount: number };
    }
  | {
      type: 'showdownResult';
      seq: number;
      winners: { seat: number; hand: string; potAmount: number }[];
      hands: { seat: number; cards: Card[]; description: string }[];
    }
  | {
      type: 'roundEnd';
      seq: number;
    };

// --- Host → Client (privateHand characteristic) ---

export type PrivateHandMessage = {
  type: 'privateHand';
  seat: number;
  cards: Card[];
};

// --- Client → Host (playerAction characteristic) ---

export type GameClientMessage = {
  type: 'playerAction';
  action: ActionType;
  amount?: number;
};
```

### 設計判断

- **`stateUpdate`にフルGameState情報を含める:** 差分配信は複雑さが大きく、GameState全体（手札除く）でも~400バイト以下でChunkManagerの2-3チャンクに収まる
- **`minRaiseSize`を含める:** クライアントが`getActionInfo()`をローカルで計算するために必要。追加のBLEラウンドトリップを回避
- **`frozenSeats`を含める:** BLE切断中のプレイヤーをUIで表示するため。GameLoopの`PlayerStatus`には追加しない（BLE層のみの概念）
- **`showdownResult`を独立メッセージにする:** `resolveShowdown()`の戻り値（ShowdownResult）は手札情報を含むため、stateUpdateとは別に送信
- **全メッセージに`seq`を含める:** BLE Notifyは単一特性上では順序保証されるが、`showdownResult`と`roundEnd`にも`seq`を含め、クライアント側でのラウンド識別に利用
- **`privateHand`は個別送信:** 各クライアントに自分の手札のみを送信。`sendToClient`使用
- **`playerAction`にseatを含めない:** ホスト側でclientId→seatのマッピングを保持しているため、なりすまし防止

### バリデーション関数

```typescript
export function validateGameHostMessage(data: unknown): GameHostMessage | null;
export function validatePrivateHandMessage(data: unknown): PrivateHandMessage | null;
export function validateGameClientMessage(data: unknown): GameClientMessage | null;
```

LobbyProtocol.tsのパターンに準拠: `isObject`チェック → `type`フィールドでswitch → 各フィールドの型検証 → パース失敗時はnull返却。

---

## 3. BleHostGameService

### クラス設計

```typescript
export class BleHostGameService implements GameService {
  private gameLoop: GameLoop | null = null;
  private transport: BleHostTransport;
  private chunkManager = new ChunkManager();
  private clientSeatMap: Map<string, number>;  // clientId → seat
  private hostSeat: number = 0;
  private frozenSeats = new Map<number, NodeJS.Timeout>();  // seat → timeout
  private listeners = new Set<(state: GameState) => void>();

  constructor(
    transport: BleHostTransport,
    clientSeatMap: Map<string, number>,
  );
}
```

### コンストラクタでの初期化

1. `transport.onMessageReceived`を再登録し、`playerAction`特性のメッセージを処理
2. `transport.onClientDisconnected`を登録し、切断時のフリーズ処理を開始
3. GameLoopの生成は`startGame()`で行う（`LocalGameService`パターンに準拠）

### GameServiceインターフェース実装

| メソッド | 動作 |
|---|---|
| `getState()` | `gameLoop.getState()` を返す。**ホスト自身の手札のみ表示し、他プレイヤーの手札は空配列に置換** |
| `getActionInfo(seat)` | `LocalGameService`と同じロジック（GameLoopから計算） |
| `startGame(playerNames, blinds, initialChips)` | GameLoop生成（`new GameLoop(players, blinds)`） |
| `startRound()` | `gameLoop.startRound()` → `broadcastState()` → `sendPrivateHands()` |
| `handleAction(seat, action)` | `gameLoop.handleAction(seat, action)` → `broadcastState()` |
| `resolveShowdown()` | `gameLoop.resolveShowdown()` → showdownResult送信 → `broadcastState()` |
| `prepareNextRound()` | `gameLoop.prepareNextRound()` → `broadcastState()` |
| `subscribe(listener)` | ローカルリスナー登録（ホストUI用）、`() => void`（unsubscribe関数）を返す |

### getState()の手札制限（ホスト側）

```typescript
getState(): GameState {
  if (!this.gameLoop) throw new Error('Game not started');
  const state = this.gameLoop.getState();
  return {
    ...state,
    players: state.players.map(p =>
      p.seat === this.hostSeat ? p : { ...p, cards: [] }
    ),
  };
}
```

ポーカーの公平性のため、ホスト端末のUIにも自分以外の手札は表示しない。ホストがGameLoopを所有している以上、技術的にはアクセス可能だが、UIレベルでの公平性を担保する。

### subscribe()の戻り値

```typescript
subscribe(listener: (state: GameState) => void): () => void {
  this.listeners.add(listener);
  return () => { this.listeners.delete(listener); };
}
```

`LocalGameService`と同じパターン。`GameContext`のuseEffectクリーンアップでunsubscribeが呼ばれる。

### 状態配信

```typescript
private broadcastState(): void {
  const state = this.gameLoop!.getState();
  // ホストUIに通知（手札はgetState()でフィルタされる）
  this.listeners.forEach(l => l(this.getState()));

  // BLE配信: 手札を空にしたGameState（明示的に構築、型安全性確保）
  const msg: GameHostMessage = {
    type: 'stateUpdate',
    seq: state.seq,
    phase: state.phase,
    community: state.community,
    pots: state.pots,
    currentBet: state.currentBet,
    activePlayer: state.activePlayer,
    dealer: state.dealer,
    blinds: state.blinds,
    players: state.players.map(p => ({
      seat: p.seat,
      name: p.name,
      chips: p.chips,
      status: p.status,
      bet: p.bet,
      cards: [] as Card[],
    })),
    minRaiseSize: this.gameLoop!.getMinRaiseSize(),
    frozenSeats: Array.from(this.frozenSeats.keys()),
    foldWin: state.foldWin,
  };
  this.sendToAll('gameState', msg);
}

private sendPrivateHands(): void {
  for (const [clientId, seat] of this.clientSeatMap) {
    const cards = this.gameLoop!.getPrivateHand(seat);
    this.sendToClient(clientId, 'privateHand', {
      type: 'privateHand',
      seat,
      cards,
    });
  }
}
```

### アクション受信

```typescript
// transport.onMessageReceived から呼ばれる
private handleClientAction(clientId: string, charId: string, data: Uint8Array): void {
  if (charId !== 'playerAction') return;

  const json = this.chunkManager.decode(clientId, data);
  if (!json) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return;  // 不正なJSONは無視（LobbyHost.handleMessageパターン準拠）
  }

  const msg = validateGameClientMessage(parsed);
  if (!msg) return;

  const seat = this.clientSeatMap.get(clientId);
  if (seat === undefined) return;

  // フリーズ中のプレイヤーからのアクションは無視
  if (this.frozenSeats.has(seat)) return;

  const action = { action: msg.action, amount: msg.amount };
  this.handleAction(seat, action);
}
```

---

## 4. BleClientGameService

### クラス設計

```typescript
export class BleClientGameService implements GameService {
  private transport: BleClientTransport;
  private chunkManager = new ChunkManager();
  private mySeat: number;
  private currentState: GameState | null = null;
  private myCards: Card[] = [];
  private lastShowdownResult: ShowdownResult | null = null;
  private minRaiseSize: number = 0;
  private frozenSeats: number[] = [];
  private listeners = new Set<(state: GameState) => void>();

  constructor(
    transport: BleClientTransport,
    mySeat: number,
  );
}
```

### コンストラクタでの初期化

1. `transport.onMessageReceived`を再登録
2. `gameState`特性: stateUpdate受信 → `currentState`更新 → リスナー通知
3. `privateHand`特性: privateHand受信 → `myCards`更新 → リスナー通知（手札入れ替え済みのstate）

### GameServiceインターフェース実装

| メソッド | 動作 |
|---|---|
| `getState()` | `currentState`を返す。`players[mySeat].cards`を`myCards`に置換 |
| `getActionInfo(seat)` | `currentState`と`minRaiseSize`からローカル計算 |
| `startGame(playerNames, blinds, initialChips)` | no-op（ホストが開始済み。シグネチャはインターフェース準拠のため引数を受け取るが使用しない） |
| `startRound()` | no-op（ホストが実行。stateUpdateで自動同期） |
| `handleAction(seat, action)` | 楽観的に `{valid: true}` を返し、BLE経由でホストに送信 |
| `resolveShowdown()` | `lastShowdownResult` を返す（ホストから受信済み） |
| `prepareNextRound()` | no-op（ホストが実行。stateUpdateで自動同期） |
| `subscribe(listener)` | リスナー登録。`() => void`（unsubscribe関数）を返す |

### ラウンドライフサイクルの非対称性

BLEモードではホストがラウンドのライフサイクルを完全に制御する。クライアントのno-opメソッドについて:

- **`startRound()`:** クライアントUIがこれを呼んでも何も起きない。ホストが`startRound()`を実行すると、stateUpdate（phase: 'preflop'）がBLE経由で配信され、クライアントのsubscribeリスナーが自動発火
- **`prepareNextRound()`:** 同上。ホストが実行 → stateUpdate（phase: 'waiting'）配信で同期
- **`resolveShowdown()`:** ホストが実行 → showdownResultメッセージがBLE経由で送信。クライアントは受信時に`lastShowdownResult`を保存し、subscribeリスナーに通知。`game.tsx`（GameContext）側で`resolveShowdown()`を呼ぶと保存済みの結果が返る

**ホスト側のゲーム進行トリガー:** ホストのUIが`startRound()` / `resolveShowdown()` / `prepareNextRound()`を呼ぶタイミングは既存の`GameContext`フローと同じ。クライアントはstateUpdate受信でUIが自動更新される。

### showdownResult のクライアントへの伝播

```
ホスト: resolveShowdown()
  ├── GameLoop.resolveShowdown() → ShowdownResult
  ├── showdownResultメッセージをBLE送信
  └── broadcastState() → stateUpdate (phase: 'roundEnd')

クライアント: showdownResultメッセージ受信
  ├── lastShowdownResult = result
  ├── subscribeリスナーに通知（現在のstateで）
  └── game.tsx がresolveShowdown()を呼ぶ → lastShowdownResult返却
```

**game.tsx (GameContext) の小修正が必要:** 現在の`GameContext.doAction()`は`handleAction()`直後にphaseが'showdown'かチェックしてresolveShowdown()を呼ぶ。BLEクライアントでは`handleAction()`は楽観的returnのためphaseは変わらない。代わりに、subscribeコールバック内でphaseが'showdown'に変わったことを検出し、showdownResult受信後にresolveShowdown()を呼ぶ。この小修正はDoc 3スコープに含める。

### 楽観的アクション（Optimistic Action）

```typescript
handleAction(seat: number, action: PlayerAction): ActionResult {
  // クライアントは楽観的にvalidを返す
  // ホストが権威。無効なアクションは無視され、次のstateUpdateで正しい状態に同期
  const msg: GameClientMessage = { type: 'playerAction', action: action.action, amount: action.amount };
  this.sendToHost('playerAction', msg);
  return { valid: true };
}
```

### getState()の手札置換

```typescript
getState(): GameState {
  if (!this.currentState) throw new Error('Game not started');
  return {
    ...this.currentState,
    players: this.currentState.players.map(p =>
      p.seat === this.mySeat ? { ...p, cards: this.myCards } : p
    ),
  };
}
```

これにより、既存のGameViewは`state.players[seat].cards`からホールカードを取得でき、BLE固有のロジックを意識する必要がない。

### subscribe()の戻り値

```typescript
subscribe(listener: (state: GameState) => void): () => void {
  this.listeners.add(listener);
  return () => { this.listeners.delete(listener); };
}
```

`BleHostGameService`と同じパターン。`GameContext`のuseEffectクリーンアップで呼ばれる。

### getActionInfo()のローカル計算

```typescript
getActionInfo(seat: number): ActionInfo {
  if (!this.currentState) throw new Error('Game not started');
  const player = this.currentState.players.find(p => p.seat === seat);
  if (!player) throw new Error(`Invalid seat: ${seat}`);

  const minRaiseTo = this.currentState.currentBet + this.minRaiseSize;
  const maxRaiseTo = player.chips + player.bet;

  return {
    canCheck: this.currentState.currentBet <= player.bet,
    callAmount: Math.min(this.currentState.currentBet - player.bet, player.chips),
    minRaise: minRaiseTo,
    maxRaise: maxRaiseTo,
    canRaise: maxRaiseTo >= minRaiseTo,
  };
}
```

---

## 5. Disconnection & Reconnection

### 30秒リコネクション猶予期間

BLE接続が切断された場合、即座にプレイヤーを脱落（fold/out）させず、30秒の猶予期間を設ける。

```
BLE切断検出 (transport.onClientDisconnected)
  │
  ├── frozenSeats.set(seat, setTimeout(30000))
  ├── broadcastState() ← frozenSeats含む
  │
  ├─ [30秒以内に再接続]
  │    ├── frozenSeats.delete(seat)
  │    ├── broadcastState()
  │    └── sendPrivateHand(clientId, seat) ← 手札再送
  │
  └─ [30秒タイムアウト]
       ├── handleAction(seat, { action: 'fold' }) ← 自動フォールド
       ├── frozenSeats.delete(seat)
       └── broadcastState()
```

### frozen状態の設計方針

- **`frozen`はBLE層のみの概念:** GameLoopの`PlayerStatus`型（`'active' | 'folded' | 'allIn' | 'out'`）には追加しない
- `BleHostGameService`が`frozenSeats: Map<number, NodeJS.Timeout>`で内部管理
- `stateUpdate`メッセージの`frozenSeats: number[]`フィールドでクライアントに通知
- UIは`frozenSeats`にseatが含まれている場合、「接続切断中」と表示

### フリーズ中のターン処理

フリーズ中のプレイヤーのターンが回ってきた場合：
1. `activePlayer`がfrozenSeatに含まれるか確認
2. 含まれる場合、自動的に`handleAction(seat, { action: 'fold' })`を実行
3. タイムアウトを待たずに即座にフォールド（ターンが回った時点で行動不能と判断）

### 再接続時の状態復元

再接続したクライアントに対して：
1. 最新のstateUpdate（フルGameState）を個別送信
2. privateHand（手札）を個別送信
3. これにより、再接続クライアントは最新状態に同期

### 再接続時のclientId対応

BLEの再接続でclientIdが変わる可能性がある（OS側のデバイスID割り当てに依存）。対応方針:

- **再接続プロトコル:** 再接続したクライアントは`playerAction`特性経由で`{ type: 'rejoin', seat: number }`メッセージを送信
- `BleHostGameService`は新しいclientIdをseatにマッピングし直す（`clientSeatMap`更新）
- `GameClientMessage`に`rejoin`タイプを追加:

```typescript
export type GameClientMessage =
  | { type: 'playerAction'; action: ActionType; amount?: number }
  | { type: 'rejoin'; seat: number };
```

- **セキュリティ:** rejoinメッセージのseatが実際にフリーズ中のseatと一致するか検証。一致しない場合は無視

### クライアント側の切断検出

クライアント（`BleClientGameService`）がホストとの接続を失った場合は、UI層で「接続が切れました。再接続しています...」を表示。ホスト側が30秒猶予を管理しているため、クライアントは自律的に再接続を試みればよい。再接続成功後、自動的に`rejoin`メッセージを送信する。

---

## 6. game.tsx Integration

### transportRegistry.ts

Expo Routerのパラメータはシリアライズ可能な値のみ渡せるため、BleHostTransport / BleClientTransportインスタンスはグローバルシングルトンレジストリで受け渡す。

```typescript
// src/services/ble/transportRegistry.ts

import { BleHostTransport, BleClientTransport } from './BleTransport';

let hostTransport: BleHostTransport | null = null;
let clientTransport: BleClientTransport | null = null;

export function setHostTransport(t: BleHostTransport): void { hostTransport = t; }
export function getHostTransport(): BleHostTransport | null { return hostTransport; }
export function clearHostTransport(): void { hostTransport = null; }

export function setClientTransport(t: BleClientTransport): void { clientTransport = t; }
export function getClientTransport(): BleClientTransport | null { return clientTransport; }
export function clearClientTransport(): void { clientTransport = null; }
```

### ロビーからゲームへの遷移パラメータ

```typescript
// ble-host.tsx → game.tsx
{
  mode: 'ble-host',
  sb: string,
  bb: string,
  initialChips: string,
  seat: '0',
  playerNames: string,       // JSON.stringify(playerNames)
  clientSeatMap: string,      // JSON.stringify(Object.fromEntries(map))
}

// ble-join.tsx → game.tsx
{
  mode: 'ble-client',
  sb: string,
  bb: string,
  initialChips: string,
  seat: string,               // mySeat.toString()
}
```

**`clientSeatMap`のシリアライズ:** `Map<string, number>`は`Object.fromEntries()`でプレーンオブジェクトに変換し、`JSON.stringify`でシリアライズ。game.tsx側では型安全に復元:

```typescript
const parsed = JSON.parse(params.clientSeatMap) as Record<string, number>;
const seatMap = new Map<string, number>(
  Object.entries(parsed).map(([k, v]) => [k, Number(v)])
);
```

**`playerNames`と`clientSeatMap`の導出:** ロビー画面（`ble-host.tsx`）のゲーム開始時に、`LobbyHost`の`getPlayerList()`から構築する:

```typescript
// ble-host.tsx: LobbyHost.onGameStart コールバック内
const playerList = lobbyHost.getPlayerList();  // seat順にソート済み
const playerNames = playerList.map(p => p.name);
// clientSeatMapはLobbyHostのplayers Map（clientId → LobbyPlayer）から構築
// ホスト自身（'__host__'キー）は除外
const clientSeatMap = new Map<string, number>();
for (const [clientId, player] of lobbyHost.players) {
  if (clientId !== '__host__') clientSeatMap.set(clientId, player.seat);
}
```

**Note:** `LobbyHost.players`（private）へのアクセスが必要。`getClientSeatMap(): Map<string, number>`メソッドをLobbyHostに追加する。

### game.tsx の変更

Doc 2で追加されたBLEプレースホルダーを実際のゲームサービス生成に置き換える:

```typescript
// game.tsx (概要)
if (mode === 'ble-host') {
  const transport = getHostTransport()!;
  const parsed = JSON.parse(params.clientSeatMap) as Record<string, number>;
  const seatMap = new Map<string, number>(
    Object.entries(parsed).map(([k, v]) => [k, Number(v)])
  );
  const service = new BleHostGameService(transport, seatMap);
  service.startGame(playerNames, { sb, bb }, initialChips);
  // 既存のGameView + service で描画
} else if (mode === 'ble-client') {
  const transport = getClientTransport()!;
  const service = new BleClientGameService(transport, Number(params.seat));
  // 既存のGameView + service で描画（startGame()はno-op、stateUpdateで同期）
}
```

### トランスポートの登録タイミング

```
BleHostLobby (ble-host.tsx):
  useEffect → new MockBleHostTransport() → setHostTransport(transport)
  LobbyHost.onGameStart → router.push('/game', { mode: 'ble-host', ... })

BleJoinLobby (ble-join.tsx):
  useEffect → new MockBleClientTransport() → setClientTransport(transport)
  LobbyClient.onGameStart → router.push('/game', { mode: 'ble-client', ... })

game.tsx:
  getHostTransport() / getClientTransport() → BleHostGameService / BleClientGameService 生成
  unmount時: clearHostTransport() / clearClientTransport()
```

---

## 7. Test Strategy

### テストファイル構成

```
tests/ble/
├── GameProtocol.test.ts            — メッセージ型バリデーション
├── BleHostGameService.test.ts      — ホスト側ゲームサービス
├── BleClientGameService.test.ts    — クライアント側ゲームサービス
└── integration/
    └── BleGameFlow.test.ts         — Host + Client結合テスト
```

### テスト内容

| テスト | 検証項目 |
|--------|----------|
| GameProtocol | `validateGameHostMessage`: 正常stateUpdate/showdownResult/roundEndのパース、不正JSON拒否、必須フィールド欠損の拒否 |
| GameProtocol | `validatePrivateHandMessage`: 正常パース、不正データ拒否 |
| GameProtocol | `validateGameClientMessage`: 正常playerActionパース、不正action拒否 |
| BleHostGameService | startRound → gameState/privateHand配信確認 |
| BleHostGameService | handleAction(ローカルseat) → GameLoop委譲 + broadcastState確認 |
| BleHostGameService | クライアントからのplayerAction受信 → clientId→seat解決 → handleAction |
| BleHostGameService | 手札のストリップ確認（配信されるGameStateのplayers[].cardsが全て空配列） |
| BleHostGameService | resolveShowdown → showdownResult配信確認 |
| BleHostGameService | subscribe → ローカルリスナーへの通知確認 |
| BleHostGameService | 切断 → frozenSeats追加 → stateUpdate.frozenSeats確認 |
| BleHostGameService | 30秒タイムアウト → 自動フォールド（jest.useFakeTimers） |
| BleHostGameService | タイムアウト前の再接続 → frozenSeats除去 + privateHand再送確認 |
| BleHostGameService | フリーズ中のターン → 即座にフォールド |
| BleClientGameService | stateUpdate受信 → getState()反映確認 |
| BleClientGameService | privateHand受信 → getState()のplayers[mySeat].cards置換確認 |
| BleClientGameService | handleAction → 楽観的{valid: true}返却 + playerAction送信確認 |
| BleClientGameService | getActionInfo → minRaiseSizeを使ったローカル計算確認 |
| BleClientGameService | subscribe → stateUpdate受信時のリスナー通知確認 |
| BleClientGameService | resolveShowdown → lastShowdownResult返却確認 |
| BleGameFlow結合 | Host + Client 1-3台のフルフロー: startRound → action → showdown |
| BleGameFlow結合 | 途中切断 → フリーズ → 再接続 → ゲーム継続 |
| BleGameFlow結合 | 全ラウンドのphase遷移（preflop → flop → turn → river → showdown） |

### モック方針

- BleHostGameService / BleClientGameServiceのテストでは`MockBleHostTransport` / `MockBleClientTransport`を使用
- 結合テストでは既存の`MockBleNetwork`ヘルパーで Host↔Client間のメッセージをブリッジ
- 30秒タイムアウトテストには`jest.useFakeTimers()` + `jest.advanceTimersByTime(30000)`を使用

### テスト対象外（Doc 3スコープ外）

- 実際のBLE通信テスト → 実機テスト可能になってから
- UI層のBLEゲームモードテスト → Doc 2のGameViewテストと同じパターンで追加可能（Doc 3はサービス層まで）
- Data Persistence → Doc 4

---

## 8. Scope

### 今回のスコープ（Doc 3: BLEゲームプレイ）

- `GameProtocol.ts`: ゲームフェーズのメッセージ型定義・バリデーション（rejoinメッセージ含む）
- `BleHostGameService.ts`: ホスト側GameService実装（GameLoop所有、BLE配信）
- `BleClientGameService.ts`: クライアント側GameService実装（状態受信、楽観的アクション）
- `transportRegistry.ts`: トランスポートインスタンスの受け渡しシングルトン
- `LobbyHost.ts`への小修正: `getClientSeatMap(): Map<string, number>`メソッド追加
- `game.tsx`のBLEプレースホルダー置き換え: BleHostGameService / BleClientGameService生成
- `GameContext`の小修正: BLEクライアント向けshowdown検出ロジック（subscribeコールバック内でphase='showdown'検出）
- 切断・再接続処理: 30秒猶予期間、frozenSeats管理、自動フォールド、rejoinプロトコル
- 上記の全Jestテスト

### スコープ外

- 実BLEライブラリ結合（Doc 1b — 別イテレーション）
- ゲーム終了後の再戦フロー（将来拡張）
- 観戦モード（将来拡張）
- Data Persistence（Doc 4）
- UI層のBLEゲームモード固有表示（frozenSeatのUI表示等 — 必要に応じてDoc 3内で追加可能だが、コアスコープではない）
