# Game History Display UI Design

## Overview

ロビー画面からアクセスできるゲーム履歴一覧UIを実装する。`GameRepository.getGameHistory()` で取得した `GameRecord[]` をFlatListで表示する。新規画面（Expo Routerページ）として実装し、ダークテーマで既存UIと統一する。

## Context

### 現状
- `GameRepository.getGameHistory()` が `GameRecord[]` を返す永続化レイヤーは実装済み（Doc 4）
- `AsyncStorageGameRepository` は最新50件を保持
- `GameRecord` は date, mode, rounds, blinds, initialChips, results（プレイヤーごとの name, chipChange, finalChips）を含む
- ロビー画面（`app/index.tsx` → `LobbyView.tsx`）が存在
- 履歴UIは Doc 4 で「スコープ外（別イテレーション）」として明記

### 設計判断（ブレスト段階で確定済み）
1. **画面方式:** Expo Router の新規ページ（`app/history.tsx`）
2. **UIパターン:** FlatList ベースのリスト + カード型アイテム
3. **アクセス方法:** ロビー画面にリンクボタンを配置
4. **データ取得:** 画面マウント時に `repository.getGameHistory()` を1回呼び出し
5. **ソート順:** 新しい順（APIは古い順で返すので reverse する）
6. **複雑なナビゲーション不要:** 詳細画面は作らず、カード内にインライン展開

---

## 1. データ型（既存）

```typescript
// src/services/persistence/types.ts（変更なし）
export type GameRecord = {
  date: string;            // ISO 8601
  mode: 'hotseat' | 'ble-host' | 'ble-client';
  rounds: number;
  blinds: { sb: number; bb: number };
  initialChips: number;
  results: {
    name: string;
    chipChange: number;
    finalChips: number;
  }[];
};
```

新規の型定義は不要。`GameRecord` をそのまま表示に使用する。

---

## 2. UI レイアウト

### 画面全体

```
┌─────────────────────────────────┐
│  ← 戻る          ゲーム履歴      │  ← ヘッダー
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────────┐│
│  │ 2026/03/16 14:30            ││
│  │ ホットシート · 12ラウンド     ││
│  │ SB/BB: 5/10  初期: 1000     ││
│  │ ─────────────────────────── ││
│  │ Alice     +250    1250      ││  ← 緑 (+)
│  │ Bob       -100     900      ││  ← 赤 (-)
│  │ Charlie   -150     850      ││  ← 赤 (-)
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────────────┐│
│  │ 2026/03/16 13:00            ││
│  │ BLE Host · 8ラウンド         ││
│  │ ...                         ││
│  └─────────────────────────────┘│
│                                 │
│  （FlatList スクロール）          │
│                                 │
└─────────────────────────────────┘
```

### 空状態

```
┌─────────────────────────────────┐
│  ← 戻る          ゲーム履歴      │
├─────────────────────────────────┤
│                                 │
│         まだ履歴がありません       │  ← Colors.subText, 中央配置
│                                 │
└─────────────────────────────────┘
```

### カード内の表示要素

| 要素 | 値の例 | スタイル |
|------|--------|---------|
| 日時 | `2026/03/16 14:30` | `Colors.text`, 14px, bold |
| モード + ラウンド数 | `ホットシート · 12ラウンド` | `Colors.subText`, 13px |
| ブラインド + 初期チップ | `SB/BB: 5/10  初期: 1000` | `Colors.subText`, 12px |
| プレイヤー名 | `Alice` | `Colors.text`, 14px |
| チップ変動 | `+250` / `-100` / `±0` | 正: `Colors.pot`(緑), 負: `Colors.call`(赤), 零: `Colors.subText` |
| 最終チップ | `1250` | `Colors.subText`, 14px |

### モード表示名マッピング

```typescript
const MODE_LABELS: Record<GameRecord['mode'], string> = {
  'hotseat': 'ホットシート',
  'ble-host': 'BLE Host',
  'ble-client': 'BLE Client',
};
```

---

## 3. コンポーネント構成

### ファイル構成

```
src/components/history/
├── GameHistoryScreen.tsx     — メイン画面コンポーネント（FlatList + ヘッダー + 空状態）
├── GameRecordCard.tsx        — 1件のGameRecordを表示するカード
└── PlayerResultRow.tsx       — 1プレイヤーの結果行

app/
└── history.tsx               — Expo Router ページ（GameHistoryScreen をラップ）
```

### GameHistoryScreen

```typescript
// src/components/history/GameHistoryScreen.tsx

import React, { useState, useEffect } from 'react';
import { View, FlatList, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../theme/colors';
import { GameRecord } from '../../services/persistence/types';
import { GameRepository } from '../../services/persistence/GameRepository';
import { GameRecordCard } from './GameRecordCard';

interface GameHistoryScreenProps {
  repository: GameRepository;
}

export function GameHistoryScreen({ repository }: GameHistoryScreenProps) {
  const router = useRouter();
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    repository.getGameHistory().then(history => {
      setRecords([...history].reverse());  // 新しい順
      setLoading(false);
    });
  }, [repository]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()}>
          <Text style={styles.backText}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ゲーム履歴</Text>
        <View style={styles.headerSpacer} />
      </View>

      {!loading && records.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>まだ履歴がありません</Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.date}
          renderItem={({ item }) => <GameRecordCard record={item} />}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}
```

### GameRecordCard

```typescript
// src/components/history/GameRecordCard.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';
import { GameRecord } from '../../services/persistence/types';
import { PlayerResultRow } from './PlayerResultRow';

const MODE_LABELS: Record<GameRecord['mode'], string> = {
  'hotseat': 'ホットシート',
  'ble-host': 'BLE Host',
  'ble-client': 'BLE Client',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface GameRecordCardProps {
  record: GameRecord;
}

export function GameRecordCard({ record }: GameRecordCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.date}>{formatDate(record.date)}</Text>
      <Text style={styles.meta}>
        {MODE_LABELS[record.mode]} · {record.rounds}ラウンド
      </Text>
      <Text style={styles.settings}>
        SB/BB: {record.blinds.sb}/{record.blinds.bb}  初期: {record.initialChips}
      </Text>
      <View style={styles.divider} />
      {record.results.map((result) => (
        <PlayerResultRow key={result.name} result={result} />
      ))}
    </View>
  );
}
```

### PlayerResultRow

```typescript
// src/components/history/PlayerResultRow.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

interface PlayerResultRowProps {
  result: { name: string; chipChange: number; finalChips: number };
}

export function PlayerResultRow({ result }: PlayerResultRowProps) {
  const changeColor =
    result.chipChange > 0 ? Colors.pot :
    result.chipChange < 0 ? Colors.call :
    Colors.subText;

  const changeText =
    result.chipChange > 0 ? `+${result.chipChange}` :
    result.chipChange < 0 ? String(result.chipChange) :
    '±0';

  return (
    <View style={styles.row}>
      <Text style={styles.name}>{result.name}</Text>
      <Text style={[styles.change, { color: changeColor }]}>{changeText}</Text>
      <Text style={styles.finalChips}>{result.finalChips}</Text>
    </View>
  );
}
```

---

## 4. Expo Router ページ

```typescript
// app/history.tsx

import { GameHistoryScreen } from '../src/components/history/GameHistoryScreen';
import { repository } from '../src/services/persistence';

export default function HistoryPage() {
  return <GameHistoryScreen repository={repository} />;
}
```

---

## 5. ロビー画面への導線追加

`LobbyView.tsx` の「ゲーム開始」ボタンの上に「ゲーム履歴」リンクを追加する。

```typescript
// LobbyView.tsx への変更箇所

// import 追加
import { useRouter } from 'expo-router';  // 既存

// lobbyMode === 'local' ブロック内、チップリセットボタンの下に追加
<TouchableOpacity
  testID="history-btn"
  style={styles.historyBtn}
  onPress={() => router.push('/history')}
>
  <Text style={styles.historyBtnText}>ゲーム履歴</Text>
</TouchableOpacity>

// スタイル追加
historyBtn: {
  alignItems: 'center',
  paddingVertical: 8,
  marginTop: 8,
},
historyBtnText: {
  color: Colors.active,
  fontSize: 14,
},
```

配置順:
1. チップリセットボタン（既存）
2. **ゲーム履歴ボタン（新規）**
3. ゲーム開始ボタン（既存）

---

## 6. データフロー

```
LobbyView                    app/history.tsx
  │                               │
  │  router.push('/history')      │
  │──────────────────────────────>│
  │                               │
  │                     GameHistoryScreen
  │                          │
  │                          │ useEffect
  │                          │ repository.getGameHistory()
  │                          │──────────> AsyncStorageGameRepository
  │                          │<────────── GameRecord[] (古い順)
  │                          │
  │                          │ [...history].reverse()
  │                          │ setRecords(新しい順)
  │                          │
  │                          │ FlatList
  │                          │ ├── GameRecordCard
  │                          │ │   ├── PlayerResultRow
  │                          │ │   ├── PlayerResultRow
  │                          │ │   └── PlayerResultRow
  │                          │ ├── GameRecordCard
  │                          │ │   └── ...
  │                          │ └── ...
  │                          │
  │  router.back()            │
  │<──────────────────────────│
```

### 設計判断

- **repository をpropsで注入:** テスト時に `InMemoryGameRepository` を渡せる。LobbyViewと同じパターン
- **画面マウント時に1回だけ取得:** リアルタイム更新は不要（履歴画面を開くのはゲーム終了後）
- **reverse()でクライアント側ソート:** APIの返却順（古い順）を変更せず、表示側で逆順にする
- **keyExtractor に `date` を使用:** ISO 8601タイムスタンプがユニークID（Doc 4の設計）
- **loading状態:** 初回ロード中はFlatListを表示（空のまま）。ロード完了後に空状態を判定。スピナーは過剰なので不使用

---

## 7. スタイル詳細

### カラーマッピング

| 用途 | 色 | 値 |
|------|----|----|
| 画面背景 | `Colors.background` | `#1A1A2E` |
| カード背景 | `Colors.table` | `#16213E` |
| テキスト | `Colors.text` | `#FFFFFF` |
| サブテキスト | `Colors.subText` | `#9CA3AF` |
| チップ増加 | `Colors.pot` | `#10B981` |
| チップ減少 | `Colors.call` | `#EF4444` |
| 履歴ボタン | `Colors.active` | `#06B6D4` |

### カードスタイル

```typescript
const styles = StyleSheet.create({
  // GameHistoryScreen
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
  },
  backText: { color: Colors.active, fontSize: 16 },
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: 'bold' },
  headerSpacer: { width: 48 },  // 戻るボタンと同幅でタイトルを中央揃え
  listContent: { padding: 16, gap: 12 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: Colors.subText, fontSize: 16 },

  // GameRecordCard
  card: {
    backgroundColor: Colors.table,
    borderRadius: 12,
    padding: 16,
  },
  date: { color: Colors.text, fontSize: 14, fontWeight: 'bold' },
  meta: { color: Colors.subText, fontSize: 13, marginTop: 2 },
  settings: { color: Colors.subText, fontSize: 12, marginTop: 2 },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 10,
  },

  // PlayerResultRow
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  name: { color: Colors.text, fontSize: 14, flex: 1 },
  change: { fontSize: 14, fontWeight: '600', width: 80, textAlign: 'right' },
  finalChips: { color: Colors.subText, fontSize: 14, width: 70, textAlign: 'right' },
});
```

---

## 8. テスト方針

### コンポーネントテスト

| テスト | ファイル | 検証項目 |
|--------|---------|---------|
| 履歴一覧表示 | `GameHistoryScreen.test.tsx` | InMemoryRepositoryに3件保存 → 3枚のカードが新しい順に表示 |
| 空状態 | `GameHistoryScreen.test.tsx` | 履歴0件 → 「まだ履歴がありません」表示 |
| 戻るボタン | `GameHistoryScreen.test.tsx` | 「戻る」タップ → `router.back()` 呼び出し |
| カード表示内容 | `GameRecordCard.test.tsx` | GameRecord渡し → 日時、モード、ラウンド数、ブラインド、初期チップが正しく表示 |
| プレイヤー結果行 | `PlayerResultRow.test.tsx` | chipChange正 → 緑テキスト、負 → 赤テキスト、零 → グレーテキスト |
| 日時フォーマット | `GameRecordCard.test.tsx` | ISO 8601 → `YYYY/MM/DD HH:mm` 形式 |
| モードラベル | `GameRecordCard.test.tsx` | `'hotseat'` → `'ホットシート'`、`'ble-host'` → `'BLE Host'` |

### テスト方針

- `InMemoryGameRepository` を使用してrepositoryをモック（AsyncStorageのモック不要）
- `expo-router` の `useRouter` はモック: `{ back: jest.fn(), push: jest.fn() }`
- `formatDate` は純粋関数なので単体テスト可能

### テストファイル

```
tests/history/
├── GameHistoryScreen.test.tsx
├── GameRecordCard.test.tsx
└── PlayerResultRow.test.tsx
```

---

## 9. Scope

### 今回のスコープ

- `app/history.tsx` — Expo Router ページ
- `src/components/history/GameHistoryScreen.tsx` — メイン画面
- `src/components/history/GameRecordCard.tsx` — カードコンポーネント
- `src/components/history/PlayerResultRow.tsx` — プレイヤー結果行
- `src/components/lobby/LobbyView.tsx` — 履歴ボタン追加
- 上記の全Jestテスト

### スコープ外

- 履歴のフィルタリング・検索機能
- 履歴の削除機能
- プレイヤー別統計（勝率・平均収支など）
- 履歴詳細画面（ハンド単位のリプレイ）
- プルリフレッシュ・ページネーション（最大50件で十分）
- `GameRepository` インターフェースの変更

### 依存関係

- Doc 4（Data Persistence）の `GameRepository` / `GameRecord` が実装済みであること
- `@react-native-async-storage/async-storage` が導入済みであること（Doc 4で追加済み）
