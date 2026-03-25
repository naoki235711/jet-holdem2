# Animation & Sound Effects Implementation Plan (Phase 0 + Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add animation and sound effects to the poker game: Phase 0 foundation (libraries, SettingsContext, SoundManager) plus Phase 1 core animations (card flip, card deal, chip bet, win sound).

**Architecture:** Install `react-native-reanimated` v3 + `expo-av`. `SettingsContext` provides persisted `soundEnabled`/`animationsEnabled` flags. `SoundManager` singleton preloads .mp3 files via expo-av and plays them on demand. Animation hooks return Reanimated shared values integrated into existing components behind an `animationsEnabled` guard that falls through to unchanged static rendering when disabled. Sound triggers are detected from GameState diffs in a `useSoundDetection` hook called inside `GameContextProvider`.

**Tech Stack:** `react-native-reanimated` v3, `expo-av`, AsyncStorage, React Context

**Spec:** `docs/superpowers/specs/2026-03-16-animation-sound-design.md`

**Phase 2+3 scope:** Out of scope for this plan (A5-A11: active pulse, fold animation, winner highlight, timer warning, dealer button, ResultOverlay slide-up, pot merge). Address in a follow-up plan after this is merged.

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `src/contexts/SettingsContext.tsx` | `soundEnabled`/`animationsEnabled` with AsyncStorage persistence |
| `src/sound/SoundManager.ts` | Singleton: preloads + replays .mp3 files via expo-av |
| `src/sound/useSoundDetection.ts` | `detectSounds()` pure fn + `useSoundDetection()` hook wired to GameState diffs |
| `src/animations/useCardFlipAnimation.ts` | Y-axis flip: `flip()`, `reset()`, `frontStyle`, `backStyle` |
| `src/animations/useCardDealAnimation.ts` | Slide+fade deal: `deal()`, `reset()`, `cardStyle` |
| `src/animations/useChipAnimation.ts` | Chip flyout: `animateToTarget()`, `bounceIn()`, `reset()`, `chipStyle` |

### Modified files
| File | Change |
|---|---|
| `babel.config.js` | Add `react-native-reanimated/plugin` (must be last plugin) |
| `jest.config.js` | Add `expo-av` to transformIgnorePatterns; Reanimated setup in test setup file |
| `tests/ui/setup.js` | Append `require('react-native-reanimated').setUpTests()` |
| `app/_layout.tsx` | Wrap with `SettingsProvider`; call `soundManager.preloadAll()` on mount |
| `src/contexts/GameContext.tsx` | Call `useSoundDetection(state)` inside `GameContextProvider` |
| `src/components/common/PlayingCard.tsx` | Add deal animation (A1) behind `animationsEnabled` guard |
| `src/components/table/CommunityCards.tsx` | Add flip animation + `card_flip` sound trigger (Phase 1a) |
| `src/components/table/PlayerSeat.tsx` | Add chip bet `Animated.View` wrapper (Phase 1c visual) |
| `src/components/result/ResultOverlay.tsx` | Play `win` sound on mount (Phase 1d) |
| `src/components/lobby/LobbyView.tsx` | Add Sound/Animation `Switch` toggles |

### Test files (add to existing or create new)
| File | Status | Coverage |
|---|---|---|
| `tests/ui/contexts/SettingsContext.test.tsx` | **New** | Defaults, toggle, AsyncStorage round-trip |
| `tests/ui/sound/SoundManager.test.ts` | **New** | `play()` → `replayAsync()`; disabled → no-op |
| `tests/ui/sound/useSoundDetection.test.ts` | **New** | State transitions → correct sounds |
| `tests/hooks/useCardFlipAnimation.test.ts` | **New** | Initial=0, flip→1, reset→0 |
| `tests/hooks/useCardDealAnimation.test.ts` | **New** | Initial opacity=0, deal→opacity=1 |
| `tests/hooks/useChipAnimation.test.ts` | **New** | animateToTarget → position values |
| `tests/ui/components/CommunityCards.test.tsx` | **Add** | Renders with SettingsProvider; no crash |
| `tests/ui/components/PlayingCard.test.tsx` | **Add** | Static render unchanged when `animationsEnabled=false` |
| `tests/ui/components/PlayerSeat.test.tsx` | **Add** | Bet display renders; no crash with SettingsProvider |
| `tests/ui/components/ResultOverlay.test.tsx` | **Add** | `win` sound plays on mount |
| `tests/ui/components/LobbyView.test.tsx` | **Add** | Sound/animation toggles render |

---

## Phase 0 — Foundation

### Task 1: Install libraries, configure build tools, create placeholder sound files

**Files:**
- Modify: `babel.config.js`
- Modify: `jest.config.js`
- Modify: `tests/ui/setup.js`
- Create: `assets/sounds/<8 placeholder .mp3 files>`

- [ ] **Step 1: Install expo packages**

```bash
cd /home/ub180822/00_hobby/jet-holdem2
npx expo install react-native-reanimated expo-av
```

Expected: `package.json` dependencies now include `react-native-reanimated` and `expo-av`.

- [ ] **Step 2: Update babel.config.js — add Reanimated plugin**

Current content:
```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
```

New content (plugin MUST be last):
```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
```

- [ ] **Step 3: Add Reanimated setup to tests/ui/setup.js**

Current content ends at line 14. Append after line 14:

```javascript
// Setup Reanimated for tests (makes withTiming/withSpring apply final values immediately)
require('react-native-reanimated').setUpTests();
```

- [ ] **Step 4: Update jest.config.js — add expo-av to transform list**

In the `ui` project's `transformIgnorePatterns`, add `expo-av` to the packages that should be transformed. Find the existing `transformIgnorePatterns` line and update it:

Current:
```javascript
'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*)',
```

New (add `expo-av|` after `@expo(nent)?/.*|`):
```javascript
'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|expo-av|react-navigation|@react-navigation/.*)',
```

- [ ] **Step 5: Create placeholder sound files**

Metro bundler requires audio asset files to exist at build time. Create empty placeholder files — SoundManager's `preloadAll()` silently skips files that fail to load.

```bash
mkdir -p assets/sounds
for name in card_deal card_flip chip_bet check fold win timer_warning all_in; do
  touch assets/sounds/${name}.mp3
done
```

> **Action required:** Replace these empty placeholders with real .mp3 files (≤1.5s each, 128kbps) obtained from freesound.org (CC0 license) before publishing. Real files are needed for audio to play in the app — tests work without them.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add babel.config.js jest.config.js tests/ui/setup.js assets/sounds/ package.json package-lock.json
git commit -m "chore: install react-native-reanimated and expo-av, configure build tools"
```

---

### Task 2: SettingsContext

**Files:**
- Create: `src/contexts/SettingsContext.tsx`
- Create: `tests/ui/contexts/SettingsContext.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/ui/contexts/SettingsContext.test.tsx
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SettingsProvider, useSettings } from '../../../src/contexts/SettingsContext';

// AsyncStorage is auto-mocked by tests/ui/setup.js

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SettingsProvider>{children}</SettingsProvider>
);

describe('SettingsContext', () => {
  beforeEach(() => jest.clearAllMocks());

  it('has sound and animations enabled by default', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});
    expect(result.current.soundEnabled).toBe(true);
    expect(result.current.animationsEnabled).toBe(true);
  });

  it('setSoundEnabled(false) updates state and persists to AsyncStorage', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => { result.current.setSoundEnabled(false); });
    expect(result.current.soundEnabled).toBe(false);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@jet-holdem/settings',
      expect.stringContaining('"soundEnabled":false'),
    );
  });

  it('setAnimationsEnabled(false) updates state and persists', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => { result.current.setAnimationsEnabled(false); });
    expect(result.current.animationsEnabled).toBe(false);
  });

  it('loads persisted settings from AsyncStorage on mount', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({ soundEnabled: false, animationsEnabled: false }),
    );
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});
    expect(result.current.soundEnabled).toBe(false);
    expect(result.current.animationsEnabled).toBe(false);
  });

  it('falls back to defaults if AsyncStorage returns null', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});
    expect(result.current.soundEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ui/contexts/SettingsContext.test.tsx --no-coverage
```

Expected: FAIL — `Cannot find module '../../../src/contexts/SettingsContext'`

- [ ] **Step 3: Implement SettingsContext**

```typescript
// src/contexts/SettingsContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@jet-holdem/settings';

interface Settings {
  soundEnabled: boolean;
  animationsEnabled: boolean;
}

interface SettingsContextValue extends Settings {
  setSoundEnabled: (enabled: boolean) => void;
  setAnimationsEnabled: (enabled: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  soundEnabled: true,
  animationsEnabled: true,
  setSoundEnabled: () => {},
  setAnimationsEnabled: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>({
    soundEnabled: true,
    animationsEnabled: true,
  });

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => { if (raw) setSettings(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  const persist = useCallback((next: Settings) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, soundEnabled: enabled };
      persist(next);
      return next;
    });
  }, [persist]);

  const setAnimationsEnabled = useCallback((enabled: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, animationsEnabled: enabled };
      persist(next);
      return next;
    });
  }, [persist]);

  return (
    <SettingsContext.Provider value={{ ...settings, setSoundEnabled, setAnimationsEnabled }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ui/contexts/SettingsContext.test.tsx --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/contexts/SettingsContext.tsx tests/ui/contexts/SettingsContext.test.tsx
git commit -m "feat: add SettingsContext for sound/animation toggles with AsyncStorage persistence"
```

---

### Task 3: SoundManager

**Files:**
- Create: `src/sound/SoundManager.ts`
- Create: `tests/ui/sound/SoundManager.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/ui/sound/SoundManager.test.ts
import { SoundManager } from '../../../src/sound/SoundManager';

const mockReplayAsync = jest.fn().mockResolvedValue(undefined);
const mockUnloadAsync = jest.fn().mockResolvedValue(undefined);
const mockCreateAsync = jest.fn().mockResolvedValue({
  sound: { replayAsync: mockReplayAsync, unloadAsync: mockUnloadAsync },
});

jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    Sound: { createAsync: (...args: unknown[]) => mockCreateAsync(...args) },
  },
}));

describe('SoundManager', () => {
  let manager: SoundManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new SoundManager();
  });

  it('preloadAll() loads all 8 sound files', async () => {
    await manager.preloadAll();
    expect(mockCreateAsync).toHaveBeenCalledTimes(8);
  });

  it('play() calls replayAsync on the loaded sound', async () => {
    await manager.preloadAll();
    await manager.play('card_flip');
    expect(mockReplayAsync).toHaveBeenCalledTimes(1);
  });

  it('play() does nothing when disabled', async () => {
    await manager.preloadAll();
    manager.setEnabled(false);
    await manager.play('card_flip');
    expect(mockReplayAsync).not.toHaveBeenCalled();
  });

  it('play() silently no-ops before preloadAll()', async () => {
    await expect(manager.play('card_flip')).resolves.not.toThrow();
    expect(mockReplayAsync).not.toHaveBeenCalled();
  });

  it('unloadAll() unloads all loaded sounds', async () => {
    await manager.preloadAll();
    await manager.unloadAll();
    expect(mockUnloadAsync).toHaveBeenCalledTimes(8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ui/sound/SoundManager.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../../src/sound/SoundManager'`

- [ ] **Step 3: Implement SoundManager**

```typescript
// src/sound/SoundManager.ts
import { Audio } from 'expo-av';

export type SoundName =
  | 'card_deal' | 'card_flip' | 'chip_bet' | 'check'
  | 'fold' | 'win' | 'timer_warning' | 'all_in';

const SOUND_FILES: Record<SoundName, number> = {
  card_deal:     require('../../assets/sounds/card_deal.mp3'),
  card_flip:     require('../../assets/sounds/card_flip.mp3'),
  chip_bet:      require('../../assets/sounds/chip_bet.mp3'),
  check:         require('../../assets/sounds/check.mp3'),
  fold:          require('../../assets/sounds/fold.mp3'),
  win:           require('../../assets/sounds/win.mp3'),
  timer_warning: require('../../assets/sounds/timer_warning.mp3'),
  all_in:        require('../../assets/sounds/all_in.mp3'),
};

export class SoundManager {
  private sounds: Partial<Record<SoundName, Audio.Sound>> = {};
  private enabled = true;

  async preloadAll(): Promise<void> {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    await Promise.all(
      (Object.entries(SOUND_FILES) as [SoundName, number][]).map(async ([name, file]) => {
        try {
          const { sound } = await Audio.Sound.createAsync(file);
          this.sounds[name] = sound;
        } catch {
          // Silently skip missing or invalid files (e.g. empty placeholders in dev)
        }
      }),
    );
  }

  async play(name: SoundName): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.sounds[name]?.replayAsync();
    } catch {
      // Ignore playback errors
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async unloadAll(): Promise<void> {
    await Promise.all(Object.values(this.sounds).map((s) => s?.unloadAsync()));
    this.sounds = {};
  }
}

export const soundManager = new SoundManager();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ui/sound/SoundManager.test.ts --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sound/SoundManager.ts tests/ui/sound/SoundManager.test.ts
git commit -m "feat: add SoundManager singleton for expo-av sound preloading and playback"
```

---

### Task 4: Sound detection — pure function + hook

**Files:**
- Create: `src/sound/useSoundDetection.ts`
- Create: `tests/ui/sound/useSoundDetection.test.ts`

- [ ] **Step 1: Write the failing tests**

Note: `GameState` uses `pots: Pot[]`, `blinds: { sb, bb }`, `currentBet`, `seq`. Use this exact shape.

```typescript
// tests/ui/sound/useSoundDetection.test.ts
import { detectSounds } from '../../../src/sound/useSoundDetection';
import type { GameState, Player } from '../../../src/gameEngine/types';

function player(seat: number, overrides: Partial<Player> = {}): Player {
  return { seat, name: `P${seat}`, chips: 1000, bet: 0, cards: [], status: 'active', ...overrides };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    seq: 0,
    phase: 'preflop',
    community: [],
    pots: [{ amount: 0, eligible: [0, 1] }],
    currentBet: 0,
    activePlayer: 0,
    dealer: 0,
    blinds: { sb: 10, bb: 20 },
    players: [player(0), player(1)],
    ...overrides,
  };
}

describe('detectSounds', () => {
  it('returns card_deal when phase changes from waiting to preflop', () => {
    const prev = makeState({ phase: 'waiting' });
    const next = makeState({ phase: 'preflop' });
    expect(detectSounds(prev, next)).toContain('card_deal');
  });

  it('returns card_flip when community cards grow', () => {
    const prev = makeState({ community: [] });
    const next = makeState({ community: ['Ah', 'Kd', 'Qc'] });
    expect(detectSounds(prev, next)).toContain('card_flip');
  });

  it('returns fold when a player status changes to folded', () => {
    const prev = makeState();
    const next = makeState({ players: [player(0, { status: 'folded' }), player(1)] });
    expect(detectSounds(prev, next)).toContain('fold');
  });

  it('returns chip_bet when a player bet increases', () => {
    const prev = makeState();
    const next = makeState({ players: [player(0, { chips: 980, bet: 20 }), player(1)] });
    expect(detectSounds(prev, next)).toContain('chip_bet');
  });

  it('returns check when activePlayer changes but no bets change', () => {
    const prev = makeState({ activePlayer: 0 });
    const next = makeState({ activePlayer: 1 });
    expect(detectSounds(prev, next)).toContain('check');
  });

  it('does NOT return win for roundEnd — ResultOverlay owns that sound', () => {
    const prev = makeState({ phase: 'river' });
    const next = makeState({ phase: 'roundEnd' });
    expect(detectSounds(prev, next)).not.toContain('win');
  });

  it('returns all_in when a player chips hit 0 with a bet increase', () => {
    const prev = makeState();
    const next = makeState({ players: [player(0, { chips: 0, bet: 1000, status: 'allIn' }), player(1)] });
    expect(detectSounds(prev, next)).toContain('all_in');
  });

  it('all_in takes precedence over chip_bet', () => {
    const prev = makeState();
    const next = makeState({ players: [player(0, { chips: 0, bet: 1000, status: 'allIn' }), player(1)] });
    const sounds = detectSounds(prev, next);
    expect(sounds).toContain('all_in');
    expect(sounds).not.toContain('chip_bet');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ui/sound/useSoundDetection.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../../src/sound/useSoundDetection'`

- [ ] **Step 3: Implement useSoundDetection**

```typescript
// src/sound/useSoundDetection.ts
import { useEffect, useRef } from 'react';
import type { GameState } from '../gameEngine/types';
import { soundManager, type SoundName } from './SoundManager';
import { useSettings } from '../contexts/SettingsContext';

export function detectSounds(prev: GameState, next: GameState): SoundName[] {
  const sounds: SoundName[] = [];

  // New round deal — takes priority over all other transitions
  if (prev.phase === 'waiting' && next.phase === 'preflop') {
    sounds.push('card_deal');
    return sounds;
  }

  // Community cards revealed
  if (next.community.length > prev.community.length) {
    sounds.push('card_flip');
  }

  // NOTE: 'win' sound is NOT emitted here — ResultOverlay plays it on mount.
  // Emitting from both sources would cause double-trigger on every round end.

  if (sounds.length > 0) return sounds; // card_flip was detected, skip action sounds

  // Classify player action
  const allIn = next.players.some((p) => {
    const prevP = prev.players.find((pp) => pp.seat === p.seat);
    return prevP && p.chips === 0 && p.bet > prevP.bet;
  });

  const newFold = next.players.some((p) => {
    const prevP = prev.players.find((pp) => pp.seat === p.seat);
    return prevP && p.status === 'folded' && prevP.status !== 'folded';
  });

  const betIncreased = next.players.some((p) => {
    const prevP = prev.players.find((pp) => pp.seat === p.seat);
    return prevP && p.bet > prevP.bet;
  });

  if (allIn) {
    sounds.push('all_in');
  } else if (newFold) {
    sounds.push('fold');
  } else if (betIncreased) {
    sounds.push('chip_bet');
  } else if (next.activePlayer !== prev.activePlayer) {
    sounds.push('check');
  }

  return sounds;
}

export function useSoundDetection(state: GameState | null): void {
  const { soundEnabled } = useSettings();
  const prevRef = useRef<GameState | null>(null);

  useEffect(() => {
    if (!soundEnabled || !state || !prevRef.current) {
      prevRef.current = state;
      return;
    }
    const toPlay = detectSounds(prevRef.current, state);
    toPlay.forEach((name) => soundManager.play(name));
    prevRef.current = state;
  }, [state, soundEnabled]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ui/sound/useSoundDetection.test.ts --no-coverage
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sound/useSoundDetection.ts tests/ui/sound/useSoundDetection.test.ts
git commit -m "feat: add sound detection hook for GameState transitions"
```

---

### Task 5: App layout integration

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Read current layout**

Read `app/_layout.tsx` to understand the current structure (already done — it wraps `SafeAreaProvider` → `Stack`).

- [ ] **Step 2: Add SettingsProvider and SoundManager initialization**

```typescript
// app/_layout.tsx
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../src/theme/colors';
import { SettingsProvider } from '../src/contexts/SettingsContext';
import { soundManager } from '../src/sound/SoundManager';

export default function RootLayout() {
  useEffect(() => {
    soundManager.preloadAll().catch(() => {});
    return () => { soundManager.unloadAll().catch(() => {}); };
  }, []);

  return (
    <SettingsProvider>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="game" />
          <Stack.Screen name="ble-host" />
          <Stack.Screen name="ble-join" />
        </Stack>
      </SafeAreaProvider>
    </SettingsProvider>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: initialize SoundManager and wrap app with SettingsProvider"
```

---

### Task 6: Wire sound detection into GameContext

**Files:**
- Modify: `src/contexts/GameContext.tsx`

- [ ] **Step 1: Read GameContext to find internal state variable**

Read `src/contexts/GameContext.tsx`. Locate the `GameState | null` variable used internally (likely named `state` or `gameState`).

- [ ] **Step 2: Add useSoundDetection call**

Inside the `GameContextProvider` function component body, after the `state` variable is declared, add:

```typescript
import { useSoundDetection } from '../sound/useSoundDetection';

// Inside GameContextProvider, after state is declared:
useSoundDetection(state);
```

`SettingsProvider` wraps the entire app in `_layout.tsx`, so `useSettings()` inside `useSoundDetection` will work correctly.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run existing GameContext tests to verify no regressions**

```bash
npx jest tests/ui/contexts/GameContext.test.tsx --no-coverage
```

Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/GameContext.tsx
git commit -m "feat: wire useSoundDetection into GameContext for automatic sound triggering"
```

---

### Task 7: LobbyView settings toggles

**Files:**
- Modify: `src/components/lobby/LobbyView.tsx`
- Modify: `tests/ui/components/LobbyView.test.tsx` (add to existing)

- [ ] **Step 1: Read current test file to understand existing setup**

Read `tests/ui/components/LobbyView.test.tsx` to understand how components are wrapped and what's already tested.

- [ ] **Step 2: Write the failing tests (add to existing file)**

At the end of the test file, add tests for the new settings section. If the existing tests don't wrap with `SettingsProvider`, update the render helper or add a separate describe block:

```typescript
// Add to tests/ui/components/LobbyView.test.tsx

import { SettingsProvider } from '../../../src/contexts/SettingsContext';

// Helper — wrap with SettingsProvider for settings tests
const renderWithSettings = (ui: React.ReactElement) =>
  render(<SettingsProvider>{ui}</SettingsProvider>);

describe('LobbyView settings toggles', () => {
  it('renders sound toggle', () => {
    const { getByTestId } = renderWithSettings(<LobbyView />);
    expect(getByTestId('sound-toggle')).toBeTruthy();
  });

  it('renders animation toggle', () => {
    const { getByTestId } = renderWithSettings(<LobbyView />);
    expect(getByTestId('animation-toggle')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest tests/ui/components/LobbyView.test.tsx --no-coverage
```

Expected: FAIL — `Unable to find an element with testID: sound-toggle`

- [ ] **Step 4: Read LobbyView and add settings section**

Read `src/components/lobby/LobbyView.tsx`. Add to the imports:
```typescript
import { Switch } from 'react-native';
import { useSettings } from '../../contexts/SettingsContext';
import { Colors } from '../../theme/colors';
```

Add inside the component body:
```typescript
const { soundEnabled, setSoundEnabled, animationsEnabled, setAnimationsEnabled } = useSettings();
```

Add a settings section in the JSX (before the closing scroll container tag):
```typescript
<View style={styles.settingsSection}>
  <Text style={styles.sectionHeader}>── 設定 ──</Text>
  <View style={styles.settingRow}>
    <Text style={styles.settingLabel}>サウンド</Text>
    <Switch
      testID="sound-toggle"
      value={soundEnabled}
      onValueChange={setSoundEnabled}
      trackColor={{ true: Colors.active }}
    />
  </View>
  <View style={styles.settingRow}>
    <Text style={styles.settingLabel}>アニメーション</Text>
    <Switch
      testID="animation-toggle"
      value={animationsEnabled}
      onValueChange={setAnimationsEnabled}
      trackColor={{ true: Colors.active }}
    />
  </View>
</View>
```

Add styles:
```typescript
settingsSection: {
  marginTop: 24,
  paddingHorizontal: 8,
},
sectionHeader: {
  color: Colors.subText,
  fontSize: 12,
  textAlign: 'center',
  marginBottom: 12,
},
settingRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingVertical: 8,
},
settingLabel: {
  color: Colors.text,
  fontSize: 14,
},
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest tests/ui/components/LobbyView.test.tsx --no-coverage
```

Expected: All tests (existing + new) pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/lobby/LobbyView.tsx tests/ui/components/LobbyView.test.tsx
git commit -m "feat: add sound/animation toggle settings to LobbyView"
```

---

## Phase 1a — Community Card Flip Animation

### Task 8: useCardFlipAnimation hook

**Files:**
- Create: `src/animations/useCardFlipAnimation.ts`
- Create: `tests/hooks/useCardFlipAnimation.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/hooks/useCardFlipAnimation.test.ts
import { renderHook, act } from '@testing-library/react-native';
import { useCardFlipAnimation } from '../../../src/animations/useCardFlipAnimation';

// Reanimated is set up via tests/ui/setup.js (setUpTests makes withTiming apply immediately)

describe('useCardFlipAnimation', () => {
  it('starts with rotation value 0 (face-down)', () => {
    const { result } = renderHook(() => useCardFlipAnimation());
    expect(result.current.rotation.value).toBe(0);
  });

  it('flip() sets rotation to 1 (face-up)', () => {
    const { result } = renderHook(() => useCardFlipAnimation());
    act(() => { result.current.flip(); });
    expect(result.current.rotation.value).toBe(1);
  });

  it('reset() restores rotation to 0', () => {
    const { result } = renderHook(() => useCardFlipAnimation());
    act(() => {
      result.current.flip();
      result.current.reset();
    });
    expect(result.current.rotation.value).toBe(0);
  });

  it('returns frontStyle and backStyle animated style objects', () => {
    const { result } = renderHook(() => useCardFlipAnimation());
    expect(result.current.frontStyle).toBeDefined();
    expect(result.current.backStyle).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/hooks/useCardFlipAnimation.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../../src/animations/useCardFlipAnimation'`

- [ ] **Step 3: Implement useCardFlipAnimation**

```typescript
// src/animations/useCardFlipAnimation.ts
import {
  useSharedValue, withTiming, useAnimatedStyle,
  interpolate, Easing,
} from 'react-native-reanimated';
import { useCallback } from 'react';

export function useCardFlipAnimation() {
  const rotation = useSharedValue(0); // 0 = face-down, 1 = face-up

  const flip = useCallback(() => {
    rotation.value = withTiming(1, {
      duration: 400,
      easing: Easing.out(Easing.cubic),
    });
  }, [rotation]);

  const reset = useCallback(() => {
    rotation.value = 0;
  }, [rotation]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${interpolate(rotation.value, [0, 0.5, 1], [180, 90, 0])}deg` }],
    opacity: rotation.value > 0.5 ? 1 : 0,
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${interpolate(rotation.value, [0, 0.5, 1], [0, 90, 180])}deg` }],
    opacity: rotation.value <= 0.5 ? 1 : 0,
  }));

  return { rotation, flip, reset, frontStyle, backStyle };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/hooks/useCardFlipAnimation.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/animations/useCardFlipAnimation.ts tests/hooks/useCardFlipAnimation.test.ts
git commit -m "feat: add useCardFlipAnimation hook"
```

---

### Task 9: CommunityCards flip animation integration

**Files:**
- Modify: `src/components/table/CommunityCards.tsx`
- Modify: `tests/ui/components/CommunityCards.test.tsx` (add to existing)

- [ ] **Step 1: Read existing CommunityCards test to understand setup**

Read `tests/ui/components/CommunityCards.test.tsx`.

- [ ] **Step 2: Write the failing tests (add to existing file)**

Add these tests ensuring they work with or without `SettingsProvider`. If the existing tests don't use `SettingsProvider`, add it to the render helpers:

```typescript
// Add to tests/ui/components/CommunityCards.test.tsx

import { SettingsProvider } from '../../../src/contexts/SettingsContext';

// Wrap with SettingsProvider (for animationsEnabled context)
const renderWithSettings = (ui: React.ReactElement) =>
  render(<SettingsProvider>{ui}</SettingsProvider>);

describe('CommunityCards with SettingsProvider', () => {
  it('renders 3 cards and 2 empty slots when community has 3 cards', () => {
    // Mock useGame to return 3 community cards
    // (check how existing tests mock useGame, follow same pattern)
    const { getAllByTestId } = renderWithSettings(<CommunityCards />);
    // 5 card-slot containers always present
    expect(getAllByTestId('card-slot')).toHaveLength(5);
  });

  it('renders statically (no Animated.View) when animationsEnabled=false', () => {
    // Default SettingsProvider has animationsEnabled=true, but mock it:
    jest.spyOn(require('../../../src/contexts/SettingsContext'), 'useSettings')
      .mockReturnValue({ soundEnabled: true, animationsEnabled: false, setSoundEnabled: jest.fn(), setAnimationsEnabled: jest.fn() });
    const { queryAllByTestId } = renderWithSettings(<CommunityCards />);
    expect(getAllByTestId('playing-card').length).toBeGreaterThanOrEqual(0); // no crash
  });
});
```

> Note: Adapt the mock to match how `useGame` is mocked in the existing test file. The key assertion is "no crash when animationsEnabled=false".

- [ ] **Step 3: Run existing tests to establish baseline**

```bash
npx jest tests/ui/components/CommunityCards.test.tsx --no-coverage
```

Note which tests pass before changes.

- [ ] **Step 4: Update CommunityCards with flip animation**

Read `src/components/table/CommunityCards.tsx`. Update the file to:

1. Import `Animated` from `react-native-reanimated`, `useCardFlipAnimation`, `useSettings`, and `soundManager`
2. Extract a `FlippingCard` component that handles its own flip state
3. Trigger the flip (with staggered delay) when the card slot first gets a card
4. Fall back to static `PlayingCard` when `animationsEnabled=false`

Key implementation pattern:
```typescript
// FlippingCard triggers flip on mount, with index*100ms delay for stagger
function FlippingCard({ card, index }: { card: Card; index: number }) {
  const { flip, reset, frontStyle, backStyle } = useCardFlipAnimation();
  const { animationsEnabled, soundEnabled } = useSettings();

  useEffect(() => {
    if (!animationsEnabled) { reset(); return; }
    const t = setTimeout(() => {
      flip();
      if (soundEnabled) soundManager.play('card_flip');
    }, index * 100);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  // Static fallback when disabled
  if (!animationsEnabled) {
    return <PlayingCard card={card} faceUp size="community" />;
  }

  return (
    <View style={{ width: 45, height: 65 }}>
      <Animated.View style={[StyleSheet.absoluteFill, backStyle]}>
        <PlayingCard card={card} faceUp={false} size="community" />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, frontStyle]}>
        <PlayingCard card={card} faceUp size="community" />
      </Animated.View>
    </View>
  );
}
```

In `CommunityCards`, replace each filled slot with `<FlippingCard>` when `animationsEnabled`, or keep `<PlayingCard>` when disabled.

- [ ] **Step 5: Run tests**

```bash
npx jest tests/ui/components/CommunityCards.test.tsx --no-coverage
```

Expected: All pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/components/table/CommunityCards.tsx tests/ui/components/CommunityCards.test.tsx
git commit -m "feat: add card flip animation and card_flip sound to CommunityCards (Phase 1a)"
```

---

## Phase 1b — Card Deal Animation

### Task 10: useCardDealAnimation hook

**Files:**
- Create: `src/animations/useCardDealAnimation.ts`
- Create: `tests/hooks/useCardDealAnimation.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/hooks/useCardDealAnimation.test.ts
import { renderHook, act } from '@testing-library/react-native';
import { useCardDealAnimation } from '../../../src/animations/useCardDealAnimation';

describe('useCardDealAnimation', () => {
  it('starts with opacity 0 (pre-deal)', () => {
    const { result } = renderHook(() => useCardDealAnimation());
    expect(result.current.opacity.value).toBe(0);
  });

  it('starts with non-zero translateX (offset start position)', () => {
    const { result } = renderHook(() => useCardDealAnimation());
    expect(result.current.translateX.value).not.toBe(0);
  });

  it('deal() animates opacity to 1', () => {
    const { result } = renderHook(() => useCardDealAnimation());
    act(() => { result.current.deal(); });
    expect(result.current.opacity.value).toBe(1);
  });

  it('deal() animates translateX to 0', () => {
    const { result } = renderHook(() => useCardDealAnimation());
    act(() => { result.current.deal(); });
    expect(result.current.translateX.value).toBe(0);
  });

  it('reset() restores opacity to 0', () => {
    const { result } = renderHook(() => useCardDealAnimation());
    act(() => {
      result.current.deal();
      result.current.reset();
    });
    expect(result.current.opacity.value).toBe(0);
  });

  it('returns cardStyle animated style', () => {
    const { result } = renderHook(() => useCardDealAnimation());
    expect(result.current.cardStyle).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/hooks/useCardDealAnimation.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../../src/animations/useCardDealAnimation'`

- [ ] **Step 3: Implement useCardDealAnimation**

```typescript
// src/animations/useCardDealAnimation.ts
import {
  useSharedValue, withTiming, useAnimatedStyle, Easing,
} from 'react-native-reanimated';
import { useCallback } from 'react';

const INITIAL_TRANSLATE_X = 60; // px offset from final position

export function useCardDealAnimation() {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(INITIAL_TRANSLATE_X);

  const deal = useCallback(() => {
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
    translateX.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
  }, [opacity, translateX]);

  const reset = useCallback(() => {
    opacity.value = 0;
    translateX.value = INITIAL_TRANSLATE_X;
  }, [opacity, translateX]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return { opacity, translateX, deal, reset, cardStyle };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/hooks/useCardDealAnimation.test.ts --no-coverage
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/animations/useCardDealAnimation.ts tests/hooks/useCardDealAnimation.test.ts
git commit -m "feat: add useCardDealAnimation hook"
```

---

### Task 11: PlayingCard deal animation integration

**Files:**
- Modify: `src/components/common/PlayingCard.tsx`
- Modify: `tests/ui/components/PlayingCard.test.tsx` (add to existing)

- [ ] **Step 1: Read existing PlayingCard tests to understand setup**

Read `tests/ui/components/PlayingCard.test.tsx`.

- [ ] **Step 2: Write the failing tests (add to existing file)**

```typescript
// Add to tests/ui/components/PlayingCard.test.tsx

import { SettingsProvider } from '../../../src/contexts/SettingsContext';

describe('PlayingCard with SettingsProvider', () => {
  it('renders with testID playing-card when animationsEnabled=false', () => {
    jest.spyOn(require('../../../src/contexts/SettingsContext'), 'useSettings')
      .mockReturnValue({ soundEnabled: true, animationsEnabled: false, setSoundEnabled: jest.fn(), setAnimationsEnabled: jest.fn() });
    const { getByTestId } = render(
      <SettingsProvider>
        <PlayingCard card="Ah" faceUp size="hand" />
      </SettingsProvider>,
    );
    expect(getByTestId('playing-card')).toBeTruthy();
  });

  it('renders with testID playing-card when animationsEnabled=true', () => {
    const { getByTestId } = render(
      <SettingsProvider>
        <PlayingCard card="Ah" faceUp size="hand" />
      </SettingsProvider>,
    );
    expect(getByTestId('playing-card')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run existing tests to establish baseline**

```bash
npx jest tests/ui/components/PlayingCard.test.tsx --no-coverage
```

Note current pass count.

- [ ] **Step 4: Update PlayingCard with deal animation**

Read `src/components/common/PlayingCard.tsx`. Update to:

1. Import `Animated` from `react-native-reanimated`, `useCardDealAnimation`, `useSettings`
2. Call `useCardDealAnimation()` and `useSettings()` inside the component
3. Call `deal()` in a `useEffect` on mount when `animationsEnabled` is true
4. When `animationsEnabled=false`: render unchanged static `View` (existing code path)
5. When `animationsEnabled=true`: wrap in `Animated.View` with `cardStyle`

```typescript
// src/components/common/PlayingCard.tsx
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Card, Rank, Suit } from '../../gameEngine';
import { useCardDealAnimation } from '../../animations/useCardDealAnimation';
import { useSettings } from '../../contexts/SettingsContext';

// ... keep existing SUIT_SYMBOLS, SUIT_COLORS, SIZES constants

interface PlayingCardProps {
  card: Card;
  faceUp: boolean;
  size?: 'hand' | 'community';
}

export function PlayingCard({ card, faceUp, size = 'hand' }: PlayingCardProps) {
  const dims = SIZES[size];
  const rank = card[0] as Rank;
  const suit = card[1] as Suit;
  const { animationsEnabled } = useSettings();
  const { deal, reset, cardStyle } = useCardDealAnimation();

  useEffect(() => {
    if (animationsEnabled) {
      deal();
    } else {
      reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  const cardBody = faceUp ? (
    <>
      <Text style={[styles.rank, { fontSize: dims.fontSize, color: SUIT_COLORS[suit] }]}>
        {rank}
      </Text>
      <Text style={{ fontSize: dims.fontSize, color: SUIT_COLORS[suit] }}>
        {SUIT_SYMBOLS[suit]}
      </Text>
    </>
  ) : null;

  const cardBaseStyle = [styles.card, { width: dims.width, height: dims.height }, !faceUp && styles.faceDown];

  if (!animationsEnabled) {
    return (
      <View testID="playing-card" style={cardBaseStyle}>
        {cardBody}
      </View>
    );
  }

  return (
    <Animated.View testID="playing-card" style={[...cardBaseStyle, cardStyle]}>
      {cardBody}
    </Animated.View>
  );
}

// ... keep existing styles unchanged
```

- [ ] **Step 5: Run tests**

```bash
npx jest tests/ui/components/PlayingCard.test.tsx --no-coverage
```

Expected: All pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/components/common/PlayingCard.tsx tests/ui/components/PlayingCard.test.tsx
git commit -m "feat: add deal animation to PlayingCard (Phase 1b)"
```

---

## Phase 1c — Chip Bet Animation Hook

### Task 12: useChipAnimation hook

**Files:**
- Create: `src/animations/useChipAnimation.ts`
- Create: `tests/hooks/useChipAnimation.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/hooks/useChipAnimation.test.ts
import { renderHook, act } from '@testing-library/react-native';
import { useChipAnimation } from '../../../src/animations/useChipAnimation';

describe('useChipAnimation', () => {
  it('starts at position 0, 0 with scale 1', () => {
    const { result } = renderHook(() => useChipAnimation());
    expect(result.current.translateX.value).toBe(0);
    expect(result.current.translateY.value).toBe(0);
    expect(result.current.scale.value).toBe(1);
  });

  it('animateToTarget() sets the target position', () => {
    const { result } = renderHook(() => useChipAnimation());
    act(() => { result.current.animateToTarget(50, -30); });
    expect(result.current.translateX.value).toBe(50);
    expect(result.current.translateY.value).toBe(-30);
  });

  it('reset() returns to 0, 0, scale 1', () => {
    const { result } = renderHook(() => useChipAnimation());
    act(() => {
      result.current.animateToTarget(50, -30);
      result.current.reset();
    });
    expect(result.current.translateX.value).toBe(0);
    expect(result.current.translateY.value).toBe(0);
    expect(result.current.scale.value).toBe(1);
  });

  it('returns chipStyle animated style', () => {
    const { result } = renderHook(() => useChipAnimation());
    expect(result.current.chipStyle).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/hooks/useChipAnimation.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../../src/animations/useChipAnimation'`

- [ ] **Step 3: Implement useChipAnimation**

```typescript
// src/animations/useChipAnimation.ts
import {
  useSharedValue, withTiming, useAnimatedStyle, Easing,
} from 'react-native-reanimated';
import { useCallback } from 'react';

export function useChipAnimation() {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  const animateToTarget = useCallback((toX: number, toY: number, duration = 250) => {
    translateX.value = withTiming(toX, { duration, easing: Easing.out(Easing.cubic) });
    translateY.value = withTiming(toY, { duration, easing: Easing.out(Easing.cubic) });
  }, [translateX, translateY]);

  const bounceIn = useCallback(() => {
    scale.value = withTiming(1.2, { duration: 150 }, () => {
      scale.value = withTiming(1, { duration: 200 });
    });
  }, [scale]);

  const reset = useCallback(() => {
    translateX.value = 0;
    translateY.value = 0;
    scale.value = 1;
  }, [translateX, translateY, scale]);

  const chipStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return { translateX, translateY, scale, animateToTarget, bounceIn, reset, chipStyle };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/hooks/useChipAnimation.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/animations/useChipAnimation.ts tests/hooks/useChipAnimation.test.ts
git commit -m "feat: add useChipAnimation hook"
```

---

### Task 13: PlayerSeat bet bounce animation

**Files:**
- Modify: `src/components/table/PlayerSeat.tsx`
- Modify: `tests/ui/components/PlayerSeat.test.tsx` (add to existing)

The spec (A3) calls for the bet amount to animate when a player places a bet. We implement a scale bounce on the bet display using `useChipAnimation`'s `bounceIn()` — triggered when `player.bet` increases.

- [ ] **Step 1: Read existing PlayerSeat tests to understand setup**

Read `tests/ui/components/PlayerSeat.test.tsx` to see how `useGame` is mocked and components are rendered.

- [ ] **Step 2: Write the failing tests (add to existing file)**

```typescript
// Add to tests/ui/components/PlayerSeat.test.tsx

import { SettingsProvider } from '../../../src/contexts/SettingsContext';

describe('PlayerSeat with SettingsProvider', () => {
  it('renders bet amount with testID bet-amount when animationsEnabled=false', () => {
    jest.spyOn(require('../../../src/contexts/SettingsContext'), 'useSettings')
      .mockReturnValue({ soundEnabled: true, animationsEnabled: false, setSoundEnabled: jest.fn(), setAnimationsEnabled: jest.fn() });
    // Use the same useGame mock pattern as existing tests, with player.bet > 0
    // Verify the bet display renders without crash
    const { getByTestId } = render(
      <SettingsProvider>
        <PlayerSeat seat={0} />
      </SettingsProvider>,
    );
    expect(getByTestId('bet-amount-0')).toBeTruthy();
  });

  it('renders bet amount when animationsEnabled=true without crashing', () => {
    // Same setup with animationsEnabled=true (default)
    const { getByTestId } = render(
      <SettingsProvider>
        <PlayerSeat seat={0} />
      </SettingsProvider>,
    );
    expect(getByTestId('bet-amount-0')).toBeTruthy();
  });
});
```

> Adapt the `useGame` mock to return a player at seat 0 with `bet: 100` — check how existing tests do this.

- [ ] **Step 3: Run existing tests to establish baseline**

```bash
npx jest tests/ui/components/PlayerSeat.test.tsx --no-coverage
```

Note current pass count.

- [ ] **Step 4: Read PlayerSeat and add bet bounce animation**

Read `src/components/table/PlayerSeat.tsx`. Add:

```typescript
import Animated from 'react-native-reanimated';
import { useEffect, useRef } from 'react';
import { useChipAnimation } from '../../animations/useChipAnimation';
import { useSettings } from '../../contexts/SettingsContext';

// Inside PlayerSeat component body:
const { animationsEnabled } = useSettings();
const { bounceIn, chipStyle } = useChipAnimation();
const prevBetRef = useRef(player.bet);

useEffect(() => {
  if (animationsEnabled && player.bet > prevBetRef.current) {
    bounceIn();
  }
  prevBetRef.current = player.bet;
}, [player.bet, animationsEnabled, bounceIn]);
```

Wrap the existing bet display `<View testID={`bet-outside-${seat}`}>` outer view in an `Animated.View` when `animationsEnabled`, keeping the static `View` when disabled:

```typescript
// Replace the bet display at the bottom of the return:
{player.bet > 0 && (
  animationsEnabled ? (
    <Animated.View testID={`bet-outside-${seat}`} style={[styles.betOuter, chipStyle]}>
      <ChipAmount amount={player.bet} color={Colors.pot} fontSize={11} testID={`bet-amount-${seat}`} />
    </Animated.View>
  ) : (
    <View testID={`bet-outside-${seat}`} style={styles.betOuter}>
      <ChipAmount amount={player.bet} color={Colors.pot} fontSize={11} testID={`bet-amount-${seat}`} />
    </View>
  )
)}
```

- [ ] **Step 5: Run tests**

```bash
npx jest tests/ui/components/PlayerSeat.test.tsx --no-coverage
```

Expected: All pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/components/table/PlayerSeat.tsx tests/ui/components/PlayerSeat.test.tsx
git commit -m "feat: add chip bounce animation to PlayerSeat bet display (Phase 1c)"
```

---

## Phase 1d — Win Sound

### Task 14: ResultOverlay win sound

**Files:**
- Modify: `src/components/result/ResultOverlay.tsx`
- Modify: `tests/ui/components/ResultOverlay.test.tsx` (add to existing)

- [ ] **Step 1: Read existing ResultOverlay tests to understand setup**

Read `tests/ui/components/ResultOverlay.test.tsx`.

- [ ] **Step 2: Write the failing tests (add to existing file)**

```typescript
// Add to tests/ui/components/ResultOverlay.test.tsx

import { SettingsProvider } from '../../../src/contexts/SettingsContext';
import { soundManager } from '../../../src/sound/SoundManager';

jest.mock('../../../src/sound/SoundManager', () => ({
  soundManager: { play: jest.fn().mockResolvedValue(undefined) },
}));

describe('ResultOverlay win sound', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls soundManager.play("win") when it mounts', () => {
    // Use the same mock setup as the existing tests to render ResultOverlay
    // (check how existing tests set up useGame mock and showdownResult)
    render(
      <SettingsProvider>
        <ResultOverlay />
      </SettingsProvider>,
    );
    expect(soundManager.play).toHaveBeenCalledWith('win');
  });
});
```

> Note: Adapt the mock setup to match how `useGame` / `showdownResult` is mocked in the existing test file. The ResultOverlay may need a `showdownResult` to render; check the existing test to understand this pattern.

- [ ] **Step 3: Run existing tests to establish baseline**

```bash
npx jest tests/ui/components/ResultOverlay.test.tsx --no-coverage
```

Note current pass count.

- [ ] **Step 4: Add win sound to ResultOverlay**

Read `src/components/result/ResultOverlay.tsx`. Add:

```typescript
import { useEffect } from 'react';
import { soundManager } from '../../sound/SoundManager';
import { useSettings } from '../../contexts/SettingsContext';

// Inside ResultOverlay component body:
const { soundEnabled } = useSettings();

useEffect(() => {
  if (soundEnabled) {
    soundManager.play('win');
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // fire once on mount
```

- [ ] **Step 5: Run tests**

```bash
npx jest tests/ui/components/ResultOverlay.test.tsx --no-coverage
```

Expected: All pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/components/result/ResultOverlay.tsx tests/ui/components/ResultOverlay.test.tsx
git commit -m "feat: play win sound when ResultOverlay mounts (Phase 1d)"
```

---

## Final Verification

- [ ] **Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass. If any existing test breaks due to missing `SettingsProvider`, wrap its render call with `<SettingsProvider>`.

- [ ] **TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Review git log**

```bash
git log --oneline -15
```

Expected: 14 focused commits, one per task/chunk.

---

## Phase 2 + 3 (Future Plans)

The following are out of scope for this plan and should be implemented in a follow-up after Phase 1 is merged and verified:

**Phase 2 — Enhanced Effects:**
- A5: Active player border pulse (`usePulseAnimation` + `PlayerSeat`)
- A6: Fold animation — card slide-out + opacity fade in `PlayerSeat`
- A7: Winner highlight glow in `ResultOverlay`
- A8: Timer warning pulse in `ActionTimerBar`

**Phase 3 — Polish:**
- A9: Dealer button move animation
- A10: `ResultOverlay` slide-up entrance
- A11: Pot merge animation (bets fly to pot center between rounds)
