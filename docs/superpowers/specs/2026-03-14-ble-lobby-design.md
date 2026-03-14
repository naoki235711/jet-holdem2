# BLE Lobby Implementation Design — Phase 1

## Overview

BLE通信を抽象化し、ロビーのステートマシン・プロトコル処理をBLEライブラリに依存せずに実装・テストする。実際のBLEライブラリ結合やUI、実機ビルドは後続イテレーションで行う。

## Context

### 現状
- Game Engine、UI、Hotseatモードは実装済み・テスト済み
- `GameService` インターフェース + `LocalGameService` パターンが確立済み
- BLEライブラリ未導入、Expo Managed Workflowで稼働中

### 制約
- 開発環境: Windows (WSL2)
- テスト端末: iOS 2台
- Apple Developer Program未加入（クラウドMac + Xcode直接インストール予定）
- BLEの実機テストは後続イテレーションで実施

### 方針
ロビーロジックを先行実装し、BLEライブラリとの結合は後続イテレーションで行う（アプローチB）。これにより：
- Jestで完全にテスト可能
- BLE結合時に問題の切り分けが容易
- Windows環境で大半の開発が可能

---

## 1. Architecture

### ディレクトリ構成

```
src/services/ble/
├── BleTransport.ts         — BLE通信の抽象化インターフェース
├── MockBleTransport.ts     — テスト用モック実装
├── LobbyHost.ts            — ホスト側ロビーステートマシン
├── LobbyClient.ts          — クライアント側ロビーステートマシン
├── LobbyProtocol.ts        — メッセージ型定義・バリデーション
└── ChunkManager.ts         — メッセージ分割・再組立

tests/ble/
├── LobbyProtocol.test.ts
├── LobbyHost.test.ts
├── LobbyClient.test.ts
├── ChunkManager.test.ts
└── integration/
    └── LobbyFlow.test.ts
```

### レイヤー構成

```
UI (LobbyScreen)
    ↕ コールバック
LobbyHost / LobbyClient (ステートマシン)
    ↕ encode/decode
ChunkManager (チャンク分割・再組立)
    ↕ send/receive
BleTransport (抽象化インターフェース)
    ↕
MockBleTransport (テスト) / BleTransportImpl (将来)
```

---

## 2. BleTransport Interface

BLEライブラリへの依存を切り離す抽象化レイヤー。

```typescript
interface BleTransport {
  // ホスト側（Peripheral）
  startAdvertising(serviceName: string): Promise<void>;
  stopAdvertising(): Promise<void>;
  onClientConnected(callback: (clientId: string) => void): void;
  onClientDisconnected(callback: (clientId: string) => void): void;
  onMessageReceived(callback: (clientId: string, characteristicId: string, data: Uint8Array) => void): void;
  sendToClient(clientId: string, characteristicId: string, data: Uint8Array): Promise<void>;
  sendToAll(characteristicId: string, data: Uint8Array): Promise<void>;

  // クライアント側（Central）
  startScanning(serviceUuid: string): Promise<void>;
  stopScanning(): Promise<void>;
  onHostDiscovered(callback: (hostId: string, hostName: string) => void): void;
  connectToHost(hostId: string): Promise<void>;
  disconnect(): Promise<void>;
  onMessageReceived(callback: (characteristicId: string, data: Uint8Array) => void): void;
  sendToHost(characteristicId: string, data: Uint8Array): Promise<void>;
}
```

**設計判断:**
- ホストとクライアントで役割が大きく異なるため、実装時は `BleHostTransport` / `BleClientTransport` に分離する可能性あり。インターフェース定義の段階では統一しておく
- `data` は `Uint8Array`。BLEのネイティブなデータ型に合わせる。JSON文字列との変換は `ChunkManager` が担当
- `characteristicId` を `onMessageReceived` コールバックに含めることで、将来のGameState/PrivateHand/PlayerAction等の区別にも対応可能
- `clientId` はBLE接続IDに対応し、seat割り当ての鍵になる

---

## 3. Lobby Protocol Messages

設計ドキュメント（2026-03-13-jet-holdem-design.md）のLobby Control Protocolを型定義に落とす。

```typescript
// クライアント → ホスト
type LobbyClientMessage =
  | { type: 'join'; protocolVersion: number; playerName: string }
  | { type: 'ready' };  // seatフィールドは不要（ホストがclientIdからseatを特定、なりすまし防止）

// ホスト → クライアント
type LobbyHostMessage =
  | { type: 'joinResponse'; accepted: true; seat: number; players: LobbyPlayer[] }
  | { type: 'joinResponse'; accepted: false; reason: string }
  | { type: 'playerUpdate'; players: LobbyPlayer[] }
  | { type: 'gameStart'; blinds: { sb: number; bb: number } }
  | { type: 'lobbyClosed'; reason: string };  // ホストがロビーを閉じた時の通知

type LobbyPlayer = {
  seat: number;
  name: string;
  ready: boolean;
};
```

**バリデーション:**
- `validateClientMessage(data: unknown): LobbyClientMessage | null`
- `validateHostMessage(data: unknown): LobbyHostMessage | null`
- パース失敗時は `null` を返し、呼び出し側で無視（不正メッセージに対する防御）
- `protocolVersion: 1` を固定で検証。不一致なら `accepted: false` で拒否

**Note:** `ready` メッセージに `seat` フィールドを含めない。親設計ドキュメントの `PlayerAction` と同様に、ホスト側でBLE接続IDからseatを特定することで、なりすましを防止する。

---

## 4. LobbyHost State Machine

### 状態遷移

```
IDLE → ADVERTISING → WAITING_FOR_PLAYERS → GAME_STARTING
        (広告開始)    (参加受付中)           (全員ready+ホスト開始)
```

### インターフェース

```typescript
class LobbyHost {
  private state: 'idle' | 'advertising' | 'waitingForPlayers' | 'gameStarting';
  private players: Map<string, LobbyPlayer>;       // clientId → LobbyPlayer（seat情報を含む）
  private transport: BleTransport;

  constructor(transport: BleTransport, hostName: string);

  // ホスト自身はseat 0に固定で着席。最大4人（ホスト含む）
  start(): Promise<void>;                           // → ADVERTISING → WAITING_FOR_PLAYERS
  stop(): Promise<void>;                            // lobbyClosed送信 → 広告停止、全接続切断

  // BLEイベントハンドラ（transportのコールバックから呼ばれる）
  handleClientConnected(clientId: string): void;
  handleClientDisconnected(clientId: string): void;
  handleMessage(clientId: string, data: string): void;

  // ホストUI操作
  startGame(): void;                                // 2人以上 + 全員ready → gameStart送信

  // UI向けコールバック
  onPlayersChanged(callback: (players: LobbyPlayer[]) => void): void;
  onGameStart(callback: (blinds: { sb: number; bb: number }) => void): void;
  onError(callback: (error: string) => void): void;
}
```

### 主要ロジック

- **クライアント接続時:** 空きseat（1〜3）を割り当て、`joinResponse` を返す。ホスト含めて4人を超える場合は拒否
- **重複join受信時:** 既にjoin済みのclientIdからの `join` メッセージは無視する
- **`ready` 受信時:** clientIdからseatを特定してready化、全員に `playerUpdate` 配信
- **切断時:** プレイヤーをリストから除去、全員に `playerUpdate` 配信、seatを解放
- **`startGame()`:** 全員readyかつ2人以上（ホスト含む）の場合のみ `gameStart` を全員に送信
- **`stop()`:** 全クライアントに `lobbyClosed` メッセージを送信してから接続を切断

### エラーコールバックのトリガー条件

`onError` は以下の条件で発火する：
- トランスポート層のエラー（広告開始失敗、メッセージ送信失敗）
- `startGame()` の条件未達（プレイヤー不足、全員readyでない）

---

## 5. LobbyClient State Machine

### 状態遷移

```
IDLE → SCANNING → CONNECTING → JOINED → READY → GAME_STARTING
       (ホスト探索)  (接続中)    (参加済)  (準備完了)  (ゲーム開始)
```

### インターフェース

```typescript
class LobbyClient {
  private state: 'idle' | 'scanning' | 'connecting' | 'joined' | 'ready' | 'gameStarting';
  private mySeat: number | null;
  private players: LobbyPlayer[];
  private transport: BleTransport;

  constructor(transport: BleTransport, playerName: string);

  // 操作
  startScanning(): Promise<void>;                      // → SCANNING
  connectToHost(hostId: string): Promise<void>;        // → CONNECTING → join送信
  setReady(): void;                                    // → READY、ready送信
  disconnect(): Promise<void>;                         // → IDLE

  // BLEイベントハンドラ
  handleMessage(data: string): void;

  // UI向けコールバック
  onHostDiscovered(callback: (hostId: string, hostName: string) => void): void;
  onJoinResult(callback: (accepted: boolean, reason?: string) => void): void;
  onPlayersChanged(callback: (players: LobbyPlayer[]) => void): void;
  onGameStart(callback: (blinds: { sb: number; bb: number }) => void): void;
  onDisconnected(callback: () => void): void;
  onError(callback: (error: string) => void): void;
}
```

### 主要ロジック

- **ホスト発見時:** UIにホスト一覧を表示、ユーザーが選択して `connectToHost()`
- **接続成功後:** 自動的に `join` メッセージを送信
- **`joinResponse` 受信:** accepted なら `JOINED` へ遷移しseat保存。rejected ならエラー通知して `IDLE` へ
- **`playerUpdate` 受信:** プレイヤーリスト更新、UIに反映
- **`gameStart` 受信:** `GAME_STARTING` へ遷移、UIにゲーム開始を通知

---

## 6. ChunkManager

### インターフェース

```typescript
class ChunkManager {
  private mtu: number;                    // デフォルト: 185 (iOS最悪ケース)
  private receiveBuffers: Map<string, {   // 送信元ID → バッファ
    chunks: (Uint8Array | null)[];
    total: number;
    timer: ReturnType<typeof setTimeout>;
  }>;

  constructor(mtu?: number);

  // 送信: JSON文字列 → チャンク配列
  encode(json: string): Uint8Array[];
  //   ヘッダ3バイト [chunkIndex, totalChunks, reserved]
  //   ペイロード: MTU - 3 バイト

  // 受信: チャンクを蓄積、全部揃ったらJSON文字列を返す
  decode(senderId: string, chunk: Uint8Array): string | null;
  //   null = まだ未完成
  //   string = 全チャンク揃い、結合・パース済み
  //   5秒タイムアウトで部分バッファ破棄
}
```

### チャンクフォーマット

```
[chunkIndex (1 byte)] [totalChunks (1 byte)] [reserved (1 byte)] [payload]
```

- MTU 185の場合、ペイロードは182バイト/チャンク
- ロビーメッセージ（~200バイト以下）はほぼ1チャンクで収まる
- GameState（~400バイト）を見据えて最初から組み込む

---

## 7. Test Strategy

### テストファイル構成

```
tests/ble/
├── LobbyProtocol.test.ts
├── LobbyHost.test.ts
├── LobbyClient.test.ts
├── ChunkManager.test.ts
└── integration/
    └── LobbyFlow.test.ts
```

### テスト内容

| テスト | 検証項目 |
|--------|----------|
| LobbyProtocol | 正常メッセージのパース、不正JSON拒否、protocolVersion不一致の拒否 |
| LobbyHost | 参加受付→seat割当、4人超の拒否、ready管理、切断時のseat解放、startGame条件（2人以上+全員ready） |
| LobbyClient | ホスト接続→join送信、joinResponse処理、ready送信、gameStart受信、切断処理 |
| ChunkManager | 1チャンク収まるケース、複数チャンク分割・再組立、5秒タイムアウト破棄、MTU境界値 |
| LobbyFlow結合 | Host1台+Client1〜3台のフルフロー（参加→ready→gameStart）、途中切断→再接続 |

### MockBleTransport

- `sendToClient` / `sendToHost` の呼び出しを記録（`sentMessages` 配列で検証可能）
- テスト側からイベントを発火（`simulateClientConnected`, `simulateMessageReceived` 等）
- Host↔Client結合テストでは `MockBleNetwork` ヘルパーを使用:
  - `MockBleNetwork.create(hostMock, clientMocks[])` でMock同士を接続
  - ホストの `sendToClient` がクライアントの `onMessageReceived` を自動発火
  - クライアントの `sendToHost` がホストの `onMessageReceived` を自動発火
  - `clientId` はMock生成時に連番で自動割り当て（`"client-1"`, `"client-2"` 等）

### タイムアウトテスト

ChunkManagerの5秒タイムアウトテストには `jest.useFakeTimers()` を使用し、`jest.advanceTimersByTime(5000)` でタイムアウトを発火させる。

---

## 8. Scope

### 今回のスコープ（BLEロビー Phase 1）

- `BleTransport` インターフェース定義
- `MockBleTransport` 実装
- `LobbyProtocol` メッセージ型・バリデーション
- `LobbyHost` / `LobbyClient` ステートマシン
- `ChunkManager`
- 上記の全Jestテスト

### スコープ外（後続イテレーション）

- `BleTransportImpl`（実際のBLEライブラリ結合）
- Expo Development Build移行・BLEライブラリインストール
- クラウドMac環境構築・実機ビルド
- ロビーUI（ホスト作成画面、スキャン・接続画面）
- ゲームプレイのBLE対応（GameState配信、PrivateHand配信、PlayerAction送信）
- 切断からの復帰（30秒タイムアウト）
- iOS `Info.plist` BLE設定
- Data Persistence（Phase 2）

---

## 9. Future Integration Path

本Phase 1で実装するロビーモジュールは、将来的に以下のように既存アーキテクチャと統合する想定：

- `BleGameService implements GameService` を作成し、`LocalGameService` と同じインターフェースでUIから利用可能にする
- ホスト側: `LobbyHost.onGameStart` → `GameLoop` を生成 → `BleGameService` が `GameLoop` の状態変更をBLE経由で配信
- クライアント側: `LobbyClient.onGameStart` → `BleGameService` がホストからのGameState/PrivateHandをsubscribeしてUIに反映
- 既存の `GameLoop.getPrivateHand(seat)` メソッドは、BLEでの手札配信を見据えた設計になっている
- GameState配信時には `seq`（シーケンス番号）フィールドを追加し、クライアント側でギャップ検出・再送要求を行う
