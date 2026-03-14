# Data Persistence Implementation Design — Doc 4

## Overview

チップ残高・ゲーム履歴・設定の永続化レイヤーを実装する。GameServiceインターフェースを変更せず、GameContext層のhookで永続化を実現する。UIは含めず、ロジック層のみ。

## Context

### 現状
- Game Engine、UI、Hotseat/BLEモードは設計・実装済み
- `GameService` インターフェース + `LocalGameService` パターンが確立済み
- 親設計ドキュメント（2026-03-13-jet-holdem-design.md）にGameRepositoryパターンが定義済み（Phase 1: InMemory、Phase 2: AsyncStorage）
- AsyncStorageライブラリ未導入

### 設計判断（ブレスト段階で確定済み）
1. **スコープ:** プレイヤーチップ・ゲーム履歴・設定の3カテゴリすべて
2. **保存タイミング:** ラウンドごと（showdown/fold win後）
3. **BLE責務:** 各端末が独立して自分のデータを保存
4. **プレイヤー識別:** 名前ベース・ローカルのみ（UUID不使用、BLEプロトコル変更なし）
5. **UIスコープ:** ロジック層のみ（履歴UI等は別イテレーション）
6. **統合方式:** GameContext層のhookで永続化（アプローチA）

---

## 1. データ型定義

```typescript
// src/services/persistence/types.ts

export type GameRecord = {
  date: string;            // ISO 8601（主キーとしても使用）
  mode: 'hotseat' | 'ble-host' | 'ble-client';
  rounds: number;
  blinds: { sb: number; bb: number };
  initialChips: number;
  results: {
    name: string;
    chipChange: number;    // initialChips との差分
    finalChips: number;
  }[];
};

export type GameSettings = {
  initialChips: number;
  sb: number;
  bb: number;
  playerNames: string[];   // Hotseat用。BLEモードでは使用しない
};
```

### 設計判断

- **`PlayerStats`型は定義しない:** 親設計ドキュメントの`playerId`ベースの`PlayerStats`ではなく、`getPlayerChips`/`savePlayerChips`でプリミティブに管理。名前ベース・ローカルのみの判断に基づく簡素化
- **`GameRecord`の`date`フィールドをIDとしても使用:** ISO 8601タイムスタンプで一意性を確保。別途`id`フィールドを持つ必要なし
- **`GameRecord.mode`に`debug`を含めない:** debugモードではrepositoryを渡さないことで永続化を無効化する（Section 4参照）
- **`GameRecord`にinitialChipsとblindsを含める:** 履歴表示時にゲーム設定を確認できるように
- **`GameSettings.playerNames`:** Hotseatモードでの前回のプレイヤー名を復元するため。BLEモードではロビーで名前が決まるので不要
- **`getPlayerChips`がnullを返す場合:** 初回プレイの新しいプレイヤー。UI側でinitialChipsをデフォルト値として使用

---

## 2. GameRepository インターフェース

```typescript
// src/services/persistence/GameRepository.ts

import { GameRecord, GameSettings } from './types';

export interface GameRepository {
  // プレイヤーチップ（名前ベースで保存・取得）
  getPlayerChips(playerName: string): Promise<number | null>;
  savePlayerChips(playerName: string, chips: number): Promise<void>;

  // ゲーム履歴（時系列順: 古い順に返す）
  saveGameRecord(record: GameRecord): Promise<void>;
  getGameHistory(): Promise<GameRecord[]>;

  // 設定
  getSettings(): Promise<GameSettings | null>;
  saveSettings(settings: GameSettings): Promise<void>;
}
```

---

## 3. 実装クラス

### InMemoryGameRepository

テスト用およびPhase 1用のメモリ実装。アプリ起動ごとにリセットされる。

```typescript
// src/services/persistence/InMemoryGameRepository.ts

export class InMemoryGameRepository implements GameRepository {
  private chips = new Map<string, number>();
  private history: GameRecord[] = [];
  private settings: GameSettings | null = null;

  async getPlayerChips(playerName: string): Promise<number | null> {
    return this.chips.get(playerName) ?? null;
  }
  async savePlayerChips(playerName: string, chips: number): Promise<void> {
    this.chips.set(playerName, chips);
  }
  async saveGameRecord(record: GameRecord): Promise<void> {
    this.history.push(record);
  }
  async getGameHistory(): Promise<GameRecord[]> {
    return [...this.history];
  }
  async getSettings(): Promise<GameSettings | null> {
    return this.settings;
  }
  async saveSettings(settings: GameSettings): Promise<void> {
    this.settings = settings;
  }
}
```

### AsyncStorageGameRepository

AsyncStorageを使用した永続化実装。

```typescript
// src/services/persistence/AsyncStorageGameRepository.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameRecord, GameSettings } from './types';
import { GameRepository } from './GameRepository';

const KEYS = {
  playerChips: (name: string) => `@jetholdem:chips:${name}`,
  history: '@jetholdem:history',
  settings: '@jetholdem:settings',
};

export class AsyncStorageGameRepository implements GameRepository {
  async getPlayerChips(playerName: string): Promise<number | null> {
    const val = await AsyncStorage.getItem(KEYS.playerChips(playerName));
    return val !== null ? Number(val) : null;
  }
  async savePlayerChips(playerName: string, chips: number): Promise<void> {
    await AsyncStorage.setItem(KEYS.playerChips(playerName), String(chips));
  }
  async saveGameRecord(record: GameRecord): Promise<void> {
    const existing = await this.getGameHistory();
    existing.push(record);
    // 最新50件のみ保持（ストレージ肥大化防止）
    const trimmed = existing.slice(-50);
    await AsyncStorage.setItem(KEYS.history, JSON.stringify(trimmed));
  }
  async getGameHistory(): Promise<GameRecord[]> {
    try {
      const val = await AsyncStorage.getItem(KEYS.history);
      return val ? JSON.parse(val) : [];
    } catch {
      return [];  // データ破損時はグレースフルデグレード
    }
  }
  async getSettings(): Promise<GameSettings | null> {
    try {
      const val = await AsyncStorage.getItem(KEYS.settings);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;  // データ破損時はグレースフルデグレード
    }
  }
  async saveSettings(settings: GameSettings): Promise<void> {
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings));
  }
}
```

### 設計判断

- **ストレージキーにプレフィックス `@jetholdem:`:** 他のAsyncStorageキーとの衝突防止
- **チップは個別キー、履歴は配列で一括保存:** チップは頻繁に更新（ラウンドごと）なので個別キーが効率的。履歴は一覧取得が主用途なので配列
- **履歴は最新50件に制限:** ストレージ肥大化防止。ポーカーの友人間プレイではこれで十分
- **async/awaitインターフェース:** InMemoryもasyncにすることで、実装の差し替えが透過的

---

## 4. usePersistence Hook

GameContext層でGameServiceのstate変化を監視し、ラウンド終了時・ゲーム終了時に自動保存するhook。

```typescript
// src/hooks/usePersistence.ts

import { useEffect, useRef } from 'react';
import { GameState, Phase } from '../gameEngine';
import { GameService } from '../services/GameService';
import { GameRepository } from '../services/persistence/GameRepository';
import { GameRecord } from '../services/persistence/types';

type PersistenceConfig = {
  mode: 'hotseat' | 'ble-host' | 'ble-client';
  initialChips: number;
  blinds: { sb: number; bb: number };
};

export function usePersistence(
  service: GameService,
  repository: GameRepository | null,  // null なら永続化無効
  config: PersistenceConfig,
): void {
  const prevPhaseRef = useRef<Phase | null>(null);
  const roundCountRef = useRef(0);

  useEffect(() => {
    if (!repository) return;  // 永続化無効時は何もしない

    const unsub = service.subscribe((state: GameState) => {
      const prevPhase = prevPhaseRef.current;
      prevPhaseRef.current = state.phase;

      // ラウンド終了検出: phase が 'roundEnd' に遷移した瞬間
      // fold win: handleAction → notify（phase='roundEnd', チップ更新済み）
      // showdown: resolveShowdown → notify（phase='roundEnd', チップ分配済み）
      if (state.phase === 'roundEnd' && prevPhase !== 'roundEnd') {
        roundCountRef.current++;
        // 全プレイヤーのチップを保存（fire-and-forget）
        for (const player of state.players) {
          repository.savePlayerChips(player.name, player.chips);
        }
      }

      // ゲーム終了検出: phase が 'gameOver' に遷移した瞬間
      if (state.phase === 'gameOver' && prevPhase !== 'gameOver') {
        const record: GameRecord = {
          date: new Date().toISOString(),
          mode: config.mode,
          rounds: roundCountRef.current,
          blinds: config.blinds,
          initialChips: config.initialChips,
          results: state.players.map(p => ({
            name: p.name,
            chipChange: p.chips - config.initialChips,
            finalChips: p.chips,
          })),
        };
        repository.saveGameRecord(record);
      }
    });
    return unsub;
  }, [service, repository]);
}
```

**Note:** hookはReact Rules of Hooks準拠のため常に無条件で呼び出す。`repository`が`null`の場合はuseEffect内部で早期returnすることで永続化を無効化する。

### GameProviderへの統合

```typescript
// GameContext.tsx への変更（概要）

interface GameProviderProps {
  children: React.ReactNode;
  service: GameService;
  mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
  repository?: GameRepository;       // optional — 未指定なら永続化なし
  initialChips?: number;
  blinds?: { sb: number; bb: number };
}

export function GameProvider({ children, service, mode, repository, initialChips, blinds }: GameProviderProps) {
  // 既存のロジック...

  // 永続化hook（常に無条件で呼び出し。repository=null で永続化無効）
  // debugモードではrepositoryを渡さない → null → 永続化無効
  const persistMode = mode === 'debug' ? 'hotseat' : mode;  // debugの場合のフォールバック（実際にはnullで無効化されるため使われない）
  usePersistence(
    service,
    repository ?? null,
    { mode: persistMode as 'hotseat' | 'ble-host' | 'ble-client', initialChips: initialChips ?? 0, blinds: blinds ?? { sb: 0, bb: 0 } },
  );

  // ...
}
```

### 保存タイミング

| イベント | トリガー条件 | 保存内容 |
|---------|------------|---------|
| ラウンド終了 | `phase === 'roundEnd'` に遷移 | 全プレイヤーのチップ（`savePlayerChips`） |
| ゲーム終了 | `phase === 'gameOver'` に遷移 | ゲーム履歴（`saveGameRecord`） |
| 設定変更 | ホーム画面のスライダー操作時 | 設定（`saveSettings`）— ホーム画面側で直接呼び出し |

### BLEモードでの動作

- **Hotseat:** 全プレイヤーのチップを保存（1台の端末に全員分）
- **BLE Host:** 全プレイヤーのチップを保存（ホストがGameLoopを所有）
- **BLE Client:** stateUpdateで受信した全プレイヤー情報から保存。全員分を保存（次回ホストになった時にも使える）

### 設計判断

- **hookは常に無条件で呼び出し:** React Rules of Hooks準拠。`repository`を`null`にすることで永続化を無効化。useEffect内部で`if (!repository) return;`ガード
- **debugモードでは永続化無効:** game.tsx側でrepositoryを渡さないことで実現
- **`savePlayerChips`はfire-and-forget:** awaitしない。UIをブロックしない。AsyncStorageの書き込みは十分高速（~1ms）
- **ゲーム履歴はgameOverのみで保存:** 途中離脱時は保存されない。友人間カジュアルプレイでは許容範囲
- **`roundEnd`検出の前提:** fold win時は`handleAction` → `notify`（チップ更新済み）、showdown時は`resolveShowdown` → `notify`（チップ分配済み）の順でsubscribeリスナーに通知される。いずれの場合もphase='roundEnd'の時点でチップは最終値

---

## 5. 設定の永続化とチップ復元

### ホーム画面での設定保存・復元

```typescript
// app/index.tsx（ホーム画面）での変更概要

const repository = new AsyncStorageGameRepository();

// 起動時に前回の設定を復元
useEffect(() => {
  repository.getSettings().then(saved => {
    if (saved) {
      setInitialChips(saved.initialChips);
      setSb(saved.sb);
      setBb(saved.bb);
      setPlayerNames(saved.playerNames);
    }
  });
}, []);

// 設定変更時に保存（スライダー操作やプレイヤー名変更の確定時）
const handleSettingsChange = (settings: GameSettings) => {
  repository.saveSettings(settings);
};
```

### ゲーム開始時のチップ復元

保存済みチップの読み込みはゲーム開始前にホーム画面/ロビーで行う。GameService生成時にinitialChipsの代わりに保存済みチップを使う。

```typescript
// app/index.tsx — ゲーム開始ボタン押下時
const startGame = async () => {
  const chipsByPlayer = new Map<string, number>();
  for (const name of playerNames) {
    const saved = await repository.getPlayerChips(name);
    chipsByPlayer.set(name, saved ?? initialChips);  // 未保存ならデフォルト値
  }

  router.push({
    pathname: '/game',
    params: {
      playerNames: JSON.stringify(playerNames),
      playerChips: JSON.stringify(Object.fromEntries(chipsByPlayer)),
      initialChips: String(initialChips),
      sb: String(sb),
      bb: String(bb),
      mode: 'hotseat',
    },
  });
};
```

### game.tsx でのチップ適用

```typescript
// game.tsx — service生成時
const playerChipsMap: Record<string, number> = params.playerChips
  ? JSON.parse(params.playerChips)
  : {};

const [service] = React.useState(() => {
  const svc = new LocalGameService();
  svc.startGame(playerNames, blinds, initialChips, playerChipsMap);
  svc.startRound();
  return svc;
});
```

### GameService.startGame のシグネチャ拡張

```typescript
// GameService インターフェース
startGame(
  playerNames: string[],
  blinds: Blinds,
  initialChips: number,
  savedChips?: Record<string, number>,  // optional — 指定された場合はプレイヤーごとのチップを使用
): void;
```

`GameLoop`のコンストラクタは既に`Player[]`を受け取るので、`LocalGameService.startGame`内でのPlayer構築ロジックだけ修正。

```typescript
// LocalGameService.startGame 内
const players: Player[] = playerNames.map((name, i) => ({
  seat: i,
  name,
  chips: savedChips?.[name] ?? initialChips,
  status: 'active' as PlayerStatus,
  bet: 0,
  cards: [],
}));
```

### Repositoryシングルトン

`AsyncStorageGameRepository`はステートレス（全状態はAsyncStorageに保持）なので、複数インスタンスを作っても動作上の問題はない。ただし、テスト容易性と明確さのため、シングルトンとしてエクスポートする:

```typescript
// src/services/persistence/index.ts
export { AsyncStorageGameRepository } from './AsyncStorageGameRepository';
export const repository = new AsyncStorageGameRepository();
```

`app/index.tsx` と `app/game.tsx` はこのシングルトンをインポートして使用する。

### game.tsx へのrepository注入

```typescript
// game.tsx での変更（概要）
import { repository } from '../src/services/persistence';

export default function GameScreen() {
  // ...
  // debugモードではrepositoryを渡さない → 永続化無効
  const repo = mode === 'debug' ? undefined : repository;

  return (
    <GameProvider
      service={service}
      mode={mode}
      repository={repo}
      initialChips={initialChips}
      blinds={blinds}
    >
      <GameView />
    </GameProvider>
  );
}
```

### 設計判断

- **チップ読み込みはasync（ゲーム開始前）:** GameService生成は同期的なので、asyncなAsyncStorage読み込みはその前に完了させる
- **`savedChips`はoptional:** 未指定時は従来通り全員initialChips。後方互換性維持
- **BLEモードのチップ復元:** ホスト側はロビーからゲーム開始時に読み込み。クライアント側はホストからのstateUpdateに含まれるチップ値をそのまま使用（クライアントがチップを指定する手段はない）

---

## 6. ディレクトリ構成

```
src/services/persistence/
├── types.ts                        — データ型定義 (GameRecord, GameSettings)
├── GameRepository.ts               — GameRepository インターフェース
├── InMemoryGameRepository.ts       — テスト・Phase 1用メモリ実装
├── AsyncStorageGameRepository.ts   — AsyncStorage実装
└── index.ts                        — エクスポート + repositoryシングルトン

src/hooks/
└── usePersistence.ts               — 永続化hook

tests/persistence/
├── InMemoryGameRepository.test.ts
├── AsyncStorageGameRepository.test.ts
└── usePersistence.test.ts
```

### 既存ファイルへの変更

| ファイル | 変更内容 |
|---------|---------|
| `src/services/GameService.ts` | `startGame`シグネチャに`savedChips?`追加（後方互換: 既存の呼び出しは変更不要） |
| `src/services/LocalGameService.ts` | `startGame`でsavedChips対応 |
| `src/contexts/GameContext.tsx` | `repository`/`initialChips`/`blinds` props追加、`usePersistence`呼び出し |
| `app/game.tsx` | repository注入、playerChipsパラメータ対応 |
| `app/index.tsx` | 設定復元・保存、チップ読み込みしてgame.tsxに渡す |
| `package.json` | `@react-native-async-storage/async-storage` 追加 |

---

## 7. Test Strategy

### テスト構成

| テスト | 検証項目 |
|--------|---------|
| InMemoryGameRepository | get/save各メソッドの基本動作、未登録プレイヤーでnull返却 |
| AsyncStorageGameRepository | AsyncStorageモック使用。キー命名規則、JSON serialize/deserialize、履歴50件制限、未保存時のデフォルト、JSON.parseエラー時のグレースフルデグレード |
| usePersistence | MockのGameService + InMemoryGameRepositoryで結合テスト。roundEnd遷移時のチップ保存、gameOver遷移時の履歴保存、重複保存防止（同じphaseが2回来ても1回だけ保存）、repository=null時に何も保存されない |
| LocalGameService.startGame | savedChips指定時にプレイヤーごとのチップでスタート、未知プレイヤーはinitialChipsにフォールバック、savedChips未指定時は従来通り全員initialChips |

### AsyncStorageのモック方針

```typescript
// tests/persistence/AsyncStorageGameRepository.test.ts
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItem: jest.fn((key: string, val: string) => {
      store.set(key, val);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});
```

---

## 8. Scope

### 今回のスコープ（Doc 4: Data Persistence）

- `GameRepository` インターフェース + データ型定義
- `InMemoryGameRepository` 実装
- `AsyncStorageGameRepository` 実装
- `usePersistence` hook
- `GameContext.tsx` へのrepository統合
- `GameService.startGame` のsavedChips拡張
- `LocalGameService` のsavedChips対応
- `app/game.tsx` のrepository注入
- `app/index.tsx` の設定復元・チップ読み込み
- `@react-native-async-storage/async-storage` パッケージ追加
- 上記の全Jestテスト

### スコープ外

- 履歴一覧・統計UI画面（別イテレーション）
- チップリセットUI
- BleHostGameService / BleClientGameService へのsavedChips対応（Doc 3実装時にDoc 4のパターンに合わせて追加）
- データマイグレーション（スキーマ変更時の対応 — 将来拡張）

### 依存関係

- Doc 4はDoc 1〜3と独立して実装可能（GameServiceインターフェースのみに依存）
- BLE GameService（Doc 3）へのsavedChips対応は、Doc 3実装時にDoc 4のパターンに合わせて追加
