# Jet Holdem - Bluetooth Texas Hold'em Poker App Design

## Overview

4人対戦のテキサスホールデムポーカーアプリ。スマートフォンの機内モード（Bluetooth手動ON）環境下で、BLE通信によりローカル対戦を実現する。

## Requirements

- **プラットフォーム:** iOS必須、Android対応（混在プレイ可能）
- **通信:** BLE（Bluetooth Low Energy）、機内モード + Bluetooth ON
- **ルール:** テキサスホールデム（本格的なベッティング、サイドポット、オールイン対応）
- **通信トポロジー:** ホスト型（1台がサーバー、3台がクライアント）
- **UI:** GTO Wizard準拠のダークテーマ、機能的で情報明確
- **永続化:** 初期はセッション内のみ、後からローカル保存を追加可能な設計
- **開発環境:** Windows中心（Swiftは使用しない）

## Technology Stack

- **フレームワーク:** React Native (Expo Development Build)
- **言語:** TypeScript
- **BLEライブラリ:**
  - Central側: react-native-ble-plx
  - Peripheral側 (ホスト): react-native-ble-peripheral（react-native-ble-plxはCentral専用のため、GATT Server機能には別ライブラリが必要）
- **テスト:** Jest
- **iOSビルド:** EAS Build (クラウド) → TestFlight配信
- **Androidビルド:** ローカル or EAS Build

---

## 1. Architecture

### Host-Client Model

```
┌─────────────────────────────────────────────────┐
│              ホスト端末 (Host)                     │
│                                                   │
│  ┌───────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ Game      │  │ BLE      │  │ UI            │ │
│  │ Engine    │←→│ Peripheral│  │ (Host View)   │ │
│  │           │  │ (GATT    │  │               │ │
│  │ - Deck    │  │  Server) │  │ - テーブル表示  │ │
│  │ - Pot     │  │          │  │ - 自分の手札   │ │
│  │ - Betting │  └────┬─────┘  └───────────────┘ │
│  │ - Hand    │       │                           │
│  │   Eval    │       │ BLE (GATT Notify)         │
│  └───────────┘       │                           │
└──────────────────────┼───────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
   │Client 1 │   │Client 2 │   │Client 3 │
   │BLE      │   │BLE      │   │BLE      │
   │Central  │   │Central  │   │Central  │
   │UI:      │   │UI:      │   │UI:      │
   │自分の手札│   │自分の手札│   │自分の手札│
   │アクション│   │アクション│   │アクション│
   └─────────┘   └─────────┘   └─────────┘
```

- **ホスト端末:** BLE Peripheral (GATT Server)。ゲームエンジンを持ち、デッキ管理・ベッティング処理・ハンド評価を全て担当。ゲーム状態の変更をGATT Notifyで全クライアントに配信。
- **クライアント端末:** BLE Centralとして接続。自分の手札とテーブル状態を受信して表示。ユーザーのアクションをGATT Writeでホストに送信。
- ゲームロジックはホストにのみ存在。クライアントはカードの配布やポット計算を一切行わない。チート耐性が高く、同期問題も起きにくい。

---

## 2. BLE Communication Protocol

### GATT Service Structure

```
Service: JetHoldemPoker (カスタムUUID)
│
├── Characteristic: GameState (Read, Notify)
│   → ホスト → 全クライアント
│   → テーブル状態（フェーズ、コミュニティカード、ポット、各プレイヤーのチップ・ステータス）
│
├── Characteristic: PrivateHand0 (Read, Notify) — Seat 0専用
├── Characteristic: PrivateHand1 (Read, Notify) — Seat 1専用
├── Characteristic: PrivateHand2 (Read, Notify) — Seat 2専用
├── Characteristic: PrivateHand3 (Read, Notify) — Seat 3専用
│   → ホスト → 該当プレイヤーのみ
│   → そのプレイヤーだけの手札
│
├── Characteristic: PlayerAction (Write)
│   → クライアント → ホスト
│   → プレイヤーのアクション（fold, check, call, raise, all-in + 金額）
│
└── Characteristic: LobbyControl (Read, Write, Notify)
    → 接続管理（参加/離脱/ゲーム開始/プロトコルバージョン交換）
```

### Private Hand Distribution

各プレイヤーに専用のPrivateHand Characteristicを割り当てることで、暗号化なしで手札の秘匿性を確保:

- 接続時のLobbyControlハンドシェイクで各クライアントにseat ID（0〜3）を割り当てる
- 各クライアントは自分のseat IDに対応するPrivateHand Characteristicのみsubscribeする
- ホストは各PrivateHand Characteristicに該当プレイヤーの手札のみを書き込む
- 他のseatのCharacteristicをsubscribeしても、アプリケーション層でフィルタリング（悪意のある改造アプリへの完全な防御は友人間のローカルゲームのスコープ外とする）

### Protocol Version

LobbyControlハンドシェイク時にプロトコルバージョンを交換:

- ホストがサービス広告時にプロトコルバージョンをadvertise data に含める
- クライアントは接続時にバージョンを確認し、非互換の場合は接続を拒否してユーザーにアップデートを促す
- 初期バージョン: `1`

### Lobby Control Protocol

```json
// クライアント → ホスト (Join Request)
{
  "type": "join",
  "protocolVersion": 1,
  "playerName": "Alice"
}

// ホスト → クライアント (Join Response)
{
  "type": "joinResponse",
  "accepted": true,
  "seat": 2,
  "players": [
    {"seat": 0, "name": "Host", "ready": true},
    {"seat": 2, "name": "Alice", "ready": false}
  ]
}

// ホスト → クライアント (Join Rejected - room full)
{
  "type": "joinResponse",
  "accepted": false,
  "reason": "Room is full"
}

// クライアント → ホスト (Ready)
{"type": "ready", "seat": 2}

// ホスト → 全員 (Game Starting)
{"type": "gameStart", "blinds": {"sb": 5, "bb": 10}}

// ホスト → 全員 (Player Update - join/leave通知)
{
  "type": "playerUpdate",
  "players": [
    {"seat": 0, "name": "Host", "ready": true},
    {"seat": 1, "name": "Bob", "ready": true},
    {"seat": 2, "name": "Alice", "ready": true}
  ]
}
```

**Lobby State Machine:**
```
ADVERTISING → (client connects) → SEAT_ASSIGNMENT → (all ready + host starts) → GAME_START
                                        ↑                    │
                                        └── (new client) ────┘

Max 4 connections. 5th client rejected with "Room is full".
Minimum 2 players to start.
```

### Card Notation

カードは2文字の文字列で表現:
- **ランク:** `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `T`, `J`, `Q`, `K`, `A`
- **スート:** `h` (hearts), `d` (diamonds), `s` (spades), `c` (clubs)
- 例: `Ah` = Ace of Hearts, `Td` = 10 of Diamonds, `2c` = 2 of Clubs

### Message Format (JSON)

```json
// GameState (ホスト → 全員)
{
  "seq": 42,
  "phase": "flop",
  "community": ["Ah", "Kd", "7s"],
  "pot": 400,
  "currentBet": 100,
  "activePlayer": 2,
  "dealer": 0,
  "actionTimeout": 30,
  "players": [
    {"seat": 0, "chips": 900, "status": "active", "bet": 100},
    {"seat": 1, "chips": 0, "status": "folded", "bet": 50},
    {"seat": 2, "chips": 800, "status": "active", "bet": 100},
    {"seat": 3, "chips": 700, "status": "active", "bet": 100}
  ]
}

// PrivateHand (ホスト → 個別プレイヤー)
{
  "cards": ["Kh", "Js"]
}

// PlayerAction (クライアント → ホスト)
// NOTE: seat フィールドはクライアントが送信するが、ホスト側ではBLE接続IDから
// seatを特定するため、このフィールドは無視される（なりすまし防止）
{
  "action": "raise",
  "amount": 200
}
```

### Data Size & Chunking Protocol

**最悪ケースのMTU:** 185バイト（iOS デフォルト）を前提に設計する。MTUネゴシエーションでより大きな値が得られた場合は自動的に活用するが、依存しない。

**チャンク分割プロトコル:**

GameStateのJSONが最大約400バイトになるため、MTUが小さい場合はチャンク分割が必要:

```
Chunk header (3 bytes): [chunkIndex (1 byte)] [totalChunks (1 byte)] [reserved (1 byte)]
Chunk payload: remaining MTU - 3 bytes
```

- 送信側: JSONをUTF-8バイト列に変換 → MTU - 3バイトずつに分割 → 各チャンクにヘッダを付与して順次送信
- 受信側: chunkIndex順にバッファに蓄積 → totalChunks分揃ったら結合 → JSONパース
- 全チャンクが5秒以内に届かない場合はバッファを破棄（部分データ防止）

**代替案:** ペイロードが将来的に大きくなる場合は、MessagePackなどのバイナリフォーマットへの移行を検討する。現時点ではJSONの可読性を優先。

---

## 3. Game Engine

### Module Structure

```
gameEngine/
├── Deck.ts          — カードのシャッフル・配布
├── HandEvaluator.ts — 役の判定・ランキング
├── BettingRound.ts  — ベッティングラウンド管理
├── PotManager.ts    — メインポット・サイドポット計算
├── GameLoop.ts      — フェーズ進行の制御
└── types.ts         — 共通型定義
```

### State Machine

```
WAITING_FOR_PLAYERS (最低2人、最大4人)
    │ (ホストが開始)
    ▼
DEAL_HANDS ─── 各プレイヤーに2枚配布
    │
    ▼
PREFLOP ─── SB/BB強制ベット → アクション開始
    │ (全員アクション完了)
    ▼
FLOP ─── コミュニティカード3枚オープン → ベッティング
    │
    ▼
TURN ─── 1枚オープン → ベッティング
    │
    ▼
RIVER ─── 1枚オープン → ベッティング
    │
    ▼
SHOWDOWN ─── ハンド評価 → 勝者決定 → ポット分配
    │
    ▼
ROUND_END ─── ディーラーボタン移動
    │
    ├── 2人以上がチップ残高 > 0 → DEAL_HANDS に戻る
    └── 1人だけが残り → GAME_OVER
              │
              ▼
         勝者表示 → ロビーに戻る
```

**Early termination:** どのベッティングラウンドでも、1人を除いて全員フォールドした場合は即座にその1人が勝ち、SHOWDOWNをスキップ。

**プレイヤー数による調整:**
- 4人: SB, BB, UTG, BTN（BTNがディーラー）
- 3人: SB, BB, BTN（BTNがディーラー兼UTG）
- 2人 (Heads-up): BTN=SB（ディーラーがSBを投稿）, BB

**ブラインド構成:**
- 初期値はホストがゲーム開始前に設定（デフォルト: SB=5, BB=10）
- Phase 1ではブラインドは固定（増加なし）
- 将来的にブラインドレベル構造（時間経過で増加）を追加可能

**アクションタイマー:**
- 各プレイヤーのアクション制限時間: 30秒（設定可能）
- タイムアウト時: チェック可能ならチェック、それ以外はフォールド
- 残り時間はGameStateの`actionTimeout`フィールドでクライアントに通知
- UIにカウントダウンタイマーを表示

### Betting Round Flow

1. activePlayer にアクションを要求（BLE Notify で通知）
2. PlayerAction を BLE Write で受信
3. アクションを検証（有効なアクションか、金額は正しいか）
4. 無効なら拒否して再要求
5. 有効なら状態更新 → 次のactivePlayerへ
6. 全員がアクション済み（かつベット額が揃った）→ ラウンド終了

### Hand Evaluation

7枚（手札2枚 + コミュニティ5枚）から最強の5枚を選ぶ。

役のランク:
```
Royal Flush > Straight Flush > Four of a Kind > Full House >
Flush > Straight > Three of a Kind > Two Pair > One Pair > High Card
```

同じ役同士の比較はキッカーで決定。引き分けの場合はポットを均等分割。

### Side Pot Calculation

オールイン発生時のサイドポット処理:

```
例: Player A (100), B (300), C (500) がオールイン
→ メインポット: 100 × 3 = 300 (A, B, C が対象)
→ サイドポット1: 200 × 2 = 400 (B, C が対象)
→ サイドポット2: 200 × 1 = 200 (C のみ、返却)
```

各ポットごとに対象プレイヤーのハンドを評価し、勝者にそのポットを配分。

---

## 4. UI Design (GTO Wizard Style)

### Screen Size Reference: 720 x 1560px (物理ピクセル)

UIレイアウトは論理ピクセル (dp) で実装し、React Nativeの`Dimensions` APIとflexboxで画面サイズに適応させる。上記の座標値はデザインの基準値であり、実装時は比率ベースのレイアウト（flex, percentage）を使用する。

### Color Scheme

| Element | Color |
|---|---|
| Background | #1A1A2E (dark navy) |
| Table ellipse | #16213E (lighter navy) |
| Text | #FFFFFF |
| Active border | #06B6D4 (cyan) |
| Pot/amount | #10B981 (green) |
| Sub text | #9CA3AF (gray) |
| Folded | 50% opacity |

### Seat Layout (4 Players)

Ellipse center: **(360, 620)**, horizontal radius ≈ 280px, vertical radius ≈ 380px

| Seat | Role | Position(x, y) | Notes |
|---|---|---|---|
| Seat 0 (YOU/Hero) | Always bottom | (360, 1050) | Face-up cards, cyan border |
| Seat 1 | Left | (80, 500) | Face-down cards |
| Seat 2 | Opposite | (360, 250) | Face-down cards |
| Seat 3 | Right | (640, 500) | Face-down cards |

### Seat Component (per seat)

```
     [??][??]          ← 2 cards (25x35px, face-down = dark gray)
    ┌────────┐
    │ SB     │ ← seat name label (white 12px)
    │  950   │ ← chip balance (white 14px)
    └────────┘
       ● 0.5           ← bet amount (positioned toward table center)
```

- Seat circle: diameter ≈ 70px, dark gray background
- Active player: cyan (#06B6D4) border highlight
- Folded: 50% opacity gray-out
- Dealer button: "D" badge (white bg, black text) next to seat

### GameScreen Layout

```
┌─────────────────────────────────────┐  y=0
│  Status bar (OS)                     │  y≈45
├─────────────────────────────────────┤
│  Action history bar                  │  y≈95-120
│  [SB 0.5 Post][BB 1 Post]           │
│  [BTN 1 Call][YOU Action]            │  cyan border highlight
├─────────────────────────────────────┤
│           Player 2 (opposite)        │  y≈250
│           [??][??]                   │
│          ┌──────┐                   │
│          │ P2   │                   │
│          │ 1000 │                   │
│          └──────┘                   │
│                                      │
│  Player 1          Player 3         │  y≈500
│  [??][??]          [??][??]         │
│ ┌──────┐          ┌──────┐         │
│ │ P1   │          │ P3   │         │
│ │ 1000 │          │ 1000 │         │
│ └──────┘          └──────┘         │
│                                      │
│        ╔═══════════════════╗        │
│        ║   Pot: 400        ║        │  y≈620
│        ║   [A♥][K♦][7♠]   ║        │
│        ╚═══════════════════╝        │
│                                      │
│          [K♠][J♦]                   │  y≈1020
│          ┌────────┐                 │
│          │ YOU    │ cyan border     │  y≈1080
│          │ 1000   │                 │
│          └────────┘                 │
├─────────────────────────────────────┤
│  [FOLD]    [CALL 100]   [RAISE]    │  y≈1180
│   blue      red-orange   dark-red   │
│           [━━━━●━━━] 200           │  raise slider
├─────────────────────────────────────┤
│  ☰    🎮(active)    ⚙     💡      │  y≈1510
└─────────────────────────────────────┘
```

### Action History Bar

- Horizontally scrollable
- Each action as pill-shaped chip
- Normal: gray background, white text
- Current player: cyan border highlight

### Pot Display (Table Center)

```
        4 Players ⓘ          ← green text
           400                ← white bold 24px
         (4 BB)               ← gray text 14px
```

### Community Cards (Table Center, below pot)

- Card size: 45x65px
- Unopened slots: dark gray empty frame
- Suit colors: ♥♦ = red, ♠♣ = white/black

### Action Buttons

| Button | Width | Color | Condition |
|---|---|---|---|
| FOLD | ≈215px | #3B82F6 (blue) | Always |
| CHECK / CALL {amount} | ≈230px | #EF4444 (red-orange) | Switches by situation |
| RAISE {amount} / ALLIN {amount} | ≈215px | #B91C1C (dark red) | When raise is possible |

- Border radius: 12px, height: 60px
- White bold text centered
- Slider below RAISE button (min bet to all-in)
- Entire button area disabled when not player's turn

### Screen Transitions

| Screen | Purpose |
|---|---|
| LobbyScreen | Host create / join, BLE connection, player waiting |
| GameScreen | Main game screen (layout above) |
| ResultOverlay | Round-end modal (winner, hand reveal) |

```
LobbyScreen → GameScreen → ResultOverlay (modal) → GameScreen (next round)
                                                  → LobbyScreen (game end)
```

### ResultOverlay Layout

ラウンド終了時にGameScreen上にモーダル表示:

```
┌───────────────────────────────┐
│                               │
│       🏆 Winner: Alice        │  白太字 20px
│       Full House              │  グレー 14px (役名)
│       Kings over Sevens       │  グレー 12px (役の詳細)
│                               │
│  ── 全プレイヤーの手札公開 ──  │
│                               │
│  P1: [A♥][K♠]  Full House    │  勝者はハイライト
│  P2: [Q♦][J♦]  Two Pair     │
│  P3: [8♠][7♣]  (folded)     │  フォールド済はグレー
│  YOU: [K♠][J♦]  One Pair    │
│                               │
│  ── ポット分配 ──             │
│  Main Pot: 400 → P1          │
│  Side Pot: 200 → P2          │  サイドポットがある場合のみ
│                               │
│     [次のラウンドへ]           │  ボタン (#10B981 緑)
│                               │
└───────────────────────────────┘
```

- 背景: 半透明オーバーレイ (#000000, 70% opacity)
- モーダル: #1A1A2E 背景、角丸16px
- フォールド済プレイヤーは手札非公開、"(folded)" 表示
- サイドポットが複数ある場合は各ポットの勝者を個別表示
- GAME_OVER時は「次のラウンドへ」の代わりに「ロビーに戻る」ボタン

---

## 5. Error Handling & Connection Management

### BLE Disconnection Handling

```
Disconnection detected
    │
    ├── Client disconnected → Host side:
    │       ├── Wait 30 seconds for reconnection (game paused)
    │       ├── Reconnect success → Resend current game state, resume
    │       └── Timeout → Auto-fold that player, continue with remaining
    │
    └── Host disconnected → Client side:
            ├── Wait 30 seconds for reconnection
            ├── Reconnect success → Resume game
            └── Timeout → Game over, return to lobby
```

Host keeps game state in memory at all times. On client reconnection, resend latest GameState and PrivateHand.

### Invalid Action Defense

All PlayerActions validated on host side:

| Check | Example |
|---|---|
| Turn validation | Ignore actions from players not in turn |
| Action validity | Call with 0 bet is invalid → convert to Check |
| Amount validation | Reject raise below minimum or exceeding chip balance |
| State consistency | Ignore actions from already-folded players |

Invalid actions are discarded; host requests re-input from client.

**PlayerAction認証:** ホストはBLE接続IDとseat IDのマッピングを保持。PlayerActionの送信元は接続IDで特定するため、クライアントが送信するseatフィールドは無視される。これにより他プレイヤーになりすますことを防止。

### iOS BLE Peripheral Mode Constraints

iOSでホスト端末がBLE Peripheralとして動作する際の制約:

- **バックグラウンド制限:** iOSアプリがバックグラウンドに移行するとBLE advertisingが停止し、既存の接続が不安定になる可能性がある
  - 対策: ホスト端末のUIに「アプリを前面に保ってください」という常時表示の警告
  - `Info.plist`に`UIBackgroundModes: bluetooth-peripheral`を設定し、バックグラウンドでの接続維持を試みる
- **同時接続数:** iOSは一般的に最大7-8のCentral接続をサポートするが、3接続は安全な範囲内
- **必須Info.plistキー:**
  - `NSBluetoothPeripheralUsageDescription` — Peripheral広告の許可
  - `NSBluetoothAlwaysUsageDescription` — Bluetooth使用の許可

### Android BLE Permissions (API 31+)

Android 12以降で必要な権限:
- `BLUETOOTH_SCAN` — デバイスのスキャン
- `BLUETOOTH_ADVERTISE` — Peripheral広告（ホスト側）
- `BLUETOOTH_CONNECT` — デバイスへの接続
- `ACCESS_FINE_LOCATION` — BLEスキャンに必要（Android 11以下）

アプリ初回起動時に権限リクエストダイアログを表示。

### Game State Consistency

- Host holds the single source of truth for game state
- Clients update UI only from host notifications (no local state calculation)
- Each GameState notification includes a sequence number; clients detect gaps and request retransmission

---

## 6. Testing Strategy & Development Environment

### Development Environment (Windows-centric)

| Task | Environment | Tools |
|---|---|---|
| Game logic development & testing | Windows | Node.js + Jest |
| UI development & verification | Windows | Android device or emulator |
| BLE communication testing | Windows | 2+ Android devices |
| iOS build | Cloud | EAS Build (Expo) or Codemagic |
| iOS device testing | Borrowed Mac or cloud | TestFlight distribution |

### Test Categories

**Unit Tests (Jest, Windows)**

Full coverage of game engine modules:

- `Deck` — shuffle uniformity, remaining card count after deal
- `HandEvaluator` — all 10 hand ranks, same-rank comparison, kicker evaluation, 7→5 card optimal selection
- `BettingRound` — state transitions per action, round end conditions
- `PotManager` — side pot calculation (2/3/4 player all-in patterns)
- `GameLoop` — phase transitions, early termination, dealer button rotation

**BLE Communication Tests (Android devices)**

- Connect/disconnect/reconnect flow
- Message send/receive and ordering guarantee
- MTU negotiation and chunk splitting
- 4-device simultaneous connection stability

**Integration Tests (devices)**

- Full game flow (preflop through showdown)
- Side pot scenarios
- Disconnection and recovery scenarios
- Consecutive round dealer rotation

### Build & Distribution Flow

```
Windows (development)
    │
    ├── Android → Direct APK install or Google Play internal testing
    │
    └── iOS → Push source to Git
                   │
                   ▼
               Cloud CI (EAS Build etc.)
                   │
                   ▼
               TestFlight distribution → iPhone device testing
```

**Expo with Development Build:**
- `eas build --platform ios` for cloud iOS builds
- `react-native-ble-plx` requires native modules → use Development Build (not Managed Workflow)
- Compatible via Expo Config Plugin

---

## 7. Data Persistence (Extensible Design)

### Approach: Repository Pattern

```typescript
interface GameRepository {
  savePlayerStats(stats: PlayerStats): Promise<void>;
  getPlayerStats(playerId: string): Promise<PlayerStats | null>;
  saveGameHistory(game: GameRecord): Promise<void>;
  getGameHistory(): Promise<GameRecord[]>;
}

// Phase 1: Memory only (initial release)
class InMemoryGameRepository implements GameRepository { ... }

// Phase 2: Local storage (future addition)
class AsyncStorageGameRepository implements GameRepository { ... }
```

### Data to Persist (Phase 2)

| Data | Storage | Purpose |
|---|---|---|
| Player name & chip balance | AsyncStorage | Carry over on next launch |
| Game history (wins/losses, chips won) | AsyncStorage | Stats review |
| Settings (initial chips, blinds) | AsyncStorage | Save game config |

### Phase 1 Behavior

- All player chips start at configured value (default 1000) on app launch
- Reset on app close
- Only `GameRepository` interface is defined; implemented with `InMemoryGameRepository`
