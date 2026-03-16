# Animations & Sound Effects Design

**Date:** 2026-03-16
**Depends on:** UI Design (2026-03-14)

## Overview

ゲーム体験を向上させるアニメーションとサウンドエフェクトを段階的に追加する。カード配布、コミュニティカードの公開、チップ移動、勝利演出などの視覚効果と、各アクションに対応するサウンドを実装する。

**設計方針:**
- **インクリメンタル:** 各コンポーネント単位で独立して追加可能。全部揃わなくても既存UIが壊れない
- **ノンブロッキング:** アニメーションはゲーム進行をブロックしない。スキップ可能
- **オプショナル:** 設定トグルでサウンド・アニメーションを個別にON/OFF可能
- **パフォーマンス:** React Native ReanimatedのUIスレッド実行により、JSスレッドを圧迫しない

---

## 1. ライブラリ選定

| ライブラリ | 用途 | 理由 |
|---|---|---|
| `react-native-reanimated` (v3) | アニメーション | RN標準的な高性能アニメーションライブラリ。UIスレッドで実行されるためJSスレッドをブロックしない。Expo SDK 55対応 |
| `expo-av` | サウンド再生 | Expo公式のオーディオライブラリ。短いSE再生に十分。Config Plugin不要（Expo標準） |

### インストール

```bash
npx expo install react-native-reanimated expo-av
```

`babel.config.js` に Reanimated プラグイン追加:

```javascript
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'], // 末尾に追加
  };
};
```

---

## 2. アニメーションカタログ

各アニメーションの仕様とターゲットコンポーネント。優先度は Phase で管理。

### Phase 1: コアアニメーション

| ID | アニメーション | ターゲット | 説明 | 所要時間 |
|---|---|---|---|---|
| A1 | カード配布 | `PlayingCard` | デッキ位置（テーブル中央）から各PlayerSeatへスライドイン + フェードイン | 300ms/枚 |
| A2 | コミュニティカード公開 | `CommunityCards` | Y軸回転フリップ（裏面→表面）。flop: 3枚を100msずらして順次、turn/river: 1枚 | 400ms/枚 |
| A3 | チップベット | `PlayerSeat` | ベット額ラベルがPlayerSeat位置からポット方向へ飛ぶトゥイーン | 250ms |
| A4 | ポット収集 | `ResultOverlay` / `PotDisplay` | ポット位置から勝者のPlayerSeatへチップが飛ぶ + スケールバウンス | 500ms |

### Phase 2: 演出強化

| ID | アニメーション | ターゲット | 説明 | 所要時間 |
|---|---|---|---|---|
| A5 | アクティブ枠パルス | `PlayerSeat` | アクティブプレイヤーのシアン枠が緩やかにパルス（opacity 0.6 ↔ 1.0） | 1500ms loop |
| A6 | フォールド | `PlayerSeat` | カードが裏返り + 下方向にスライドアウト + opacity 0.5へ | 300ms |
| A7 | 勝者ハイライト | `ResultOverlay` | 勝者行がシアンに光るグロー + スケール微拡大 | 600ms |
| A8 | タイマー警告 | `PlayerSeat` | 残り5秒で枠がオレンジに変わり高速パルス | 500ms loop |

### Phase 3: ポリッシュ

| ID | アニメーション | ターゲット | 説明 | 所要時間 |
|---|---|---|---|---|
| A9 | ディーラーボタン移動 | `DealerButton` | 前ディーラー位置から次ディーラー位置へスライド | 400ms |
| A10 | ResultOverlay表示 | `ResultOverlay` | 下からスライドアップ + フェードイン（現在の`fade`を拡張） | 300ms |
| A11 | ポットマージ | `PotDisplay` | 各プレイヤーのベットがラウンド終了時にポット中央へ集約される | 400ms |

---

## 3. サウンドカタログ

### 音声ファイル

`assets/sounds/` ディレクトリに配置。フォーマットは `.mp3`（iOS/Android両対応、ファイルサイズ小）。

| ID | サウンド | トリガー | 説明 |
|---|---|---|---|
| S1 | `card_deal.mp3` | カード配布時 | カードを滑らせる短い音 |
| S2 | `card_flip.mp3` | コミュニティカード公開時 | カードをめくる音 |
| S3 | `chip_bet.mp3` | ベット/コール/レイズ実行時 | チップを積む音 |
| S4 | `check.mp3` | チェック実行時 | テーブルをノックする音 |
| S5 | `fold.mp3` | フォールド実行時 | カードを投げる音 |
| S6 | `win.mp3` | 勝者確定時（ResultOverlay表示） | 短いファンファーレ |
| S7 | `timer_warning.mp3` | タイマー残り5秒 | 短いビープ音（1秒ごとに再生） |
| S8 | `all_in.mp3` | オールイン時 | チップを大量に積む音 |

### 音声ファイル仕様

- 長さ: 各0.3〜1.5秒（SEとして短く）
- サンプリングレート: 44.1kHz
- フォーマット: MP3 128kbps
- 合計ファイルサイズ目安: 200KB以下

**音源の調達:** フリー音源サイト（freesound.org等）から取得するか、必要に応じて自作。ライセンスはCC0またはアプリ内利用可のものを選定。

---

## 4. 実装アーキテクチャ

### ディレクトリ構成

```
src/
├── animations/
│   ├── useCardDealAnimation.ts     # A1: カード配布
│   ├── useCardFlipAnimation.ts     # A2: フリップ
│   ├── useChipAnimation.ts         # A3, A4: チップ移動
│   └── usePulseAnimation.ts        # A5, A8: パルス
├── sound/
│   ├── SoundManager.ts             # サウンド再生管理（シングルトン）
│   └── useSoundEffect.ts           # コンポーネント用フック
├── contexts/
│   └── SettingsContext.tsx          # アニメーション/サウンド設定（新規）
└── ...
assets/
└── sounds/
    ├── card_deal.mp3
    ├── card_flip.mp3
    ├── chip_bet.mp3
    ├── check.mp3
    ├── fold.mp3
    ├── win.mp3
    ├── timer_warning.mp3
    └── all_in.mp3
```

### SoundManager

サウンドファイルのプリロードと再生を管理するシングルトン。`expo-av`の`Audio.Sound`を使用。

```typescript
// src/sound/SoundManager.ts
import { Audio } from 'expo-av';

type SoundName = 'card_deal' | 'card_flip' | 'chip_bet' | 'check' | 'fold' | 'win' | 'timer_warning' | 'all_in';

const SOUND_FILES: Record<SoundName, number> = {
  card_deal: require('../../assets/sounds/card_deal.mp3'),
  card_flip: require('../../assets/sounds/card_flip.mp3'),
  chip_bet: require('../../assets/sounds/chip_bet.mp3'),
  check: require('../../assets/sounds/check.mp3'),
  fold: require('../../assets/sounds/fold.mp3'),
  win: require('../../assets/sounds/win.mp3'),
  timer_warning: require('../../assets/sounds/timer_warning.mp3'),
  all_in: require('../../assets/sounds/all_in.mp3'),
};

class SoundManager {
  private sounds: Partial<Record<SoundName, Audio.Sound>> = {};
  private enabled = true;

  async preloadAll(): Promise<void> {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,  // iOSサイレントモードでも再生
    });
    for (const [name, file] of Object.entries(SOUND_FILES)) {
      const { sound } = await Audio.Sound.createAsync(file);
      this.sounds[name as SoundName] = sound;
    }
  }

  async play(name: SoundName): Promise<void> {
    if (!this.enabled) return;
    const sound = this.sounds[name];
    if (!sound) return;
    await sound.replayAsync();  // 最初から再生
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async unloadAll(): Promise<void> {
    for (const sound of Object.values(this.sounds)) {
      await sound?.unloadAsync();
    }
    this.sounds = {};
  }
}

export const soundManager = new SoundManager();
```

**設計ポイント:**
- `preloadAll()` はアプリ起動時（`_layout.tsx`）に1回呼ぶ。ゲーム中のロード遅延を防止
- `replayAsync()` で再生位置を先頭に戻して即再生。連続再生にも対応
- `playsInSilentModeIOS: true` でiOSのサイレントスイッチに影響されない（ポーカーアプリなので音が重要）

### アニメーションフック例: useCardFlipAnimation

```typescript
// src/animations/useCardFlipAnimation.ts
import { useSharedValue, withTiming, useAnimatedStyle, interpolate, Easing } from 'react-native-reanimated';
import { useCallback } from 'react';

export function useCardFlipAnimation() {
  const rotation = useSharedValue(0); // 0 = 裏面, 1 = 表面

  const flip = useCallback(() => {
    rotation.value = withTiming(1, {
      duration: 400,
      easing: Easing.out(Easing.cubic),
    });
  }, [rotation]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { rotateY: `${interpolate(rotation.value, [0, 0.5, 1], [180, 90, 0])}deg` },
    ],
    opacity: rotation.value > 0.5 ? 1 : 0,
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { rotateY: `${interpolate(rotation.value, [0, 0.5, 1], [0, 90, 180])}deg` },
    ],
    opacity: rotation.value <= 0.5 ? 1 : 0,
  }));

  const reset = useCallback(() => {
    rotation.value = 0;
  }, [rotation]);

  return { flip, reset, frontStyle, backStyle };
}
```

### コンポーネント統合例: PlayingCard

既存の`PlayingCard`にアニメーションを追加する場合の変更イメージ:

```typescript
// PlayingCard.tsx（アニメーション追加後のイメージ）
import Animated from 'react-native-reanimated';
import { useCardFlipAnimation } from '../../animations/useCardFlipAnimation';
import { useSettings } from '../../contexts/SettingsContext';

export function PlayingCard({ card, faceUp, size = 'hand' }: PlayingCardProps) {
  const { animationsEnabled } = useSettings();
  const { flip, frontStyle, backStyle } = useCardFlipAnimation();

  // faceUpが変わったらフリップアニメーション発火
  useEffect(() => {
    if (faceUp && animationsEnabled) {
      flip();
    }
  }, [faceUp, animationsEnabled, flip]);

  // アニメーション無効時は現行のまま（Animated.Viewではなく通常View）
  if (!animationsEnabled) {
    return <CurrentStaticImplementation card={card} faceUp={faceUp} size={size} />;
  }

  return (
    <View style={/* ... */}>
      <Animated.View style={[styles.card, frontStyle]}>
        {/* 表面 */}
      </Animated.View>
      <Animated.View style={[styles.card, styles.faceDown, backStyle, StyleSheet.absoluteFill]}>
        {/* 裏面 */}
      </Animated.View>
    </View>
  );
}
```

**段階的統合の原則:** アニメーション無効時は `if (!animationsEnabled)` で既存レンダリングをそのまま返す。これによりアニメーション追加前後でUIの回帰テストが容易。

---

## 5. SettingsContext

アニメーションとサウンドのON/OFF設定を管理するContext。AsyncStorageに永続化。

```typescript
// src/contexts/SettingsContext.tsx
interface Settings {
  soundEnabled: boolean;        // サウンドON/OFF（デフォルト: true）
  animationsEnabled: boolean;   // アニメーションON/OFF（デフォルト: true）
}

interface SettingsContextValue extends Settings {
  setSoundEnabled: (enabled: boolean) => void;
  setAnimationsEnabled: (enabled: boolean) => void;
}
```

### 永続化

- `AsyncStorage` に `@jet-holdem/settings` キーで保存（既にAsyncStorageは依存済み）
- 起動時に読み込み、変更時に非同期で保存
- 保存失敗時は次回起動時にデフォルト値にフォールバック

### 設定UI

LobbyView に設定セクションを追加（既存のモード選択の下）:

```
── 設定 ──
[x] サウンド
[x] アニメーション
```

トグルスイッチ（React Nativeの`Switch`コンポーネント）で切替。ゲーム中でも変更可能にする場合は、将来的にGameScreen内にギアアイコンメニューを追加。

---

## 6. アニメーションのゲームフロー統合

### ノンブロッキング設計

アニメーションはゲームステート更新を**遅延させない**。GameServiceのstate更新は即座に行い、アニメーションは見た目上の演出としてオーバーラップする。

```
[GameService]  state更新（即座）
     │
     ├──→ [React] UI再レンダー + アニメーション開始
     │          │
     │          └── 300ms後: アニメーション完了（見た目が追いつく）
     │
     └──→ [次のアクション受付可能]（アニメーション完了を待たない）
```

### スキップ方針

- ユーザーアクション（ボタンタップ等）があればアニメーション途中でも即座にジャンプ（`cancelAnimation` + 最終値にスナップ）
- 全員オールイン時のflop→turn→river連続公開: 各フリップ間に短い遅延（200ms）を入れるが、画面タップで全てスキップ可能

### コミュニティカード段階公開時の遅延

flop時に3枚が同時にstateに入るが、アニメーションは100msずつずらして順次フリップ:

```typescript
// CommunityCards内のアニメーション制御
cards.forEach((card, i) => {
  const delay = i * 100; // 0ms, 100ms, 200ms
  setTimeout(() => flipCard(i), delay);
});
```

`setTimeout`はアニメーション発火のきっかけのみ。実際のアニメーションはReanimatedがUIスレッドで処理。

---

## 7. サウンド再生タイミング

サウンドはGameContextのsubscribeコールバック内で、state差分から検出して再生する。コンポーネントのレンダーサイクルに依存しない。

```typescript
// GameContext内 or 専用フック内
function detectAndPlaySounds(prevState: GameState | null, newState: GameState): void {
  if (!prevState) return;

  // コミュニティカード公開
  if (newState.community.length > prevState.community.length) {
    soundManager.play('card_flip');
  }

  // ラウンド開始（カード配布）
  if (prevState.phase === 'waiting' && newState.phase === 'preflop') {
    soundManager.play('card_deal');
  }

  // アクション検出（activePlayerが変わった = 前のプレイヤーがアクション実行済み）
  // より正確にはアクション種別の検出が必要 → 将来のlastAction追加で対応
}
```

**アクション種別の検出について:** 現在のGameStateには直前のアクション種別（fold/check/call/raise）を示すフィールドがない。正確なサウンド分岐のためにGameStateに`lastAction`フィールドを追加することを推奨するが、Phase 1では以下の簡易判定で対応:

| 判定条件 | サウンド |
|---|---|
| `community.length` が増加 | `card_flip` |
| phase が `waiting` → `preflop` | `card_deal` |
| プレイヤーの `bet` が増加 | `chip_bet` |
| プレイヤーの `status` が `folded` に変化 | `fold` |
| `activePlayer` が変わったが bet 変化なし | `check` |
| phase が `roundEnd` に変化 | `win` |
| プレイヤーの `chips` が 0 かつ `bet` が増加 | `all_in` |

---

## 8. テスト方針

### アニメーション

| 対象 | 方法 | 内容 |
|---|---|---|
| アニメーションフック | Jest + `@testing-library/react-hooks` | shared valueの初期値・最終値の検証。タイミングの正確性はテスト対象外 |
| コンポーネント統合 | RNTL | `animationsEnabled: false` 時に既存レンダリングと同一の出力になることを検証 |
| ノンブロッキング性 | 手動テスト | アニメーション中にアクションボタンが有効であることを実機で確認 |

### サウンド

| 対象 | 方法 | 内容 |
|---|---|---|
| SoundManager | Jest（expo-avモック） | `play()` 呼び出しで対応する`Sound.replayAsync()`が呼ばれることを検証 |
| 再生タイミング | Jest | state差分検出ロジックの単体テスト（`detectAndPlaySounds`） |
| 設定トグル | Jest | `enabled: false` 時に`play()`が何も実行しないことを検証 |
| 実機サウンド | 手動テスト | 各サウンドが適切なタイミングで再生されることを実機で確認 |

### Reanimatedテスト環境

Jest で Reanimated をテストするための設定:

```javascript
// jest.config.js に追加
preset: 'react-native-reanimated/jest',
```

もしくは `jest.setup.js` で:

```javascript
require('react-native-reanimated').setUpTests();
```

---

## 9. 実装チャンク（段階的構築）

本機能は大きいため、Phase単位で分けて段階的に実装する。各Phaseは独立してマージ可能。

| Phase | チャンク | 内容 | 前提 |
|---|---|---|---|
| 0 | 基盤セットアップ | `react-native-reanimated` + `expo-av` インストール、babel設定、`SettingsContext`、`SoundManager`スケルトン、`assets/sounds/`ディレクトリ | なし |
| 1a | コミュニティカードフリップ (A2) | `useCardFlipAnimation` + `CommunityCards`への統合 + `card_flip` サウンド | Phase 0 |
| 1b | カード配布 (A1) | `useCardDealAnimation` + `PlayingCard`/`PlayerSeat`への統合 + `card_deal` サウンド | Phase 0 |
| 1c | チップベット (A3) | `useChipAnimation` + `PlayerSeat`への統合 + `chip_bet`/`check`/`fold` サウンド | Phase 0 |
| 1d | ポット収集 (A4) | 勝者へのチップ移動 + `win` サウンド | Phase 0 |
| 2 | 演出強化 (A5-A8) | アクティブ枠パルス、フォールド演出、勝者ハイライト、タイマー警告 | Phase 1x |
| 3 | ポリッシュ (A9-A11) | ディーラーボタン移動、ResultOverlayスライドアップ、ポットマージ | Phase 2 |

**Phase 0を最初にマージし、以降は任意の順序で1a〜1dを個別に実装可能。** 各チャンクは独立しているため、優先度に応じて順序を入れ替えてよい。

---

## 10. スコープ

### 今回のスコープ（この設計書でカバー）

- アニメーション/サウンドの全体設計とアーキテクチャ
- ライブラリ選定と設定方法
- アニメーション/サウンドカタログ（仕様定義）
- SettingsContext設計
- SoundManager設計
- テスト方針
- 実装チャンクの分割計画

### スコープ外

- 音声ファイルの制作・調達（実装Phase 0で別途対応）
- ハプティクス（触覚フィードバック）— 将来検討
- BGM（バックグラウンドミュージック）— ポーカーアプリとしてはSEのみで十分
- パーティクルエフェクト（紙吹雪等）— ライブラリ追加が必要なため将来検討
- GameStateへの`lastAction`フィールド追加（ゲームエンジン変更） — サウンド再生の精度向上のため推奨だが、本設計のスコープ外。簡易判定で Phase 1 は対応
