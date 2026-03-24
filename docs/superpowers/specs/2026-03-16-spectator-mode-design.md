# Spectator Mode Design

**Date:** 2026-03-16
**Depends on:** BLE Lobby Design (Doc 1), BLE Game Play (Doc 3), UI Design

## Overview

BLEゲームの観戦モードを実装する。プレイヤーとして参加せずにゲームを閲覧できる「観戦者（Spectator）」ロールを追加し、コミュニティカード・ポット・プレイヤー名/チップ/ステータスを表示する。ホールカードは非表示とし、ショーダウン結果は公開する。

## Context

### 現状
- BLEゲームは最大4人のプレイヤー参加（ホスト1 + クライアント3）
- ロビーにはプレイヤー参加のみのオプション（joinメッセージ）
- 観戦モードはDoc 3で「スコープ外（将来拡張）」として明記済み
- `GameService`インターフェースはプレイヤー操作を前提とした設計

### BLE接続制限
- iOS BLE Peripheralは一般的に最大7-8のCentral接続をサポート
- 現状: ホスト（Peripheral）+ クライアント3台（Central）= 3 BLE接続
- 観戦者の追加余地: 3-4台（合計6-7接続は安全な範囲内）
- **設計上限: 最大4人の観戦者**（プレイヤー3 + 観戦者4 = 合計7 Central接続）

### 設計判断
1. **観戦者はBLE接続を消費する:** Broadcastモードではなく、通常のCentral接続を使用。理由: 既存のGATT Notify配信インフラをそのまま活用できる
2. **観戦者はprivateHandを受信しない:** gameState特性のNotifyのみsubscribe
3. **ショーダウン結果は観戦者に表示する:** showdownResultメッセージ（gameState特性経由）で手札情報を受信
4. **観戦者はアクション不可:** playerAction特性へのWriteを行わない。サービス層でも無視する
5. **観戦者はゲーム中途参加可能:** ゲーム進行中でも観戦参加できる（次のstateUpdateで同期）
6. **GameServiceインターフェースは変更しない:** 観戦者専用の`BleSpectatorGameService`を新設し、既存インターフェースを実装

---

## 1. LobbyProtocol の変更

### メッセージ型拡張

```typescript
// LobbyClientMessage に追加
| { type: 'spectate'; protocolVersion: number; spectatorName: string }

// LobbyHostMessage に追加
| { type: 'spectateResponse'; accepted: true; spectatorId: number; players: LobbyPlayer[]; gameSettings: GameSettings }
| { type: 'spectateResponse'; accepted: false; reason: string }
| { type: 'spectatorUpdate'; spectatorCount: number }
```

### 設計方針

- **`spectate`メッセージ:** `join`メッセージと同じ構造だが、`type`で区別。ゲーム中も受け付ける（Section 7参照）。`join`メッセージはゲーム中は拒否するが、`spectate`は常に受理する
- **`spectateResponse`:** `joinResponse`と類似。seatの代わりに`spectatorId`（0-3）を返す。プレイヤーリストは表示用に含める
- **`spectatorUpdate`:** プレイヤーリスト更新時に観戦者数もブロードキャストする。ホストUIで観戦者数を表示するため
- **`spectatorId`:** 内部管理用の識別子。seatとは独立（観戦者はseatを持たない）

### バリデーション関数の拡張

```typescript
// validateClientMessage に追加
case 'spectate':
  if (data.protocolVersion !== PROTOCOL_VERSION) return null;
  if (typeof data.spectatorName !== 'string' || data.spectatorName === '') return null;
  return { type: 'spectate', protocolVersion: PROTOCOL_VERSION, spectatorName: data.spectatorName };

// validateHostMessage に追加
case 'spectateResponse':
  if (data.accepted === true) {
    if (typeof data.spectatorId !== 'number') return null;
    if (!isLobbyPlayerArray(data.players)) return null;
    if (!isValidGameSettings(data.gameSettings)) return null;
    return {
      type: 'spectateResponse',
      accepted: true,
      spectatorId: data.spectatorId,
      players: data.players,
      gameSettings: data.gameSettings,
    };
  }
  if (data.accepted === false) {
    if (typeof data.reason !== 'string') return null;
    return { type: 'spectateResponse', accepted: false, reason: data.reason };
  }
  return null;
case 'spectatorUpdate':
  if (typeof data.spectatorCount !== 'number') return null;
  return { type: 'spectatorUpdate', spectatorCount: data.spectatorCount };
```

---

## 2. LobbyHost の変更

### 観戦者管理

```typescript
// LobbyHost 内部状態の追加
private spectators = new Map<string, { id: number; name: string }>(); // clientId → spectator info
private maxSpectators = 4;
```

### handleMessage の拡張

```typescript
case 'spectate':
  this.handleSpectate(clientId, msg.spectatorName);
  break;
```

### handleSpectate 実装

```typescript
private handleSpectate(clientId: string, spectatorName: string): void {
  if (this.spectators.has(clientId)) return; // 重複無視

  if (this.spectators.size >= this.maxSpectators) {
    this.sendToClient(clientId, {
      type: 'spectateResponse',
      accepted: false,
      reason: 'Spectator slots full',
    });
    return;
  }

  const spectatorId = this.findNextSpectatorId();
  this.spectators.set(clientId, { id: spectatorId, name: spectatorName });

  this.sendToClient(clientId, {
    type: 'spectateResponse',
    accepted: true,
    spectatorId,
    players: this.getPlayerList(),
    gameSettings: this.gameSettings,
  });

  // ホストUI + 全クライアントに観戦者数を通知
  this.broadcastSpectatorCount();
}
```

### 観戦者の切断処理

```typescript
private handleClientDisconnected(clientId: string): void {
  // 既存のプレイヤー切断処理
  if (this.players.has(clientId)) {
    this.players.delete(clientId);
    this.notifyPlayersChanged();
    this.sendToAll({ type: 'playerUpdate', players: this.getPlayerList() });
  }

  // 観戦者の切断処理（追加）
  if (this.spectators.has(clientId)) {
    this.spectators.delete(clientId);
    this.broadcastSpectatorCount();
  }
}
```

### 観戦者数のブロードキャスト

```typescript
private broadcastSpectatorCount(): void {
  this._onSpectatorCountChanged?.(this.spectators.size);
  this.sendToAll({ type: 'spectatorUpdate', spectatorCount: this.spectators.size });
}
```

### 公開API追加

```typescript
// 新規コールバック
private _onSpectatorCountChanged: ((count: number) => void) | null = null;

onSpectatorCountChanged(callback: (count: number) => void): void {
  this._onSpectatorCountChanged = callback;
}

getSpectatorCount(): number {
  return this.spectators.size;
}

getSpectatorClientIds(): string[] {
  return Array.from(this.spectators.keys());
}
```

### gameStart時の観戦者への通知

`startGame()` 内で、観戦者にも `gameStart` メッセージを送信する:

```typescript
startGame(): void {
  // ... 既存のバリデーション ...
  this.state = 'gameStarting';
  const blinds = { sb: this.gameSettings.sb, bb: this.gameSettings.bb };
  this.sendToAll({  // sendToAllはプレイヤー全員に送信
    type: 'gameStart',
    blinds,
    initialChips: this.gameSettings.initialChips,
  });
  // 観戦者にも個別にgameStartを送信
  for (const clientId of this.spectators.keys()) {
    this.sendToClient(clientId, {
      type: 'gameStart',
      blinds,
      initialChips: this.gameSettings.initialChips,
    });
  }
  this._onGameStart?.(blinds);
}
```

**Note:** 既存の`sendToAll`はプレイヤーのみに送信する設計のため、観戦者への通知は個別送信で行う。トランスポート層の`sendToAll`はBLE Notifyで全接続端末に送信するため、観戦者もgameState特性のNotifyは自動的に受信する。ただし、ロビーフェーズの`sendToAll`はlobby特性経由なので、観戦者への個別送信が必要。

---

## 3. BleHostGameService の変更

### 観戦者管理の追加

```typescript
export class BleHostGameService implements GameService {
  // ... 既存フィールド ...
  private spectatorClientIds = new Set<string>(); // 観戦者のclientId一覧

  constructor(
    private transport: BleHostTransport,
    private clientSeatMap: Map<string, number>,
    spectatorClientIds?: string[],  // 新規パラメータ
  ) {
    // ... 既存の初期化 ...
    if (spectatorClientIds) {
      spectatorClientIds.forEach(id => this.spectatorClientIds.add(id));
    }
  }
}
```

### アクション受信のガード強化

既存の `handleClientMessage` に観戦者チェックを追加:

```typescript
private handleClientMessage(clientId: string, charId: string, data: Uint8Array): void {
  if (charId !== 'playerAction') return;

  // 観戦者からのアクションは無視
  if (this.spectatorClientIds.has(clientId)) return;

  // ... 既存の処理 ...
}
```

### broadcastState — 観戦者への配信

既存の`broadcastState()`は`transport.sendToAll('gameState', ...)`を使用しており、BLE NotifyはSubscribe済みの全端末に配信される。観戦者もgameState特性をSubscribeするため、**追加のコード変更なしで観戦者に状態が配信される**。

### sendPrivateHands — 観戦者には送信しない

既存の`sendPrivateHands()`は`clientSeatMap`のエントリのみにprivateHandを送信する。観戦者は`clientSeatMap`に含まれないため、**追加のコード変更なしで手札は観戦者に送信されない**。

### 観戦者の切断処理

```typescript
private handleClientDisconnected(clientId: string): void {
  // 観戦者の切断は単純に除去（フリーズ処理不要）
  if (this.spectatorClientIds.has(clientId)) {
    this.spectatorClientIds.delete(clientId);
    return;  // プレイヤーの切断処理をスキップ
  }

  // ... 既存のプレイヤー切断処理 ...
}
```

### ゲーム中の観戦者追加

ゲーム進行中に新たに観戦者が接続した場合に対応するメソッドを追加:

```typescript
addSpectator(clientId: string): void {
  this.spectatorClientIds.add(clientId);
  // 最新のstateUpdateを個別送信（同期）
  if (this.gameLoop) {
    const state = this.gameLoop.getState();
    const msg: GameHostMessage = {
      type: 'stateUpdate',
      // ... 既存のbroadcastStateと同じメッセージ構築 ...
    };
    this.sendToClient(clientId, 'gameState', msg);
  }
}
```

---

## 4. BleSpectatorGameService（新規）

### 設計方針

`BleClientGameService`をベースに、アクション送信を無効化し、手札管理を除外した観戦専用のGameService実装。

### クラス設計

```typescript
export class BleSpectatorGameService implements GameService {
  private chunkManager = new ChunkManager();
  private currentState: GameState | null = null;
  private lastShowdownResult: ShowdownResult | null = null;
  private listeners = new Set<(state: GameState) => void>();

  constructor(
    private transport: BleClientTransport,
  ) {
    this.transport.onMessageReceived((charId, data) => {
      this.handleMessage(charId, data);
    });
  }
}
```

### GameServiceインターフェース実装

| メソッド | 動作 |
|---|---|
| `getState()` | `currentState`をそのまま返す（手札置換なし — 全プレイヤーのcardsは空配列） |
| `getActionInfo(seat)` | ダミー値を返す（観戦者はアクション不可） |
| `startGame(...)` | no-op |
| `startRound()` | no-op |
| `handleAction(seat, action)` | `{ valid: false, reason: 'Spectator cannot act' }` を返す |
| `resolveShowdown()` | `lastShowdownResult` を返す |
| `prepareNextRound()` | no-op |
| `subscribe(listener)` | リスナー登録。`() => void` を返す |

### 実装

```typescript
getState(): GameState {
  if (!this.currentState) throw new Error('Game not started');
  return this.currentState;  // 全プレイヤーの手札は空配列のまま
}

getActionInfo(_seat: number): ActionInfo {
  return {
    canCheck: false,
    callAmount: 0,
    minRaise: 0,
    maxRaise: 0,
    canRaise: false,
  };
}

startGame(_playerNames: string[], _blinds: Blinds, _initialChips: number, _savedChips?: Record<string, number>): void {
  // no-op
}

startRound(): void {
  // no-op
}

handleAction(_seat: number, _action: PlayerAction): ActionResult {
  return { valid: false, reason: 'Spectator cannot act' };
}

resolveShowdown(): ShowdownResult {
  if (!this.lastShowdownResult) {
    return { winners: [], hands: [] };
  }
  const result = this.lastShowdownResult;
  this.lastShowdownResult = null;
  return result;
}

prepareNextRound(): void {
  // no-op
}

subscribe(listener: (state: GameState) => void): () => void {
  this.listeners.add(listener);
  return () => { this.listeners.delete(listener); };
}
```

### メッセージハンドリング

```typescript
private handleMessage(charId: string, data: Uint8Array): void {
  const json = this.chunkManager.decode(charId, data);
  if (!json) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return;
  }

  if (charId === 'gameState') {
    this.handleGameStateMessage(parsed);
  }
  // privateHand は無視（観戦者はSubscribeしないが、念のためハンドラなし）
}

private handleGameStateMessage(parsed: unknown): void {
  const msg = validateGameHostMessage(parsed);
  if (!msg) return;

  switch (msg.type) {
    case 'stateUpdate':
      this.currentState = {
        seq: msg.seq,
        phase: msg.phase,
        community: msg.community,
        pots: msg.pots,
        currentBet: msg.currentBet,
        activePlayer: msg.activePlayer,
        dealer: msg.dealer,
        blinds: msg.blinds,
        players: msg.players.map(p => ({
          seat: p.seat,
          name: p.name,
          chips: p.chips,
          status: p.status,
          bet: p.bet,
          cards: p.cards,  // 常に空配列（ホストがストリップ済み）
        })),
        foldWin: msg.foldWin,
      };
      this.notifyListeners();
      break;

    case 'showdownResult':
      this.lastShowdownResult = {
        winners: msg.winners,
        hands: msg.hands,
      };
      this.notifyListeners();
      break;

    case 'roundEnd':
      break;

    case 'rematch':
      this.lastShowdownResult = null;
      this.notifyListeners();
      break;
  }
}

private notifyListeners(): void {
  if (!this.currentState) return;
  const state = this.getState();
  this.listeners.forEach(l => l(state));
}
```

### BleClientGameServiceとの差分

| 項目 | BleClientGameService | BleSpectatorGameService |
|---|---|---|
| `mySeat` | あり | なし |
| `myCards` | あり（privateHand受信） | なし |
| `getState()` | 自分の手札を置換 | そのまま返す |
| `handleAction()` | 楽観的に`{valid: true}` + BLE送信 | `{valid: false}` |
| `privateHand`特性 | ハンドリングあり | 無視 |
| `minRaiseSize` / `frozenSeats` | 保持 | 不要（UIで使用しない） |

---

## 5. GameContext の変更

### モード追加

```typescript
// GameContextValue
mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client' | 'ble-spectator';

// GameProviderProps
mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client' | 'ble-spectator';
mySeat?: number;  // ble-clientモードでのプレイヤーシート番号（自動観戦遷移用）
```

### effectiveMode のステート化と ref

`mode` プロップはゲーム開始時の初期値として受け取り、内部では `effectiveMode` ステートで管理する。これにより、プレイヤーが飛んだ際に `ble-client` → `ble-spectator` へ動的に遷移できる。

```typescript
const [effectiveMode, setEffectiveMode] = useState(mode);
const effectiveModeRef = useRef(effectiveMode);
// effectiveModeRef を常に最新に保つ
useEffect(() => { effectiveModeRef.current = effectiveMode; }, [effectiveMode]);
```

コンテキストに公開する `mode` は `effectiveMode` を使用する（`ActionButtons` など各コンポーネントは `useGame().mode` 経由で `effectiveMode` を受け取る）。

**元の `mode` プロップの扱い:** `mode` プロップ（ルートパラメータから渡される初期値）は変化しない。`handleTimeout`・`useActionTimer` など `mode` プロップを直接参照しているコードは修正不要。例えば `handleTimeout` が `mode === 'ble-client'` でアーリーリターンする場合、遷移後も `mode` プロップは `'ble-client'` のままなので正しく動作する。

### 観戦モード固有の処理

subscribe ハンドラ内では **`effectiveModeRef.current`** を使用し、stale closure を回避する。

```typescript
// subscribe ハンドラ内 — showdown検出（BLEクライアントと観戦者に共通）
if (
  (effectiveModeRef.current === 'ble-client' || effectiveModeRef.current === 'ble-spectator') &&
  prevPhaseRef.current !== 'showdown' &&
  newState.phase === 'showdown'
) {
  const sdResult = serviceRef.current.resolveShowdown();
  if (sdResult.winners.length > 0) {
    setShowdownResult(sdResult);
  }
}

// rematch検出も同様
if (
  (effectiveModeRef.current === 'ble-client' || effectiveModeRef.current === 'ble-spectator') &&
  newState.phase === 'preflop' &&
  prevPhaseRef.current !== 'preflop'
) {
  setShowdownResult(null);
}

// 自動観戦遷移 — 自分のシートが 'out' になった場合
// mySeat はルートパラメータ由来の安定したプロップで、プロバイダの生存期間中に変化しない。
// そのため effectiveModeRef と異なり ref でラップする必要はない。
if (effectiveModeRef.current === 'ble-client' && mySeat !== undefined) {
  const myPlayer = newState.players.find(p => p.seat === mySeat);
  if (myPlayer?.status === 'out') {
    setEffectiveMode('ble-spectator');
  }
}
```

### doAction の観戦者ガード

```typescript
// effectiveMode が変わるたびに useCallback が再生成されるため、ref は不要
const doAction = useCallback((seat: number, action: PlayerAction): ActionResult => {
  if (effectiveMode === 'ble-spectator') {
    return { valid: false, reason: 'Spectator cannot act' };
  }
  // ... 既存の処理 ...
}, [effectiveMode]);
```

---

## 6. UI の変更

### game.tsx — 観戦者モードの追加

```typescript
// params に追加
mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client' | 'ble-spectator';

// service初期化に追加
if (mode === 'ble-spectator') {
  const transport = getClientTransport()!;
  return new BleSpectatorGameService(transport);
}
```

### viewingSeat の決定

観戦者にはseatがないため、`viewingSeat`はseat 0（テーブル下部 = ホスト位置）を固定で使用する。これにより既存の`TableLayout`のseat配置ロジックがそのまま動作する。

```typescript
// params.mode はルートパラメータの初期値（GameContext の effectiveMode とは別物）
const viewingSeat = (params.mode === 'ble-host' || params.mode === 'ble-spectator') ? 0 : Number(params.seat ?? '0');
```

**自動観戦遷移との関係:** チップを失って `ble-client` → `ble-spectator` へ自動遷移したプレイヤーは、`params.mode` が `'ble-client'` のまま変わらない。そのため `viewingSeat` は元のシート番号を保持し、テーブル上の自分のシート位置は変わらない（0 に飛ばない）。ロビーから直接「観戦する」で接続した場合のみ `params.mode === 'ble-spectator'` となり `viewingSeat = 0` になる。

### ActionButtons — 観戦者インジケータ

`ActionButtons`コンポーネントで観戦モードを検出し、アクションボタンの代わりに「観戦中」インジケータを表示する:

```typescript
export function ActionButtons() {
  const { state, mode, viewingSeat, doAction, getActionInfo } = useGame();
  // ...

  // 観戦者: アクションボタンの代わりにインジケータを表示
  if (mode === 'ble-spectator') {
    return (
      <View style={styles.container}>
        <View style={styles.spectatorIndicator}>
          <Text style={styles.spectatorText}>観戦中</Text>
        </View>
      </View>
    );
  }

  // ... 既存のアクションボタン描画 ...
}
```

### スタイル追加

```typescript
// ActionButtons styles に追加
spectatorIndicator: {
  paddingVertical: 16,
  alignItems: 'center',
},
spectatorText: {
  color: Colors.subText,
  fontSize: 16,
  fontWeight: '600',
},
```

### PlayerSeat — ホールカード非表示

観戦者モードでは全プレイヤーのホールカードが空配列として配信される。既存の`PlayerSeat`コンポーネントは`cards: []`の場合にカードを非表示にする（または裏面表示する）ため、追加の変更は不要。

ショーダウン時は`showdownResult.hands`に手札情報が含まれるため、`ResultOverlay`で表示される。これも既存の挙動と同じ。

### ResultOverlay — 観戦者モード

観戦者はラウンド間の操作ができないため、BLEクライアントと同じ挙動にする:

```typescript
// ResultOverlay 内
if (mode === 'ble-spectator') {
  // BLEクライアントと同じ: 「次のラウンドを待っています...」テキスト + 「ロビーに戻る」ボタン
}
```

gameOver時:
```
ゲームが終了しました
[ロビーに戻る]
```

### BleHostLobby — 観戦者数の表示

ホストのロビーUIに観戦者数を表示する:

```typescript
// BleHostLobby に追加
const [spectatorCount, setSpectatorCount] = useState(0);

// useEffect内
host.onSpectatorCountChanged((count) => setSpectatorCount(count));

// JSX内（プレイヤーリストの下）
{spectatorCount > 0 && (
  <Text style={styles.spectatorInfo}>
    観戦者: {spectatorCount}人
  </Text>
)}
```

### BleJoinLobby — 観戦参加オプション

ロビーのホスト選択後、「参加」と「観戦」の2つのオプションを提供する:

**Phase追加:**

```typescript
type Phase = 'scanning' | 'connecting' | 'roleSelect' | 'waiting' | 'disconnected';
```

**ホスト選択後のフロー:**

```
scanning → (ホスト選択) → connecting → (接続成功) → roleSelect
                                                      ├── [ゲームに参加] → join送信 → waiting
                                                      └── [観戦する]     → spectate送信 → waiting (spectator)
```

**roleSelect画面:**

```
┌─────────────────────────────────┐
│                                 │
│     ロビーに接続しました          │
│                                 │
│  [ゲームに参加]                  │  ← Colors.active (cyan)
│  [観戦する]                      │  ← Colors.subText border
│                                 │
│  [キャンセル]                    │
└─────────────────────────────────┘
```

**LobbyClient側の変更:**

```typescript
// LobbyClient に追加
spectate(): void {
  // spectateメッセージをホストに送信
  this.sendToHost({ type: 'spectate', protocolVersion: PROTOCOL_VERSION, spectatorName: this.playerName });
}

onSpectateResult(callback: (result: SpectateResult) => void): void {
  this._onSpectateResult = callback;
}
```

**ble-join.tsx → game.tsx への遷移パラメータ（観戦時）:**

```typescript
router.push({
  pathname: '/game',
  params: {
    mode: 'ble-spectator',
    sb: String(config.blinds.sb),
    bb: String(config.blinds.bb),
    initialChips: String(config.initialChips),
  },
});
```

---

## 7. ゲーム中の観戦者途中参加

### フロー

ゲーム進行中に新しい端末が観戦参加するケース:

```
新端末: BLEスキャン → ホスト発見 → 接続
  ├── LobbyHost.handleSpectate() → spectateResponse返却
  ├── BleHostGameService.addSpectator(clientId) → 最新stateUpdate個別送信
  └── 観戦者側: stateUpdate受信 → UI同期
```

### ホスト側の対応

ゲームフェーズ中にlobby特性経由で`spectate`メッセージが届いた場合、`LobbyHost`は受け付けるが、`join`メッセージは拒否する:

```typescript
// LobbyHost.handleJoin に追加
if (this.state === 'gameStarting') {
  this.sendToClient(clientId, {
    type: 'joinResponse',
    accepted: false,
    reason: 'Game already in progress',
  });
  return;
}

// LobbyHost.handleSpectate はゲーム中も受け付ける
private handleSpectate(clientId: string, spectatorName: string): void {
  // ... 既存のロジック（ゲーム中も動作） ...

  // ゲーム中の場合、BleHostGameServiceに観戦者を追加通知
  this._onSpectatorJoined?.(clientId);
}
```

### コールバック追加

```typescript
// LobbyHost
private _onSpectatorJoined: ((clientId: string) => void) | null = null;

onSpectatorJoined(callback: (clientId: string) => void): void {
  this._onSpectatorJoined = callback;
}
```

`game.tsx`（BLEホストモード）で`lobbyHost.onSpectatorJoined`をリッスンし、`BleHostGameService.addSpectator(clientId)`を呼び出す。

**Note:** ゲーム中もlobby特性は引き続き有効にする必要がある。現在の設計ではtransportの`onMessageReceived`がゲームサービスに再登録されるが、lobby特性のメッセージはcharId(`'lobby'`)で識別可能なため、game serviceは無視する。LobbyHostインスタンスを保持し、lobby特性のメッセージをLobbyHostにルーティングする仕組みが必要。

### transportRegistry の拡張

ゲーム中もLobbyHostインスタンスにアクセスするため、`transportRegistry`にLobbyHost参照を追加:

```typescript
// transportRegistry.ts に追加
let lobbyHostRef: LobbyHost | null = null;
export function setLobbyHost(host: LobbyHost): void { lobbyHostRef = host; }
export function getLobbyHost(): LobbyHost | null { return lobbyHostRef; }
export function clearLobbyHost(): void { lobbyHostRef = null; }
```

---

## 8. プレイヤー飛び → 自動観戦モード遷移

### 概要

BLEクライアントプレイヤーのチップが0になり `status: 'out'` に遷移した瞬間、そのデバイスの `effectiveMode` を自動的に `'ble-spectator'` に切り替える。

### 設計方針

- **サービス層の変更なし**: `BleClientGameService` をそのまま使用継続。`status: 'out'` のプレイヤーにはホストから `privateHand` が送信されないため、手札情報は自動的に空配列になる（追加の処理不要）
- **`effectiveMode` ステートで管理**: Section 5 で導入した `effectiveMode` により、`mode` プロップを変えずに遷移できる
- **`mySeat` は game.tsx から渡す**: `game.tsx` で `viewingSeat` として持っている値を `GameProvider` の `mySeat` プロップに渡す

### game.tsx の変更

```typescript
// ble-clientモードでGameProviderに mySeat を渡す
<GameProvider
  service={service}
  mode={params.mode}
  mySeat={params.mode === 'ble-client' ? Number(params.seat ?? '0') : undefined}
>
```

### UXフロー

```
ラウンド終了 → resolveShowdown() → prepareNextRound()
  → stateUpdate送信（自分のstatus: 'out'）
  → クライアントでstateUpdate受信
  → effectiveMode: 'ble-client' → 'ble-spectator' に遷移
  → ActionButtons: 「観戦中」インジケータ表示
  → ResultOverlay: 「次のラウンドを待っています...」表示
  → 以降のラウンド: 観戦モードとして継続
  → ゲーム終了時: 「ゲームが終了しました」＋「ロビーに戻る」
```

### ホスト側の変更

ホストの `BleHostGameService` は `status: 'out'` のプレイヤーを `clientSeatMap` に残したままで構わない。以降のラウンドでそのプレイヤーには `privateHand` が送信されない（`startRound()` の対象外）ため、実質的に観戦状態となる。

明示的な `spectatorClientIds` への移動は**不要**（クライアント主導の遷移であるため）。

**飛んだプレイヤーが残留する `clientSeatMap` からのアクション送信について:** 万が一飛んだプレイヤーのデバイスが遅延アクションを送信しても、ゲームエンジン側で無視される。`BettingRound` はアクションを処理する前に `activePlayer === seat` を検証しており、`status: 'out'` のプレイヤーが `activePlayer` になることはないため、追加のガードは不要。

---

## 9. ディレクトリ構成

### 新規ファイル

```
src/services/ble/
├── BleSpectatorGameService.ts   — (新規) 観戦者側GameService実装
```

### 変更ファイル

```
src/services/ble/
├── LobbyProtocol.ts             — spectate/spectateResponse/spectatorUpdate 型追加
├── LobbyHost.ts                 — spectators管理、handleSpectate追加
├── LobbyClient.ts               — spectate()メソッド追加
├── BleHostGameService.ts        — spectatorClientIds管理、addSpectator追加
├── transportRegistry.ts         — LobbyHost参照の追加

src/contexts/
├── GameContext.tsx               — 'ble-spectator'モード追加、effectiveMode/mySeat対応

src/components/
├── actions/ActionButtons.tsx     — 観戦者インジケータ追加
├── result/ResultOverlay.tsx      — 観戦者モード対応
├── lobby/BleHostLobby.tsx       — 観戦者数の表示追加
├── lobby/BleJoinLobby.tsx       — roleSelect画面追加

app/
├── game.tsx                      — ble-spectatorモードのservice生成、mySeatプロップ追加
```

---

## 10. Test Strategy

### テストファイル

```
tests/ble/
├── BleSpectatorGameService.test.ts        — (新規)
├── LobbyProtocol.test.ts                 — (既存拡張) spectateメッセージのバリデーション
├── LobbyHost.test.ts                     — (既存拡張) 観戦者管理テスト
├── BleHostGameService.test.ts            — (既存拡張) 観戦者関連テスト
└── integration/
    ├── BleSpectatorFlow.test.ts           — (新規) 観戦フロー結合テスト
    └── BleAutoSpectatorTransition.test.ts — (新規) 自動観戦遷移結合テスト

tests/contexts/
└── GameContext.test.ts                   — (既存拡張) effectiveMode遷移テスト
```

### テスト内容

| テスト | 検証項目 |
|--------|----------|
| LobbyProtocol | `validateClientMessage`: spectateメッセージの正常パース、不正データ拒否 |
| LobbyProtocol | `validateHostMessage`: spectateResponse（accepted/rejected）、spectatorUpdateのバリデーション |
| LobbyHost | spectateメッセージ受信 → spectators追加 + spectateResponse送信 |
| LobbyHost | 観戦者数上限（4人）到達時の拒否 |
| LobbyHost | 観戦者切断 → spectators除去 + spectatorUpdate配信 |
| LobbyHost | gameStart時に観戦者にもgameStartメッセージ送信 |
| LobbyHost | ゲーム中のspectateメッセージ受理、joinメッセージ拒否 |
| BleHostGameService | 観戦者clientIdからのplayerActionを無視 |
| BleHostGameService | 観戦者切断時にfrozenSeats処理をスキップ |
| BleHostGameService | addSpectator → 最新stateUpdate個別送信 |
| BleSpectatorGameService | stateUpdate受信 → getState()反映（手札は全て空配列） |
| BleSpectatorGameService | showdownResult受信 → resolveShowdown()で手札情報を返却 |
| BleSpectatorGameService | handleAction → `{valid: false}` 返却、BLE送信なし |
| BleSpectatorGameService | rematch受信 → lastShowdownResultクリア |
| BleSpectatorGameService | subscribe → stateUpdate受信時のリスナー通知 |
| BleSpectatorFlow結合 | ロビーからの観戦参加 → gameStart → stateUpdate受信 → showdown表示 |
| BleSpectatorFlow結合 | ゲーム中の途中観戦参加 → 最新state同期 |
| BleSpectatorFlow結合 | プレイヤー + 観戦者混在のフルフロー |
| GameContext | ble-clientのmySeatプレイヤーがoutになった場合、effectiveModeがble-spectatorに遷移 |
| GameContext | 他のプレイヤーがoutになってもeffectiveModeは変化しない |
| GameContext | ble-host/hotseatモードではoutになってもeffectiveMode変化なし |
| BleAutoSpectatorTransition結合 | 3人対戦→1人飛び→残り2人でゲーム継続 → 飛んだプレイヤーのdeviceがble-spectatorに遷移 |
| BleAutoSpectatorTransition結合 | 遷移後のラウンドでdoActionが `{valid: false}` を返す |
| BleAutoSpectatorTransition結合 | 遷移後のshowdownでResultOverlayが「次のラウンドを待っています...」を表示 |

### モック方針

- `BleSpectatorGameService`のテストでは`MockBleClientTransport`を使用（`BleClientGameService`テストと同じパターン）
- 結合テストでは`MockBleNetwork`ヘルパーでHost-Client-Spectator間のメッセージをブリッジ
- LobbyHostの観戦者テストでは`MockBleHostTransport`を使用（既存パターン準拠）

---

## 11. Scope

### 今回のスコープ

- `LobbyProtocol.ts`: spectate/spectateResponse/spectatorUpdateメッセージ型・バリデーション追加
- `LobbyHost.ts`: 観戦者管理（handleSpectate、切断処理、spectatorCount通知）
- `LobbyClient.ts`: spectate()メソッド追加
- `BleSpectatorGameService.ts`: 観戦者側GameService実装（新規）
- `BleHostGameService.ts`: spectatorClientIds管理、addSpectator、観戦者からのアクション無視
- `transportRegistry.ts`: LobbyHost参照の追加
- `GameContext.tsx`: 'ble-spectator'モード追加、effectiveMode/mySeat対応、自動観戦遷移ロジック
- `ActionButtons.tsx`: 観戦者インジケータ
- `ResultOverlay.tsx`: 観戦者モード対応
- `BleHostLobby.tsx`: 観戦者数表示
- `BleJoinLobby.tsx`: roleSelect画面（参加/観戦の選択）
- `game.tsx`: ble-spectatorモードのservice生成、mySeatプロップ追加
- 上記の全Jestテスト

### スコープ外

- 観戦者チャット機能
- 観戦者の名前一覧表示（ホストUIにはカウントのみ表示）
- 観戦者のキック機能
- 観戦者 → プレイヤーへの途中昇格
- 観戦者向けのハンドヒストリー（過去ラウンドの振り返り）
- 実BLEライブラリとの結合テスト
