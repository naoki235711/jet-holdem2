# Action UI Enhancement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add raise presets (instant-action, phase-specific sizing buttons) and pre-actions (BLE-mode toggle checkboxes that auto-execute when turn arrives).

**Architecture:** Two independent features sharing the action button area. Presets are a pure calculation utility + UI buttons in ActionButtons. Pre-actions are state managed in GameContext with a new PreActionBar component. No GameService/GameEngine changes.

**Tech Stack:** React Native, TypeScript, Jest, React Native Testing Library

**Spec:** `docs/superpowers/specs/2026-03-16-action-ui-enhancement-design.md`

---

## Chunk 1: Preset Calculator & Shared Types

### Task 1: Shared Types

**Files:**
- Create: `src/components/actions/types.ts`

- [ ] **Step 1: Create types file**

```typescript
// src/components/actions/types.ts

export type PreActionType = 'checkFold' | 'call' | 'callAny' | null;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/actions/types.ts
git commit -m "feat: add shared PreActionType definition"
```

---

### Task 2: Preset Calculator — TDD

**Files:**
- Create: `src/components/actions/presetCalculator.ts`
- Test: `tests/ui/components/presetCalculator.test.ts`

**Reference docs:**
- Spec Section 1: pot-sizing formula `raiseTo = currentBet + potAfterCall × fraction`
- `src/gameEngine/types.ts` for `GameState`, `Phase`, `Pot`, `Player`, `Blinds`

- [ ] **Step 1: Write failing tests for preflop presets**

```typescript
// tests/ui/components/presetCalculator.test.ts

import { calculatePresets, Preset } from '../../../src/components/actions/presetCalculator';
import { GameState } from '../../../src/gameEngine';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    seq: 1,
    phase: 'preflop',
    community: [],
    pots: [{ amount: 15, eligible: [0, 1, 2] }],
    currentBet: 10,
    activePlayer: 0,
    dealer: 0,
    blinds: { sb: 5, bb: 10 },
    players: [
      { seat: 0, name: 'A', chips: 990, status: 'active', bet: 0, cards: [] },
      { seat: 1, name: 'B', chips: 995, status: 'active', bet: 5, cards: [] },
      { seat: 2, name: 'C', chips: 990, status: 'active', bet: 10, cards: [] },
    ],
    ...overrides,
  };
}

describe('calculatePresets', () => {
  describe('preflop', () => {
    it('returns BB-multiple presets', () => {
      const state = makeState(); // bb=10
      const presets = calculatePresets(state, 0);
      expect(presets).toEqual([
        { label: '2.5BB', value: 30 },  // round(10*2.5 / 10) * 10 = 30
        { label: '3BB', value: 30 },     // 10*3 = 30
        { label: '4BB', value: 40 },     // 10*4 = 40
      ]);
    });

    it('rounds to BB unit', () => {
      const state = makeState({ blinds: { sb: 3, bb: 6 } });
      const presets = calculatePresets(state, 0);
      // 6*2.5=15 -> round(15/6)*6 = round(2.5)*6 = 3*6 = 18
      expect(presets[0]).toEqual({ label: '2.5BB', value: 18 });
      // 6*3=18
      expect(presets[1]).toEqual({ label: '3BB', value: 18 });
      // 6*4=24
      expect(presets[2]).toEqual({ label: '4BB', value: 24 });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ui/components/presetCalculator.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../../src/components/actions/presetCalculator'`

- [ ] **Step 3: Implement presetCalculator with preflop logic**

```typescript
// src/components/actions/presetCalculator.ts

import { GameState } from '../../gameEngine';

export type Preset = { label: string; value: number };

export function calculatePresets(state: GameState, mySeat: number): Preset[] {
  const bb = state.blinds.bb;

  if (state.phase === 'preflop') {
    return [
      { label: '2.5BB', value: round(bb * 2.5, bb) },
      { label: '3BB', value: round(bb * 3, bb) },
      { label: '4BB', value: round(bb * 4, bb) },
    ];
  }

  // postflop — implemented in next step
  return [];
}

function round(value: number, bb: number): number {
  return Math.round(value / bb) * bb;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ui/components/presetCalculator.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Write failing tests for postflop presets**

Add to the same test file:

```typescript
  describe('postflop', () => {
    it('returns pot-fraction presets with no bet (bet scenario)', () => {
      // pot=300, currentBet=0, myBet=0 → potAfterCall=300
      const state = makeState({
        phase: 'flop',
        pots: [{ amount: 300, eligible: [0, 1, 2] }],
        currentBet: 0,
        players: [
          { seat: 0, name: 'A', chips: 1000, status: 'active', bet: 0, cards: [] },
          { seat: 1, name: 'B', chips: 1000, status: 'active', bet: 0, cards: [] },
          { seat: 2, name: 'C', chips: 1000, status: 'active', bet: 0, cards: [] },
        ],
      });
      const presets = calculatePresets(state, 0);
      expect(presets).toEqual([
        { label: '1/3', value: 100 },   // 0 + 300*1/3 = 100
        { label: '1/2', value: 150 },   // 0 + 300*1/2 = 150
        { label: '2/3', value: 200 },   // 0 + 300*2/3 = 200
        { label: '3/4', value: 230 },   // 0 + 300*3/4 = 225 → round to 230 (bb=10)
        { label: 'Pot', value: 300 },   // 0 + 300*1.0 = 300
      ]);
    });

    it('returns pot-fraction presets facing a bet (raise scenario)', () => {
      // pot collected=200, opponent bet=100 → totalPot=300
      // currentBet=100, myBet=0 → callAmount=100, potAfterCall=400
      const state = makeState({
        phase: 'flop',
        pots: [{ amount: 200, eligible: [0, 1] }],
        currentBet: 100,
        players: [
          { seat: 0, name: 'A', chips: 1000, status: 'active', bet: 0, cards: [] },
          { seat: 1, name: 'B', chips: 900, status: 'active', bet: 100, cards: [] },
        ],
      });
      const presets = calculatePresets(state, 0);
      // potAfterCall = (200+100) + 100 = 400
      expect(presets).toEqual([
        { label: '1/3', value: 230 },   // 100 + 400/3 = 233 → round to 230
        { label: '1/2', value: 300 },   // 100 + 400/2 = 300
        { label: '2/3', value: 370 },   // 100 + 400*2/3 = 367 → round to 370
        { label: '3/4', value: 400 },   // 100 + 400*3/4 = 400
        { label: 'Pot', value: 500 },   // 100 + 400*1.0 = 500
      ]);
    });

    it('works on turn and river phases too', () => {
      const state = makeState({
        phase: 'turn',
        pots: [{ amount: 100, eligible: [0, 1] }],
        currentBet: 0,
        players: [
          { seat: 0, name: 'A', chips: 500, status: 'active', bet: 0, cards: [] },
          { seat: 1, name: 'B', chips: 500, status: 'active', bet: 0, cards: [] },
        ],
      });
      const presets = calculatePresets(state, 0);
      expect(presets[0].label).toBe('1/3');
      expect(presets[4].label).toBe('Pot');
      expect(presets[4].value).toBe(100); // 0 + 100*1.0
    });
  });
```

- [ ] **Step 6: Run test to verify new tests fail**

Run: `npx jest tests/ui/components/presetCalculator.test.ts --no-coverage`
Expected: FAIL — postflop returns `[]`

- [ ] **Step 7: Implement postflop logic**

Update `calculatePresets` in `src/components/actions/presetCalculator.ts`:

```typescript
export function calculatePresets(state: GameState, mySeat: number): Preset[] {
  const bb = state.blinds.bb;

  if (state.phase === 'preflop') {
    return [
      { label: '2.5BB', value: round(bb * 2.5, bb) },
      { label: '3BB', value: round(bb * 3, bb) },
      { label: '4BB', value: round(bb * 4, bb) },
    ];
  }

  const myPlayer = state.players.find(p => p.seat === mySeat)!;
  const totalPot = state.pots.reduce((s, p) => s + p.amount, 0)
    + state.players.reduce((s, p) => s + p.bet, 0);
  const callAmount = state.currentBet - myPlayer.bet;
  const potAfterCall = totalPot + callAmount;

  return [
    { label: '1/3', value: round(state.currentBet + potAfterCall / 3, bb) },
    { label: '1/2', value: round(state.currentBet + potAfterCall / 2, bb) },
    { label: '2/3', value: round(state.currentBet + potAfterCall * 2 / 3, bb) },
    { label: '3/4', value: round(state.currentBet + potAfterCall * 3 / 4, bb) },
    { label: 'Pot', value: round(state.currentBet + potAfterCall, bb) },
  ];
}
```

- [ ] **Step 8: Run all presetCalculator tests**

Run: `npx jest tests/ui/components/presetCalculator.test.ts --no-coverage`
Expected: PASS (all tests)

- [ ] **Step 9: Commit**

```bash
git add src/components/actions/presetCalculator.ts tests/ui/components/presetCalculator.test.ts
git commit -m "feat: add preset calculator with preflop BB-multiples and postflop pot-fractions"
```

---

## Chunk 2: PreActionBar Component

### Task 3: PreActionBar — TDD

**Files:**
- Create: `src/components/actions/PreActionBar.tsx`
- Test: `tests/ui/components/PreActionBar.test.tsx`

**Reference:**
- `src/components/actions/types.ts` for `PreActionType`
- `src/theme/colors.ts` for `Colors`
- Spec Section 2 & 3: toggle checkboxes, styles

- [ ] **Step 1: Write failing tests**

```tsx
// tests/ui/components/PreActionBar.test.tsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PreActionBar } from '../../../src/components/actions/PreActionBar';

describe('PreActionBar', () => {
  it('renders three toggle buttons', () => {
    render(<PreActionBar selected={null} onSelect={jest.fn()} callAmount={100} />);
    expect(screen.getByText('Check/Fold')).toBeTruthy();
    expect(screen.getByText('Call 100')).toBeTruthy();
    expect(screen.getByText('Call Any')).toBeTruthy();
  });

  it('calls onSelect with checkFold when Check/Fold pressed', () => {
    const onSelect = jest.fn();
    render(<PreActionBar selected={null} onSelect={onSelect} callAmount={100} />);
    fireEvent.press(screen.getByText('Check/Fold'));
    expect(onSelect).toHaveBeenCalledWith('checkFold');
  });

  it('calls onSelect with call when Call pressed', () => {
    const onSelect = jest.fn();
    render(<PreActionBar selected={null} onSelect={onSelect} callAmount={50} />);
    fireEvent.press(screen.getByText('Call 50'));
    expect(onSelect).toHaveBeenCalledWith('call');
  });

  it('calls onSelect with callAny when Call Any pressed', () => {
    const onSelect = jest.fn();
    render(<PreActionBar selected={null} onSelect={onSelect} callAmount={100} />);
    fireEvent.press(screen.getByText('Call Any'));
    expect(onSelect).toHaveBeenCalledWith('callAny');
  });

  it('deselects when pressing the already-selected button', () => {
    const onSelect = jest.fn();
    render(<PreActionBar selected="checkFold" onSelect={onSelect} callAmount={100} />);
    fireEvent.press(screen.getByText('Check/Fold'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('shows selected button with active styling (testID check)', () => {
    const { getByTestId } = render(
      <PreActionBar selected="call" onSelect={jest.fn()} callAmount={100} />,
    );
    // The selected button should have the active testID
    expect(getByTestId('preaction-call-selected')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ui/components/PreActionBar.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement PreActionBar**

```tsx
// src/components/actions/PreActionBar.tsx

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';
import { PreActionType } from './types';

interface PreActionBarProps {
  selected: PreActionType;
  onSelect: (action: PreActionType) => void;
  callAmount: number;
}

const BUTTONS: { key: Exclude<PreActionType, null>; label: (callAmount: number) => string }[] = [
  { key: 'checkFold', label: () => 'Check/Fold' },
  { key: 'call', label: (amt) => `Call ${amt}` },
  { key: 'callAny', label: () => 'Call Any' },
];

export function PreActionBar({ selected, onSelect, callAmount }: PreActionBarProps) {
  return (
    <View style={styles.container}>
      {BUTTONS.map(({ key, label }) => {
        const isSelected = selected === key;
        return (
          <TouchableOpacity
            key={key}
            testID={`preaction-${key}${isSelected ? '-selected' : ''}`}
            style={[styles.button, isSelected && styles.selectedButton]}
            onPress={() => onSelect(isSelected ? null : key)}
          >
            <Text style={[styles.text, isSelected && styles.selectedText]}>
              {label(callAmount)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    padding: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.subText,
    alignItems: 'center',
  },
  selectedButton: {
    borderColor: Colors.active,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
  },
  text: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  selectedText: {
    color: Colors.active,
  },
});
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/ui/components/PreActionBar.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/actions/PreActionBar.tsx tests/ui/components/PreActionBar.test.tsx
git commit -m "feat: add PreActionBar component with toggle checkboxes"
```

---

## Chunk 3: GameContext Pre-Action State

### Task 4: GameContext — Add pre-action state management

**Files:**
- Modify: `src/contexts/GameContext.tsx`
- Modify: `src/hooks/useGame.ts`
- Modify: `tests/ui/helpers/renderWithGame.tsx` (add preAction/setPreAction defaults)
- Test: `tests/ui/contexts/GameContext.test.tsx` (add pre-action tests)

**Reference:**
- Spec Section 4: `preAction` state, `mySeatRef`, `prevCurrentBetRef`, `autoResolveShowdown()`
- Existing `GameContext.tsx` lines 59-88: subscribe callback pattern

**Note:** Steps 1 and 2 must be applied together — Step 1 adds the fields to the test helper, Step 2 adds them to the TypeScript interface. Applying one without the other will cause type errors.

- [ ] **Step 1: Update renderWithGame helper**

Add `preAction` and `setPreAction` to the default context value in `tests/ui/helpers/renderWithGame.tsx`:

In the `defaultValue` object inside `renderWithGame()`, add after the `rematch` line:

```typescript
    preAction: null,
    setPreAction: jest.fn(),
```

- [ ] **Step 2: Update GameContextValue interface**

In `src/contexts/GameContext.tsx`, add to the `GameContextValue` interface (after `rematch`):

```typescript
  preAction: PreActionType;
  setPreAction: (action: PreActionType) => void;
```

Add import at top:

```typescript
import { PreActionType } from '../components/actions/types';
```

- [ ] **Step 3: Update useGame.ts**

No change needed — `useGame()` already returns the full `GameContextValue`. The new fields are automatically available.

- [ ] **Step 4: Add pre-action state to GameProvider**

In `src/contexts/GameContext.tsx`, inside `GameProvider` function body, add after `const initialChipsRef = ...`:

```typescript
  // Pre-action state (BLE modes only)
  const [preAction, setPreActionState] = useState<PreActionType>(null);
  const preActionRef = useRef<PreActionType>(null);
  const prevCurrentBetRef = useRef<number>(0);

  // mySeat: fixed seat for BLE modes. For hotseat/debug, pre-actions are disabled.
  // ble-host is always seat 0; ble-client gets viewingSeat (set from route param).
  const mySeatRef = useRef<number | null>(
    mode === 'ble-host' || mode === 'ble-client' ? viewingSeat : null,
  );

  const setPreAction = useCallback((pa: PreActionType) => {
    setPreActionState(pa);
    preActionRef.current = pa;
  }, []);
```

Also update `mySeatRef` when `viewingSeat` is set externally (for ble-client):

After the `setViewingSeat` state, add an effect:

```typescript
  useEffect(() => {
    if (mode === 'ble-host' || mode === 'ble-client') {
      mySeatRef.current = viewingSeat;
    }
  }, [viewingSeat, mode]);
```

- [ ] **Step 5: Extract autoResolveShowdown helper**

In `GameProvider`, before the `doAction` callback, add:

```typescript
  const autoResolveShowdown = useCallback(() => {
    if (mode === 'ble-client') return;
    const currentState = serviceRef.current.getState();
    if (currentState.phase === 'showdown') {
      const sdResult = serviceRef.current.resolveShowdown();
      setShowdownResult(sdResult);
    }
  }, [mode]);
```

Update `doAction` to use the helper:

```typescript
  const doAction = useCallback((seat: number, action: PlayerAction): ActionResult => {
    const result = serviceRef.current.handleAction(seat, action);
    if (!result.valid) return result;
    autoResolveShowdown();
    return result;
  }, [autoResolveShowdown]);
```

- [ ] **Step 6: Add pre-action logic to subscribe callback**

In the `service.subscribe` callback, add **before** the existing BLE client showdown detection logic (before the `if (mode === 'ble-client' && ...)` block):

```typescript
      // Pre-action: reset Call when currentBet changes
      if (preActionRef.current === 'call' && newState.currentBet !== prevCurrentBetRef.current) {
        setPreAction(null);
      }
      prevCurrentBetRef.current = newState.currentBet;

      // Pre-action: auto-execute when it becomes my turn
      const mySeat = mySeatRef.current;
      if (mySeat !== null && newState.activePlayer === mySeat && preActionRef.current) {
        const pa = preActionRef.current;
        setPreAction(null);

        const info = serviceRef.current.getActionInfo(mySeat);
        if (pa === 'checkFold') {
          serviceRef.current.handleAction(mySeat, info.canCheck ? { action: 'check' } : { action: 'fold' });
        } else if (pa === 'call' || pa === 'callAny') {
          serviceRef.current.handleAction(mySeat, info.canCheck ? { action: 'check' } : { action: 'call' });
        }

        autoResolveShowdown();
      }
```

Note: `autoResolveShowdown` must be added to the `useEffect` dependency array: `[service, mode, setPreAction, autoResolveShowdown]`.

- [ ] **Step 7: Add preAction/setPreAction to context value**

In the `value` object, add:

```typescript
    preAction,
    setPreAction,
```

- [ ] **Step 8: Run existing tests to ensure no regression**

Run: `npx jest tests/ui/ --no-coverage`
Expected: All existing tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/contexts/GameContext.tsx src/hooks/useGame.ts tests/ui/helpers/renderWithGame.tsx
git commit -m "feat: add pre-action state management to GameContext"
```

---

## Chunk 4: ActionButtons Enhancement

### Task 5: ActionButtons — Presets & Pre-Action UI

**Files:**
- Modify: `src/components/actions/ActionButtons.tsx`
- Test: `tests/ui/components/ActionButtons.test.tsx` (extend)

**Reference:**
- Spec Section 3: UI layout
- Spec Section 1: presets tap → immediate raise
- Existing `ActionButtons.tsx` for current structure

- [ ] **Step 1: Write failing tests for preset buttons**

Add to `tests/ui/components/ActionButtons.test.tsx`:

```tsx
  it('shows postflop preset buttons when canRaise on flop', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({
        phase: 'flop',
        activePlayer: 0,
        currentBet: 0,
        pots: [{ amount: 300, eligible: [0, 1, 2] }],
      }),
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    expect(screen.getByText('1/3')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getByText('Pot')).toBeTruthy();
  });

  it('shows preflop preset buttons on preflop', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0 }),
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: false, callAmount: 10, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    expect(screen.getByText('2.5BB')).toBeTruthy();
    expect(screen.getByText('3BB')).toBeTruthy();
    expect(screen.getByText('4BB')).toBeTruthy();
  });

  it('executes raise immediately when preset button pressed', () => {
    const doAction = jest.fn(() => ({ valid: true }));
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({
        phase: 'flop',
        activePlayer: 0,
        currentBet: 0,
        pots: [{ amount: 300, eligible: [0, 1, 2] }],
      }),
      viewingSeat: 0,
      mode: 'debug',
      doAction,
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    fireEvent.press(screen.getByText('1/2'));
    // 1/2 pot of 300 = 150
    expect(doAction).toHaveBeenCalledWith(0, { action: 'raise', amount: 150 });
  });

  it('executes allIn when preset value >= maxRaise', () => {
    const doAction = jest.fn(() => ({ valid: true }));
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({
        phase: 'flop',
        activePlayer: 0,
        currentBet: 0,
        pots: [{ amount: 300, eligible: [0, 1, 2] }],
      }),
      viewingSeat: 0,
      mode: 'debug',
      doAction,
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 200, canRaise: true,
      })),
    });
    // Pot = 300, but maxRaise = 200, so Pot preset is clamped to 200 → allIn
    fireEvent.press(screen.getByText('Pot'));
    expect(doAction).toHaveBeenCalledWith(0, { action: 'allIn' });
  });

  it('hides presets when canRaise is false', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ phase: 'flop', activePlayer: 0 }),
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: false, callAmount: 100, minRaise: 200, maxRaise: 150, canRaise: false,
      })),
    });
    expect(screen.queryByText('1/3')).toBeNull();
    expect(screen.queryByText('1/2')).toBeNull();
  });

  it('disables preset buttons below minRaise', () => {
    const { getByTestId } = renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0 }), // preflop, bb=10
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: false, callAmount: 10, minRaise: 40, maxRaise: 1000, canRaise: true,
      })),
    });
    // 2.5BB=30, 3BB=30 — both below minRaise=40 → disabled
    // 4BB=40 → enabled
    expect(getByTestId('preset-2.5BB').props.accessibilityState?.disabled).toBe(true);
    expect(getByTestId('preset-3BB').props.accessibilityState?.disabled).toBe(true);
    expect(getByTestId('preset-4BB').props.accessibilityState?.disabled).toBe(false);
  });

  it('hides preset row when all presets are below minRaise', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0 }), // preflop, bb=10
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: false, callAmount: 10, minRaise: 100, maxRaise: 1000, canRaise: true,
      })),
    });
    // All presets (30, 30, 40) < 100 → entire row hidden
    expect(screen.queryByText('2.5BB')).toBeNull();
    expect(screen.queryByText('3BB')).toBeNull();
    expect(screen.queryByText('4BB')).toBeNull();
  });
```

- [ ] **Step 2: Write failing tests for pre-action display**

Add to `tests/ui/components/ActionButtons.test.tsx`:

```tsx
  it('shows PreActionBar when not my turn in BLE mode', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 1 }),
      viewingSeat: 0,
      mode: 'ble-host',
    });
    expect(screen.getByText('Check/Fold')).toBeTruthy();
    expect(screen.getByText(/Call Any/)).toBeTruthy();
  });

  it('does NOT show PreActionBar in hotseat mode when not turn', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 1 }),
      viewingSeat: 0,
      mode: 'hotseat',
    });
    expect(screen.queryByText('Check/Fold')).toBeNull();
  });

  it('does NOT show PreActionBar in debug mode', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 1 }),
      viewingSeat: 0,
      mode: 'debug',
    });
    // In debug mode, actingSeat === activePlayer, so isMyTurn is always true
    // PreActionBar should not appear
    expect(screen.queryByText('Check/Fold')).toBeNull();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest tests/ui/components/ActionButtons.test.tsx --no-coverage`
Expected: FAIL — preset buttons don't exist yet

- [ ] **Step 4: Implement ActionButtons with presets and pre-action switching**

Replace `src/components/actions/ActionButtons.tsx` with:

```tsx
// src/components/actions/ActionButtons.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { RaiseSlider } from './RaiseSlider';
import { PreActionBar } from './PreActionBar';
import { calculatePresets } from './presetCalculator';
import { Colors } from '../../theme/colors';

export function ActionButtons() {
  const { state, mode, viewingSeat, doAction, getActionInfo, preAction, setPreAction } = useGame();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [raiseValue, setRaiseValue] = useState(0);

  const actingSeat = mode === 'debug' ? (state?.activePlayer ?? -1) : viewingSeat;
  const isMyTurn = state?.activePlayer === actingSeat && state?.activePlayer >= 0;
  const isBleMode = mode === 'ble-host' || mode === 'ble-client';

  const info = useMemo(() => {
    if (!state || !isMyTurn) return null;
    return getActionInfo(actingSeat);
  }, [state, isMyTurn, actingSeat, getActionInfo]);

  useEffect(() => {
    if (info) setRaiseValue(info.minRaise);
  }, [info?.minRaise]);

  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  const handleAction = (action: 'fold' | 'check' | 'call' | 'raise' | 'allIn', amount?: number) => {
    const result = doAction(actingSeat, { action, amount });
    if (!result.valid && result.reason) {
      setErrorMsg(result.reason);
    }
  };

  if (!state || state.phase === 'roundEnd' || state.phase === 'showdown') return null;

  // Pre-action bar: show only in BLE mode when not my turn
  if (!isMyTurn && isBleMode) {
    const myPlayer = state.players.find(p => p.seat === viewingSeat);
    const callAmount = Math.max(0, state.currentBet - (myPlayer?.bet ?? 0));
    return (
      <View style={styles.container}>
        <PreActionBar
          selected={preAction}
          onSelect={setPreAction}
          callAmount={callAmount}
        />
      </View>
    );
  }

  // Non-BLE modes when not my turn: render disabled action buttons (existing behavior)
  const disabled = !isMyTurn;
  const showAllIn = info && !info.canRaise && info.callAmount > 0;

  // Presets
  const presets = state && isMyTurn && info?.canRaise
    ? calculatePresets(state, actingSeat)
    : [];

  // Validate presets against minRaise/maxRaise
  const validatedPresets = presets.map(p => {
    const clamped = Math.min(p.value, info?.maxRaise ?? p.value);
    const isDisabled = clamped < (info?.minRaise ?? 0);
    const isAllIn = clamped >= (info?.maxRaise ?? Infinity);
    return { ...p, value: clamped, isDisabled, isAllIn };
  });
  const hasAnyEnabledPreset = validatedPresets.some(p => !p.isDisabled);

  const handlePresetPress = (value: number, isAllIn: boolean) => {
    if (isAllIn) {
      handleAction('allIn');
    } else {
      handleAction('raise', value);
    }
  };

  return (
    <View style={styles.container}>
      {info?.canRaise && isMyTurn && hasAnyEnabledPreset && (
        <View style={styles.presetRow}>
          {validatedPresets.map(p => (
            <TouchableOpacity
              key={p.label}
              testID={`preset-${p.label}`}
              style={[styles.presetButton, p.isDisabled && styles.disabled]}
              onPress={() => handlePresetPress(p.value, p.isAllIn)}
              disabled={p.isDisabled}
              accessibilityState={{ disabled: p.isDisabled }}
            >
              <Text style={styles.presetText}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {info?.canRaise && isMyTurn && (
        <RaiseSlider
          minRaise={info.minRaise}
          maxRaise={info.maxRaise}
          bbSize={state.blinds.bb}
          value={raiseValue}
          onValueChange={setRaiseValue}
        />
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          testID="fold-btn"
          style={[styles.button, styles.foldBtn, disabled && styles.disabled]}
          onPress={() => handleAction('fold')}
          disabled={disabled}
          accessibilityState={{ disabled }}
        >
          <Text style={styles.buttonText}>FOLD</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="call-btn"
          style={[styles.button, styles.callBtn, disabled && styles.disabled]}
          onPress={() => info?.canCheck
            ? handleAction('check')
            : handleAction('call')
          }
          disabled={disabled}
          accessibilityState={{ disabled }}
        >
          <Text style={styles.buttonText}>
            {info?.canCheck ? 'CHECK' : `CALL ${info?.callAmount ?? 0}`}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="raise-btn"
          style={[styles.button, styles.raiseBtn, disabled && styles.disabled]}
          onPress={() => {
            if (showAllIn) {
              handleAction('allIn');
            } else if (info && raiseValue >= info.maxRaise) {
              handleAction('allIn');
            } else {
              handleAction('raise', raiseValue);
            }
          }}
          disabled={disabled || (!info?.canRaise && !showAllIn)}
          accessibilityState={{ disabled: disabled || (!info?.canRaise && !showAllIn) }}
        >
          <Text style={styles.buttonText}>
            {showAllIn
              ? `ALL IN ${info?.maxRaise ?? 0}`
              : raiseValue >= (info?.maxRaise ?? 0)
                ? `ALL IN ${info?.maxRaise ?? 0}`
                : `RAISE ${raiseValue}`}
          </Text>
        </TouchableOpacity>
      </View>

      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
    backgroundColor: Colors.background,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 6,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#374151',
    alignItems: 'center',
  },
  presetText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  foldBtn: { backgroundColor: Colors.fold },
  callBtn: { backgroundColor: Colors.call },
  raiseBtn: { backgroundColor: Colors.raise },
  disabled: { opacity: 0.4 },
  buttonText: { color: Colors.text, fontWeight: 'bold', fontSize: 14 },
  error: { color: '#EF4444', fontSize: 12, textAlign: 'center', marginTop: 4 },
});
```

- [ ] **Step 5: Run ActionButtons tests**

Run: `npx jest tests/ui/components/ActionButtons.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 6: Run all UI tests for regression**

Run: `npx jest tests/ui/ --no-coverage`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/actions/ActionButtons.tsx tests/ui/components/ActionButtons.test.tsx
git commit -m "feat: add raise preset buttons and pre-action bar to ActionButtons"
```

---

## Chunk 5: Pre-Action Integration Test

### Task 6: Pre-Action Execution Integration Test

**Files:**
- Test: `tests/ui/integration/preAction.integration.test.tsx`
- Modify: `tests/ui/integration/helpers/integrationTestHelper.tsx` (add BLE mode support)

**Reference:**
- Spec Section 2: execution logic, reset rules
- Existing `tests/ui/integration/bettingActions.integration.test.tsx` for patterns

- [ ] **Step 1: Write integration test for pre-action auto-execute**

Note: Pre-actions only work in BLE modes. Since integration tests use `LocalGameService` (not BLE), we need to test the GameContext pre-action logic by using `ble-host` mode with `LocalGameService`. The pre-action execution happens in `GameContext`'s subscribe callback, which is mode-dependent but service-agnostic.

```tsx
// tests/ui/integration/preAction.integration.test.tsx

import React from 'react';
import { act, waitFor } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import { GameProvider } from '../../../src/contexts/GameContext';
import { LocalGameService } from '../../../src/services/LocalGameService';
import { useGame } from '../../../src/hooks/useGame';
import { View, Text, TouchableOpacity } from 'react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

/**
 * Minimal test harness that exposes pre-action controls and game state.
 */
function PreActionTestView() {
  const { state, preAction, setPreAction, doAction, getActionInfo } = useGame();
  if (!state) return null;

  return (
    <View>
      <Text testID="phase">{state.phase}</Text>
      <Text testID="active-player">{state.activePlayer}</Text>
      <Text testID="pre-action">{String(preAction)}</Text>
      <Text testID="seat0-status">{state.players[0]?.status}</Text>
      <TouchableOpacity testID="set-checkFold" onPress={() => setPreAction('checkFold')} />
      <TouchableOpacity testID="set-call" onPress={() => setPreAction('call')} />
      <TouchableOpacity testID="set-callAny" onPress={() => setPreAction('callAny')} />
      <TouchableOpacity testID="clear-preaction" onPress={() => setPreAction(null)} />
      <TouchableOpacity
        testID="do-action"
        onPress={() => {
          if (state.activePlayer >= 0) {
            const info = getActionInfo(state.activePlayer);
            doAction(state.activePlayer, info.canCheck ? { action: 'check' } : { action: 'call' });
          }
        }}
      />
    </View>
  );
}

function renderPreActionTest(service: LocalGameService) {
  return render(
    <GameProvider service={service} mode="ble-host">
      <PreActionTestView />
    </GameProvider>,
  );
}

describe('Pre-action integration', () => {
  it('auto-executes Check/Fold when turn arrives (canCheck=true → check)', async () => {
    const service = new LocalGameService();
    service.startGame(['Host', 'B', 'C'], { sb: 5, bb: 10 }, 1000);
    service.startRound();

    // Host = seat 0, activePlayer starts at 0 (UTG in 3-player)
    // First, advance seat 0 past its turn so we can set a pre-action
    await act(async () => {
      service.handleAction(0, { action: 'call' }); // seat 0 calls
    });

    const renderAPI = renderPreActionTest(service);

    // Now seat 1 is active. Set pre-action for seat 0 (host)
    await act(async () => {
      const { getByTestId } = renderAPI;
      // Verify seat 1 is active
      expect(getByTestId('active-player').props.children).toBe(1);
    });

    // Set Check/Fold pre-action for host (seat 0)
    await act(async () => {
      renderAPI.getByTestId('set-checkFold').props.onPress();
    });

    // Verify pre-action is set
    expect(renderAPI.getByTestId('pre-action').props.children).toBe('checkFold');

    // Advance: seat 1 calls, seat 2 checks (BB), now it should go to flop
    // Then seat 0 will get turn on flop, and pre-action should auto-execute
    await act(async () => {
      service.handleAction(1, { action: 'call' }); // seat 1 calls
    });

    await act(async () => {
      service.handleAction(2, { action: 'check' }); // seat 2 (BB) checks → flop
    });

    // On flop, seat 0 should get turn and pre-action (checkFold) should auto-execute
    await waitFor(() => {
      // Pre-action should be cleared after execution
      expect(renderAPI.getByTestId('pre-action').props.children).toBe('null');
    });
  });

  it('resets Call pre-action when currentBet changes', async () => {
    const service = new LocalGameService();
    service.startGame(['Host', 'B'], { sb: 5, bb: 10 }, 1000);
    service.startRound();

    const renderAPI = renderPreActionTest(service);

    // seat 0 calls
    await act(async () => {
      service.handleAction(0, { action: 'call' });
    });

    // Set Call pre-action for host (while seat 1 is active)
    await act(async () => {
      renderAPI.getByTestId('set-call').props.onPress();
    });
    expect(renderAPI.getByTestId('pre-action').props.children).toBe('call');

    // seat 1 raises → currentBet changes → Call should reset
    await act(async () => {
      service.handleAction(1, { action: 'raise', amount: 30 });
    });

    await waitFor(() => {
      expect(renderAPI.getByTestId('pre-action').props.children).toBe('null');
    });
  });

  it('does NOT reset Call Any when currentBet changes', async () => {
    const service = new LocalGameService();
    service.startGame(['Host', 'B'], { sb: 5, bb: 10 }, 1000);
    service.startRound();

    const renderAPI = renderPreActionTest(service);

    await act(async () => {
      service.handleAction(0, { action: 'call' });
    });

    await act(async () => {
      renderAPI.getByTestId('set-callAny').props.onPress();
    });
    expect(renderAPI.getByTestId('pre-action').props.children).toBe('callAny');

    // seat 1 raises → currentBet changes → Call Any should NOT reset
    await act(async () => {
      service.handleAction(1, { action: 'raise', amount: 30 });
    });

    // callAny stays
    expect(renderAPI.getByTestId('pre-action').props.children).toBe('callAny');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ui/integration/preAction.integration.test.tsx --no-coverage`
Expected: FAIL (preAction/setPreAction not available in context yet, or logic not wired)

If Task 4 is already implemented, these should pass. If not, implement Task 4 first.

- [ ] **Step 3: Fix any issues, run until green**

Run: `npx jest tests/ui/integration/preAction.integration.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ui/integration/preAction.integration.test.tsx
git commit -m "test: add pre-action integration tests (auto-execute, reset rules)"
```

---

## Final Verification

- [ ] **Run full test suite one final time**

```bash
npx jest --no-coverage
```

Expected: All tests pass (engine + ui projects)

- [ ] **Final commit if any cleanup needed**

```bash
git status
```
