# Solo vs Bot Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "ソロ" lobby mode that lets one human player start a game against all-bot opponents.

**Architecture:** Add `'solo'` to `LobbyMode` type, create `SoloSetupForm` component, and add a `handleSoloSubmit` handler in `LobbyView` that passes `playerNames=[name]` and `botCount=totalCount-1` to the game route. `LocalGameService`, `BotPlayerService`, and `game.tsx` require no changes.

**Tech Stack:** React Native, TypeScript, @testing-library/react-native, expo-router

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/lobby/LobbyModeSelector.tsx` | Modify | Add `'solo'` to `LobbyMode` type and `TABS` array |
| `src/components/lobby/SoloSetupForm.tsx` | Create | Self-contained form: player name, total count, chips, SB/BB, submit |
| `src/components/lobby/LobbyView.tsx` | Modify | Show `SoloSetupForm` when `lobbyMode === 'solo'`; add `handleSoloSubmit` |
| `tests/ui/components/LobbyModeSelector.test.tsx` | Modify | Add test for 'ソロ' tab |
| `tests/ui/components/SoloSetupForm.test.tsx` | Create | Unit tests for SoloSetupForm |
| `tests/ui/components/LobbyView.test.tsx` | Modify | Add tests for solo tab navigation |

---

## Task 1: Add 'solo' to LobbyModeSelector

**Files:**
- Modify: `src/components/lobby/LobbyModeSelector.tsx`
- Test: `tests/ui/components/LobbyModeSelector.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to the end of the `describe` block in `tests/ui/components/LobbyModeSelector.test.tsx`:

```tsx
  it('renders four tabs including ソロ', () => {
    render(<LobbyModeSelector selected="local" onSelect={jest.fn()} />);
    expect(screen.getByText('ソロ')).toBeTruthy();
  });

  it('calls onSelect with "solo" when ソロ is pressed', () => {
    const onSelect = jest.fn();
    render(<LobbyModeSelector selected="local" onSelect={onSelect} />);
    fireEvent.press(screen.getByText('ソロ'));
    expect(onSelect).toHaveBeenCalledWith('solo');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ui/components/LobbyModeSelector.test.tsx --no-coverage
```

Expected: FAIL — `Unable to find an element with text: ソロ`

- [ ] **Step 3: Implement the change**

Replace the contents of `src/components/lobby/LobbyModeSelector.tsx`:

```tsx
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

export type LobbyMode = 'local' | 'host' | 'join' | 'solo';

type LobbyModeSelectorProps = {
  selected: LobbyMode;
  onSelect: (mode: LobbyMode) => void;
};

const TABS: { mode: LobbyMode; label: string }[] = [
  { mode: 'local', label: 'ローカル' },
  { mode: 'solo', label: 'ソロ' },
  { mode: 'host', label: 'ホスト作成' },
  { mode: 'join', label: 'ゲーム参加' },
];

export function LobbyModeSelector({ selected, onSelect }: LobbyModeSelectorProps) {
  return (
    <View style={styles.container}>
      {TABS.map(({ mode, label }) => (
        <TouchableOpacity
          key={mode}
          testID={`lobby-tab-${mode}`}
          style={[styles.tab, selected === mode && styles.tabActive]}
          onPress={() => onSelect(mode)}
        >
          <Text style={[styles.tabText, selected === mode && styles.tabTextActive]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.subText,
    alignItems: 'center',
  },
  tabActive: {
    borderColor: Colors.active,
    backgroundColor: 'rgba(6,182,212,0.15)',
  },
  tabText: {
    color: Colors.subText,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.active,
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ui/components/LobbyModeSelector.test.tsx --no-coverage
```

Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/lobby/LobbyModeSelector.tsx tests/ui/components/LobbyModeSelector.test.tsx
git commit -m "feat: add solo tab to LobbyModeSelector"
```

---

## Task 2: Create SoloSetupForm

**Files:**
- Create: `src/components/lobby/SoloSetupForm.tsx`
- Create: `tests/ui/components/SoloSetupForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/components/SoloSetupForm.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SoloSetupForm } from '../../../src/components/lobby/SoloSetupForm';

describe('SoloSetupForm', () => {
  it('renders player name input', () => {
    render(<SoloSetupForm onSubmit={jest.fn()} />);
    expect(screen.getByPlaceholderText('あなたの名前')).toBeTruthy();
  });

  it('renders total player count buttons 2-9', () => {
    render(<SoloSetupForm onSubmit={jest.fn()} />);
    [2, 3, 4, 5, 6, 7, 8, 9].forEach(n => {
      expect(screen.getByTestId(`solo-count-btn-${n}`)).toBeTruthy();
    });
  });

  it('renders chips, SB, BB inputs', () => {
    render(<SoloSetupForm onSubmit={jest.fn()} />);
    expect(screen.getByTestId('solo-chips-input')).toBeTruthy();
    expect(screen.getByTestId('solo-sb-input')).toBeTruthy();
    expect(screen.getByTestId('solo-bb-input')).toBeTruthy();
  });

  it('disables start button when player name is empty', () => {
    render(<SoloSetupForm onSubmit={jest.fn()} />);
    const btn = screen.getByTestId('solo-start-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });

  it('enables start button when player name is filled', () => {
    render(<SoloSetupForm onSubmit={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText('あなたの名前'), 'Alice');
    const btn = screen.getByTestId('solo-start-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeFalsy();
  });

  it('calls onSubmit with correct values', () => {
    const onSubmit = jest.fn();
    render(<SoloSetupForm onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByPlaceholderText('あなたの名前'), 'Alice');
    fireEvent.press(screen.getByTestId('solo-count-btn-4'));
    fireEvent.press(screen.getByTestId('solo-start-btn'));
    expect(onSubmit).toHaveBeenCalledWith({
      playerName: 'Alice',
      totalCount: 4,
      initialChips: '1000',
      sb: '5',
      bb: '10',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ui/components/SoloSetupForm.test.tsx --no-coverage
```

Expected: FAIL — `Cannot find module '../../../src/components/lobby/SoloSetupForm'`

- [ ] **Step 3: Create SoloSetupForm implementation**

Create `src/components/lobby/SoloSetupForm.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

const PLAYER_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9];

type SoloSetupFormProps = {
  onSubmit: (settings: {
    playerName: string;
    totalCount: number;
    initialChips: string;
    sb: string;
    bb: string;
  }) => void;
};

export function SoloSetupForm({ onSubmit }: SoloSetupFormProps) {
  const [playerName, setPlayerName] = useState('');
  const [totalCount, setTotalCount] = useState(3);
  const [initialChips, setInitialChips] = useState('1000');
  const [sb, setSb] = useState('5');
  const [bb, setBb] = useState('10');

  const isValid = playerName.trim() !== '';

  return (
    <View>
      <Text style={styles.label}>あなたの名前</Text>
      <TextInput
        style={styles.input}
        placeholder="あなたの名前"
        placeholderTextColor={Colors.subText}
        value={playerName}
        onChangeText={setPlayerName}
      />

      <Text style={styles.label}>総プレイヤー数（自分含む）</Text>
      <View style={styles.countRow}>
        {PLAYER_COUNTS.map(n => (
          <TouchableOpacity
            key={n}
            testID={`solo-count-btn-${n}`}
            style={[styles.countBtn, totalCount === n && styles.countBtnActive]}
            onPress={() => setTotalCount(n)}
          >
            <Text style={[styles.countText, totalCount === n && styles.countTextActive]}>
              {n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>初期チップ</Text>
      <TextInput
        testID="solo-chips-input"
        style={styles.input}
        value={initialChips}
        onChangeText={setInitialChips}
        keyboardType="numeric"
        placeholderTextColor={Colors.subText}
      />

      <View style={styles.blindsRow}>
        <View style={styles.blindInput}>
          <Text style={styles.label}>SB</Text>
          <TextInput
            testID="solo-sb-input"
            style={styles.input}
            value={sb}
            onChangeText={setSb}
            keyboardType="numeric"
            placeholderTextColor={Colors.subText}
          />
        </View>
        <View style={styles.blindInput}>
          <Text style={styles.label}>BB</Text>
          <TextInput
            testID="solo-bb-input"
            style={styles.input}
            value={bb}
            onChangeText={setBb}
            keyboardType="numeric"
            placeholderTextColor={Colors.subText}
          />
        </View>
      </View>

      <TouchableOpacity
        testID="solo-start-btn"
        style={[styles.startBtn, !isValid && styles.startBtnDisabled]}
        onPress={() => onSubmit({ playerName: playerName.trim(), totalCount, initialChips, sb, bb })}
        disabled={!isValid}
      >
        <Text style={styles.startBtnText}>ゲーム開始</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: Colors.subText,
    fontSize: 14,
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#374151',
    color: Colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 8,
  },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  countBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.subText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBtnActive: { borderColor: Colors.active, backgroundColor: 'rgba(6,182,212,0.15)' },
  countText: { color: Colors.subText, fontSize: 18, fontWeight: 'bold' },
  countTextActive: { color: Colors.active },
  blindsRow: { flexDirection: 'row', gap: 12 },
  blindInput: { flex: 1 },
  startBtn: {
    backgroundColor: Colors.pot,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { color: Colors.text, fontSize: 18, fontWeight: 'bold' },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ui/components/SoloSetupForm.test.tsx --no-coverage
```

Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/lobby/SoloSetupForm.tsx tests/ui/components/SoloSetupForm.test.tsx
git commit -m "feat: add SoloSetupForm component"
```

---

## Task 3: Wire SoloSetupForm into LobbyView

**Files:**
- Modify: `src/components/lobby/LobbyView.tsx`
- Test: `tests/ui/components/LobbyView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to the `describe('LobbyView')` block in `tests/ui/components/LobbyView.test.tsx`:

```tsx
  it('renders ソロ tab in lobby mode selector', () => {
    render(<LobbyView />);
    expect(screen.getByText('ソロ')).toBeTruthy();
  });

  it('shows SoloSetupForm when ソロ tab is selected', () => {
    render(<LobbyView />);
    fireEvent.press(screen.getByText('ソロ'));
    expect(screen.getByPlaceholderText('あなたの名前')).toBeTruthy();
  });

  it('navigates to game with botCount = totalCount - 1 in solo mode', async () => {
    render(<LobbyView />);
    fireEvent.press(screen.getByText('ソロ'));
    fireEvent.changeText(screen.getByPlaceholderText('あなたの名前'), 'Alice');
    fireEvent.press(screen.getByTestId('solo-count-btn-4'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('solo-start-btn'));
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/game',
      params: {
        playerNames: JSON.stringify(['Alice']),
        initialChips: '1000',
        sb: '5',
        bb: '10',
        mode: 'hotseat',
        botCount: '3',
      },
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ui/components/LobbyView.test.tsx --no-coverage
```

Expected: FAIL — `Unable to find an element with text: ソロ` (or similar)

- [ ] **Step 3: Wire SoloSetupForm into LobbyView**

In `src/components/lobby/LobbyView.tsx`, make the following changes:

**Add import** (after the `JoinSetupForm` import line):
```tsx
import { SoloSetupForm } from './SoloSetupForm';
```

**Add `handleSoloSubmit` handler** (after the `handleJoinSubmit` function):
```tsx
  const handleSoloSubmit = (settings: {
    playerName: string;
    totalCount: number;
    initialChips: string;
    sb: string;
    bb: string;
  }) => {
    router.push({
      pathname: '/game',
      params: {
        playerNames: JSON.stringify([settings.playerName]),
        initialChips: settings.initialChips,
        sb: settings.sb,
        bb: settings.bb,
        mode: 'hotseat',
        botCount: String(settings.totalCount - 1),
      },
    });
  };
```

**Add solo section** in the JSX (after the `{lobbyMode === 'join' && ...}` block):
```tsx
      {lobbyMode === 'solo' && (
        <SoloSetupForm onSubmit={handleSoloSubmit} />
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ui/components/LobbyView.test.tsx --no-coverage
```

Expected: PASS (all existing tests + 3 new tests)

- [ ] **Step 5: Run full UI test suite to check for regressions**

```bash
npx jest --testPathPattern="tests/ui" --no-coverage
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/lobby/LobbyView.tsx tests/ui/components/LobbyView.test.tsx
git commit -m "feat: wire SoloSetupForm into LobbyView for solo vs bot mode"
```
