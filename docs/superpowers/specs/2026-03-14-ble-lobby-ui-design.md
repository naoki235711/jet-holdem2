# BLE Lobby UI Design — Doc 2

## Overview

Phase 1で実装されるBLEロビーロジック（LobbyHost / LobbyClient）に対応するUI層を構築する。既存のロビー画面にモード切替を追加し、BLE固有のフロー（ホスト待機、スキャン・参加）は専用画面に分離する。

## Context

### 前提条件
- Phase 1（BLEロビーロジック）が実装完了していること: LobbyHost, LobbyClient, LobbyProtocol, ChunkManager, MockBleHostTransport / MockBleClientTransport
- 既存UI: LobbyView（Hotseat/Debugモード）、GameScreen、ResultOverlay が実装済み
- GameServiceインターフェース + LocalGameServiceパターンが確立済み
- BleTransportは `BleHostTransport` / `BleClientTransport` に分離済み（役割別インターフェース）
- BleTransportImpl（実BLEライブラリ結合）は未実装。MockBleHostTransport / MockBleClientTransport で開発・テスト

### Phase 1プロトコルへの必要な変更

本Doc 2の実装にあたり、Phase 1の `LobbyProtocol` に以下の拡張が必要:

- `joinResponse` (accepted: true) に `gameSettings: { sb: number; bb: number; initialChips: number }` を追加。クライアントがロビー待機画面でゲーム設定を表示するために必要
- `gameStart` メッセージに `initialChips: number` を追加。game.tsxへの遷移パラメータとして必要

### 制約
- BLEゲームプレイ（BleGameService）はDoc 3スコープ。本ドキュメントではロビー→ゲーム開始の遷移パラメータ定義まで
- ゲーム終了後のフロー（再戦、BLE切断処理）もDoc 3スコープ

---

## 1. Architecture

### アプローチ: ハイブリッド（設定は既存画面、BLEフローは専用ルート）

設定入力は既存ロビー画面のパターンに合うので同居させ、「待機」「スキャン」という非同期で状態変化するフローは専用画面に切り出す。

### 画面遷移フロー

```
app/index.tsx (LobbyView)
  [ローカル]  [ホスト作成]  [ゲーム参加]   ← セグメントコントロール

  ┌─ ローカルタブ ──────────────────────┐
  │  既存フロー（変更なし）              │
  │  [ゲーム開始] → app/game.tsx        │
  └────────────────────────────────────┘

  ┌─ ホスト作成タブ ────────────────────┐
  │  ホスト名: [____]                   │
  │  SB/BB: [5]/[10]  チップ: [1000]   │
  │  [ロビーを作成] → app/ble-host.tsx  │
  └────────────────────────────────────┘

  ┌─ ゲーム参加タブ ────────────────────┐
  │  プレイヤー名: [____]               │
  │  [スキャン開始] → app/ble-join.tsx  │
  └────────────────────────────────────┘

app/ble-host.tsx (ホスト待機画面)
  ┌────────────────────────────────────┐
  │  "ロビー: {hostName}"              │
  │  SB/BB: 5/10  チップ: 1000        │
  │                                    │
  │  Seat 0: HostName (あなた) ✓       │
  │  Seat 1: Player A         ✓       │
  │  Seat 2: (空席)                    │
  │  Seat 3: (空席)                    │
  │                                    │
  │  [ゲーム開始]  [ロビーを閉じる]     │
  │  ※全員Ready+2人以上で開始可能      │
  └────────────────────────────────────┘
  │
  │ ゲーム開始 →
  ▼
app/game.tsx (既存ゲーム画面、変更なし)

app/ble-join.tsx (スキャン・参加画面)
  ┌─ スキャン中 ────────────────────────┐
  │  "ホストを探しています..."           │
  │  ┌─────────────────────┐           │
  │  │ HostName-1          │ ← タップ  │
  │  │ HostName-2          │           │
  │  └─────────────────────┘           │
  │  [キャンセル]                       │
  └────────────────────────────────────┘
  │
  │ ホスト選択 → 接続 → join送信 → joinResponse受信
  ▼
  ┌─ ロビー待機中 ──────────────────────┐
  │  "ロビー: {hostName}"              │
  │  SB/BB: 5/10  チップ: 1000        │
  │                                    │
  │  Seat 0: HostName       ✓         │
  │  Seat 1: あなた          ○         │
  │  Seat 2: (空席)                    │
  │                                    │
  │  [Ready]  [退出]                   │
  └────────────────────────────────────┘
  │
  │ ホストがゲーム開始 →
  ▼
app/game.tsx
```

**ポイント:**
- ホストは自動的にReady（seat 0固定、Phase 1設計準拠）
- クライアントは待機画面で明示的に「Ready」を押す
- ゲーム開始条件（2人以上 + 全員Ready）はLobbyHostが判定、UIはボタンの活性/非活性で反映
- ブラインド・チップの設定値はホストがrouter.pushのparamsで待機画面に渡し、gameStart時にgame.tsxへも引き継ぐ

---

## 2. Directory Structure & Components

### ディレクトリ構成

```
src/components/lobby/
├── LobbyView.tsx            # 既存（モードタブ追加）
├── LobbyModeSelector.tsx    # [ローカル][ホスト作成][ゲーム参加] セグメント
├── HostSetupForm.tsx         # ホスト作成タブの設定フォーム
├── JoinSetupForm.tsx         # ゲーム参加タブ（名前入力 + スキャン開始ボタン）
├── BleHostLobby.tsx          # ホスト待機画面のコンテンツ
├── BleJoinLobby.tsx          # スキャン → 接続 → 待機画面のコンテンツ
├── PlayerSlot.tsx            # 待機画面の1席分の表示（名前、Ready状態）
└── HostList.tsx              # スキャン結果のホストリスト

app/
├── index.tsx                 # 既存（LobbyViewを表示、変更最小限）
├── ble-host.tsx              # 新規ルート（BleHostLobbyを表示）
├── ble-join.tsx              # 新規ルート（BleJoinLobbyを表示）
└── game.tsx                  # 既存（変更なし）
```

### コンポーネント責務

| コンポーネント | 責務 |
|---|---|
| `LobbyModeSelector` | 3タブの切替UI。選択中のモードを親に通知 |
| `HostSetupForm` | ホスト名・SB/BB・チップ入力。「ロビーを作成」ボタン |
| `JoinSetupForm` | プレイヤー名入力。「スキャン開始」ボタン |
| `BleHostLobby` | LobbyHostインスタンスを生成・保持。参加者リスト表示、ゲーム開始/閉じるボタン |
| `BleJoinLobby` | LobbyClientインスタンスを生成・保持。スキャン中→接続→待機の状態遷移をUI反映 |
| `PlayerSlot` | 1席分：名前 + Ready(✓)/未Ready(○)/空席 の表示 |
| `HostList` | 発見されたホストのFlatList。タップで`onSelect(hostId)` |

### LobbyViewの変更

- 既存のモードセレクタ（ホットシート/デバッグ）を`LobbyModeSelector`（ローカル/ホスト作成/ゲーム参加）に置き換え
- ローカルタブ選択時に既存のホットシート/デバッグ切替を表示（既存UIはそのまま残る）
- ホスト作成/ゲーム参加タブ選択時にそれぞれのフォームを表示

---

## 3. State Management

### BleHostLobby の状態管理

```typescript
// app/ble-host.tsx → BleHostLobby コンポーネント内部

const [players, setPlayers] = useState<LobbyPlayer[]>([]);
const [error, setError] = useState<string | null>(null);
const lobbyHost = useRef<LobbyHost | null>(null);

useEffect(() => {
  const transport = new MockBleHostTransport();  // 将来: BleHostTransportImpl
  const host = new LobbyHost(transport, hostName);

  host.onPlayersChanged((players) => setPlayers(players));
  // ホストは自身のルートパラメータからsb/bb/initialChipsを知っているため、
  // onGameStartコールバックの引数は使わず、自身の設定値をそのままgame.tsxに渡す
  host.onGameStart(() => {
    router.push({
      pathname: '/game',
      params: { mode: 'ble-host', sb, bb, initialChips, seat: 0 },
    });
  });
  host.onError((msg) => setError(msg));
  host.start();

  lobbyHost.current = host;
  return () => { host.stop(); };
}, []);
```

### BleJoinLobby の状態管理

```typescript
// app/ble-join.tsx → BleJoinLobby コンポーネント内部

const [phase, setPhase] = useState<'scanning' | 'connecting' | 'waiting' | 'disconnected'>('scanning');
const [hosts, setHosts] = useState<Map<string, string>>(new Map());  // hostId → hostName（重複排除）
const [players, setPlayers] = useState<LobbyPlayer[]>([]);
const [gameSettings, setGameSettings] = useState<{ sb: number; bb: number; initialChips: number } | null>(null);
const [joinError, setJoinError] = useState<string | null>(null);
const lobbyClient = useRef<LobbyClient | null>(null);

useEffect(() => {
  const transport = new MockBleClientTransport();  // 将来: BleClientTransportImpl
  const client = new LobbyClient(transport, playerName);

  // BLEアドバタイズは繰り返されるため、Mapで重複排除
  client.onHostDiscovered((id, name) => setHosts(prev => new Map(prev).set(id, name)));

  // onJoinResultのコールバック拡張（Phase 1プロトコル変更に対応）:
  //   accepted時: gameSettingsを含む
  //   rejected時: reasonを含む
  client.onJoinResult((result) => {
    if (result.accepted) {
      setPhase('waiting');
      setGameSettings(result.gameSettings);
    } else {
      setJoinError(result.reason);
    }
  });

  client.onPlayersChanged((players) => setPlayers(players));
  client.onGameStart((config) => {
    // gameSettingsはonJoinResult時に必ず先行して受信済み
    router.push({
      pathname: '/game',
      params: { mode: 'ble-client', sb: config.blinds.sb, bb: config.blinds.bb, initialChips: config.initialChips, seat: client.mySeat },
    });
  });
  client.onDisconnected(() => setPhase('disconnected'));

  lobbyClient.current = client;
  return () => { client.disconnect(); };
}, []);
```

### Phase 1コールバック拡張の詳細

本Doc 2の実装に伴い、Phase 1の `LobbyClient` コールバックを以下の通り拡張する:

```typescript
// 現在のPhase 1設計
onJoinResult(callback: (accepted: boolean, reason?: string) => void): void;
onGameStart(callback: (blinds: { sb: number; bb: number }) => void): void;

// 拡張後
onJoinResult(callback: (result:
  | { accepted: true; gameSettings: { sb: number; bb: number; initialChips: number } }
  | { accepted: false; reason: string }
) => void): void;
onGameStart(callback: (config: { blinds: { sb: number; bb: number }; initialChips: number }) => void): void;
```

### game.tsx への遷移パラメータ

```typescript
// ローカルモード（既存）
{ playerNames, initialChips, sb, bb, mode: 'hotseat' | 'debug' }

// BLEモード（新規）
{ mode: 'ble-host' | 'ble-client', sb, bb, initialChips, seat }
```

- `mode: 'ble-host'` → game.tsxで将来的にBleGameService（Doc 3スコープ）を生成
- `mode: 'ble-client'` → 同上、seat番号で自分の視点を固定
- Doc 2の時点ではパラメータ形式の定義のみ。BleGameService生成はDoc 3で設計

### ble-host.tsx / ble-join.tsx への遷移パラメータ

```typescript
// ble-host.tsx
{ hostName, sb, bb, initialChips }

// ble-join.tsx
{ playerName }
```

### GameContextの変更

```typescript
// 現在
mode: 'hotseat' | 'debug'

// 変更後
mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client'
```

- `ble-host` / `ble-client` 時はviewingSeatが固定（自分のseat番号）
- PassDeviceScreenは表示しない（端末を渡す必要がないため）
- **Note:** mode型の拡張はDoc 2で定義するが、`ble-host` / `ble-client` 時のgame.tsx内の動作実装はDoc 3スコープ。Doc 2時点ではgame.tsxに遷移するところまで

---

## 4. Error Handling & Edge Cases

### ホスト待機画面（BleHostLobby）

| 状況 | UI表示 |
|---|---|
| ロビー作成成功 | 参加者リスト表示、「待機中...」 |
| クライアント接続 | PlayerSlotにプレイヤー追加 |
| クライアント切断 | PlayerSlotから除去、席を空席に戻す |
| 「ゲーム開始」押下、条件未達 | エラーメッセージを一時表示（「2人以上かつ全員Readyが必要です」、3秒で消去） |
| Transport層エラー | エラーメッセージ表示 + 「ロビーに戻る」ボタン |
| 「ロビーを閉じる」押下 | 確認ダイアログ →「はい」で lobbyClosed送信 → index.tsxに戻る |

### スキャン・参加画面（BleJoinLobby）

| 状況 | UI表示 |
|---|---|
| スキャン中、ホスト未発見 | 「ホストを探しています...」+ スピナー |
| ホスト発見 | HostListにホスト名追加 |
| ホスト選択→接続中 | 「{hostName}に接続中...」+ スピナー |
| join拒否（満席等） | エラーメッセージ + スキャン画面に戻る |
| protocolVersion不一致 | 「アプリのバージョンが異なります」+ スキャン画面に戻る |
| 接続後、ホスト切断 | phase → `disconnected`。「ホストが切断しました」+ 「ロビーに戻る」ボタン |
| lobbyClosed受信 | phase → `disconnected`。「ホストがロビーを閉じました」+ 「ロビーに戻る」ボタン |

### 共通パターン

- エラーメッセージは画面下部にトースト風表示（既存のActionButtonsのエラー表示パターンに準拠）
- 致命的エラー（接続喪失）はモーダルで表示し、ユーザーのアクション（「戻る」ボタン）を待つ
- 「ロビーに戻る」は必ずcleanup（transport停止、接続切断）を実行してからindex.tsxに遷移

---

## 5. Test Strategy

### テストファイル構成

```
tests/ui/
├── LobbyModeSelector.test.tsx
├── HostSetupForm.test.tsx
├── JoinSetupForm.test.tsx
├── BleHostLobby.test.tsx
├── BleJoinLobby.test.tsx
├── PlayerSlot.test.tsx
└── HostList.test.tsx
```

### テスト内容

| テスト対象 | 手法 | 検証内容 |
|---|---|---|
| LobbyModeSelector | RNTL render + fireEvent | タブ切替で正しいコールバック発火 |
| HostSetupForm | RNTL render + fireEvent | 空欄時にボタン無効化、正しいparams送出 |
| JoinSetupForm | RNTL render + fireEvent | 空欄時にボタン無効化 |
| BleHostLobby | LobbyHostをモック注入 | players変更→PlayerSlot更新、エラー表示、ゲーム開始遷移 |
| BleJoinLobby | LobbyClientをモック注入 | scanning→connecting→waiting遷移、ホスト切断時のUI |
| PlayerSlot | RNTL render | 3パターン（Ready ✓ / 未Ready ○ / 空席）の表示確認 |
| HostList | RNTL render + fireEvent | リスト表示、タップでonSelect発火 |

### LobbyHost/LobbyClientのモック方針

UI層のテストではLobbyHost/LobbyClient自体をモックし、コールバックを手動発火してUIの状態遷移を検証する。MockBleTransportは不要。

```typescript
// 例: BleHostLobby テスト
const mockHost = {
  start: jest.fn(),
  stop: jest.fn(),
  startGame: jest.fn(),
  onPlayersChanged: jest.fn(),
  onGameStart: jest.fn(),
  onError: jest.fn(),
};

const callback = mockHost.onPlayersChanged.mock.calls[0][0];
callback([{ seat: 0, name: 'Host', ready: true }]);
// → PlayerSlotの表示が更新されることを検証
```

### テスト対象外（Doc 2スコープ外）

- 実際のBLE通信テスト → Doc 1
- game.tsx内のBLEモード動作 → Doc 3
- E2Eテスト（BLEフロー） → 実機テスト可能になってから

---

## 6. Scope

### 今回のスコープ（Doc 2: ロビーUI）

- `LobbyProtocol.ts` 型拡張: `joinResponse`に`gameSettings`追加、`gameStart`に`initialChips`追加、`validateHostMessage`の更新
- `LobbyClient`のコールバック拡張: `onJoinResult`にgameSettings、`onGameStart`にinitialChips
- LobbyModeSelector（3タブ切替）
- HostSetupForm / JoinSetupForm（設定入力フォーム）
- BleHostLobby（ホスト待機画面）
- BleJoinLobby（スキャン → 接続 → 待機画面）
- PlayerSlot / HostList（共通コンポーネント）
- GameContext mode拡張（'ble-host' | 'ble-client' 追加）
- 上記の全RNTLテスト

### スコープ外

- BleGameService実装（Doc 3）
- game.tsx内のBLEモード動作（Doc 3）
- ゲーム終了後のBLE切断・再戦フロー（Doc 3）
- 実BLEライブラリ結合（Doc 1）
- Data Persistence（Doc 4）
