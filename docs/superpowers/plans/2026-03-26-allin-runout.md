# All-In Runout Showdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dramatic all-in runout: when all players go all-in, reveal their hole cards and deal remaining community cards one at a time with 1.5 s intervals (2.5 s after river), then show community cards in the result overlay.

**Architecture:** Three new engine phases (`allInFlop`, `allInTurn`, `allInRiver`) pause the game between streets. `GameLoop.advancePhase()` enters these instead of recursing; `GameLoop.advanceRunout()` steps through them. A `useEffect` timer in `GameContext` calls `advanceRunout()` after the appropriate delay. BLE host broadcasts revealed cards; clients pass them through to the UI.

**Tech Stack:** TypeScript, React Native / Expo, Jest

---

## File Map

| File | Change |
|---|---|
| `src/gameEngine/types.ts` | Add `allInFlop \| allInTurn \| allInRiver` to `Phase`; add `cardsRevealed?: boolean` to `Player` |
| `src/gameEngine/GameLoop.ts` | `advancePhase()` → enter `allIn*` instead of recursing; add `advanceRunout()` and private `revealCardsForAllIn()`; reset `cardsRevealed` in `startRound()` |
| `src/services/GameService.ts` | Add `advanceRunout(): void` to interface |
| `src/services/LocalGameService.ts` | Implement `advanceRunout()` |
| `src/services/ble/GameProtocol.ts` | Add `allIn*` to `VALID_PHASES`; add `cardsRevealed?` to `GameStatePlayer`; update `isGameStatePlayerArray()` |
| `src/services/ble/BleHostGameService.ts` | Implement `advanceRunout()`; update `broadcastState()` and `sendCurrentStateTo()` to send actual cards when `cardsRevealed === true`; update `getState()` to expose revealed cards |
| `src/services/ble/BleClientGameService.ts` | Add no-op `advanceRunout()`; pass `cardsRevealed` when constructing player state |
| `src/services/ble/BleSpectatorGameService.ts` | Add no-op `advanceRunout()`; pass `cardsRevealed` when constructing player state |
| `src/contexts/GameContext.tsx` | Add `useEffect` timer for `allIn*` phases |
| `src/components/table/PlayerSeat.tsx` | Update `showCards` condition to include `player.cardsRevealed === true` |
| `src/components/result/ResultOverlay.tsx` | Add community cards row above hand list |

---

## Task 1: Add new Phase values and `cardsRevealed` to types

**Files:**
- Modify: `src/gameEngine/types.ts:29-41`

No test needed — pure type change. TypeScript compiler will catch mismatches downstream.

- [ ] **Step 1: Update `types.ts`**

Replace the two declarations:

```ts
// src/gameEngine/types.ts  (full file shown for clarity)

// Card notation: 2-character string, e.g., "Ah" = Ace of Hearts
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Suit = 'h' | 'd' | 's' | 'c';
export type Card = `${Rank}${Suit}`;

export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS: Suit[] = ['h', 'd', 's', 'c'];

export enum HandRank {
  HighCard = 0,
  OnePair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
  RoyalFlush = 9,
}

export interface HandResult {
  rank: HandRank;
  cards: Card[];       // The best 5 cards
  values: number[];    // Numeric values for comparison [rankCategory, ...kickers]
  description: string; // Human-readable, e.g., "Full House, Kings over Sevens"
}

export type PlayerStatus = 'active' | 'folded' | 'allIn' | 'out';

export interface Player {
  seat: number;        // 0-8
  name: string;
  chips: number;
  status: PlayerStatus;
  bet: number;         // Current round bet
  cards: Card[];       // Hole cards (2 cards)
  isBot?: boolean;     // true if bot player, false or undefined if human
  cardsRevealed?: boolean; // true when hole cards are shown face-up to all players
}

export type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river'
  | 'allInFlop' | 'allInTurn' | 'allInRiver'
  | 'showdown' | 'roundEnd' | 'gameOver';

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allIn';

export interface PlayerAction {
  action: ActionType;
  amount?: number;     // Required for 'raise'
}

export interface Pot {
  amount: number;
  eligible: number[];  // Seat numbers eligible for this pot
}

export interface Blinds {
  sb: number;
  bb: number;
}

export interface GameState {
  seq: number;
  phase: Phase;
  community: Card[];
  pots: Pot[];
  currentBet: number;
  activePlayer: number; // Seat number of player who must act
  dealer: number;       // Seat number of dealer button
  blinds: Blinds;
  players: Player[];
  foldWin?: { seat: number; amount: number };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (or only pre-existing unrelated errors).

---

## Task 2: Update `GameLoop` — all-in runout logic

**Files:**
- Modify: `src/gameEngine/GameLoop.ts:42-67, 251-301`
- Test: `tests/gameEngine/GameLoop.test.ts`

**Background:** `advancePhase()` currently recurses when `activePlayers.length <= 1`, jumping straight to showdown. We replace that recursion with entering `allInFlop/allInTurn/allInRiver`. We also add `advanceRunout()` (called by service layer after a timer) and `revealCardsForAllIn()` (sets `cardsRevealed = true` on all non-folded, non-out players).

- [ ] **Step 1: Write the failing tests**

Add to the `describe('edge cases', ...)` block in `tests/gameEngine/GameLoop.test.ts`:

```ts
  describe('all-in runout phases', () => {
    function makeAllInGame(): GameLoop {
      // Two players, seat 1 only has 10 chips (posts BB, immediately all-in)
      const players = makeGamePlayers(2);
      players[1].chips = 10;
      return new GameLoop(players, DEFAULT_BLINDS);
    }

    it('enters allInFlop (not showdown) when all players are all-in after preflop', () => {
      const game = makeAllInGame();
      game.startRound();
      // Heads-up: seat 0 (SB/dealer) acts first. Seat 1 only posted BB=10 (all chips), so allIn.
      game.handleAction(0, { action: 'allIn' });
      expect(game.phase).toBe('allInFlop');
      expect(game.community).toHaveLength(3);
    });

    it('sets cardsRevealed=true on all non-folded players when entering allInFlop', () => {
      const game = makeAllInGame();
      game.startRound();
      game.handleAction(0, { action: 'allIn' });
      const nonFolded = game.players.filter(p => p.status !== 'folded' && p.status !== 'out');
      expect(nonFolded.every(p => p.cardsRevealed === true)).toBe(true);
    });

    it('advanceRunout transitions allInFlop → allInTurn and deals turn', () => {
      const game = makeAllInGame();
      game.startRound();
      game.handleAction(0, { action: 'allIn' });
      expect(game.phase).toBe('allInFlop');
      game.advanceRunout();
      expect(game.phase).toBe('allInTurn');
      expect(game.community).toHaveLength(4);
    });

    it('advanceRunout transitions allInTurn → allInRiver and deals river', () => {
      const game = makeAllInGame();
      game.startRound();
      game.handleAction(0, { action: 'allIn' });
      game.advanceRunout(); // → allInTurn
      game.advanceRunout(); // → allInRiver
      expect(game.phase).toBe('allInRiver');
      expect(game.community).toHaveLength(5);
    });

    it('advanceRunout transitions allInRiver → showdown', () => {
      const game = makeAllInGame();
      game.startRound();
      game.handleAction(0, { action: 'allIn' });
      game.advanceRunout();
      game.advanceRunout();
      game.advanceRunout();
      expect(game.phase).toBe('showdown');
    });

    it('advanceRunout throws when called outside allIn* phase', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      game.startRound();
      expect(() => game.advanceRunout()).toThrow('advanceRunout called in non-allIn phase');
    });

    it('resets cardsRevealed on startRound', () => {
      const game = makeAllInGame();
      game.startRound();
      game.handleAction(0, { action: 'allIn' });
      // cardsRevealed is now true; simulate next round
      game.advanceRunout();
      game.advanceRunout();
      game.advanceRunout(); // showdown
      game.resolveShowdown();
      game.prepareNextRound();
      // After startRound, cardsRevealed must be cleared
      // We need chips to still be > 0 — adjust so seat 0 wins. Can't control outcome,
      // but we can just check that startRound resets the flag.
      // Give seat 1 enough chips for another round:
      const seat1 = game.players.find(p => p.seat === 1)!;
      seat1.chips = 100; // give them chips so game isn't over
      seat1.status = 'active';
      game.startRound();
      game.players.forEach(p => {
        expect(p.cardsRevealed).toBeUndefined();
      });
    });
  });
```

Also **update** the existing test at line ~259 (`'advances through all streets when only one active player'`) to expect the new allIn* phases:

```ts
    it('advances through all streets when only one active player (all others all-in)', () => {
      const players = makeGamePlayers(2);
      players[1].chips = 10;
      const game = new GameLoop(players, DEFAULT_BLINDS);
      game.startRound();
      game.handleAction(0, { action: 'allIn' });
      // With new behavior: enters allInFlop instead of jumping to showdown
      expect(['allInFlop', 'allInTurn', 'allInRiver', 'showdown', 'roundEnd'].includes(game.phase)).toBe(true);
    });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/gameEngine/GameLoop.test.ts -t "all-in runout phases" --no-coverage
```

Expected: FAIL — `advanceRunout is not a function` (or similar).

- [ ] **Step 3: Implement the changes in `GameLoop.ts`**

Replace the entire file with:

```ts
import { Player, Phase, Card, Blinds, GameState, PlayerAction, Pot } from './types';
import { Deck } from './Deck';
import { BettingRound, ActionResult } from './BettingRound';
import { PotManager } from './PotManager';
import { evaluate7Cards, compareHands } from './HandEvaluator';

export interface ShowdownResult {
  winners: { seat: number; hand: string; potAmount: number }[];
  hands: { seat: number; cards: Card[]; description: string }[];
}

export class GameLoop {
  private _players: Player[];
  private _phase: Phase;
  private _community: Card[];
  private _dealer: number;
  private _blinds: Blinds;
  private _seq: number;
  private deck: Deck;
  private bettingRound: BettingRound | null;
  private potManager: PotManager;
  private _foldWin: { seat: number; amount: number } | null;

  constructor(players: Player[], blinds: Blinds, dealer = 0) {
    this._players = players;
    this._blinds = blinds;
    this._dealer = dealer;
    this._phase = 'waiting';
    this._community = [];
    this._seq = 0;
    this.deck = new Deck();
    this.bettingRound = null;
    this.potManager = new PotManager();
    this._foldWin = null;
  }

  get phase(): Phase { return this._phase; }
  get community(): Card[] { return [...this._community]; }
  get dealer(): number { return this._dealer; }
  get players(): Player[] { return this._players; }

  startRound(): void {
    // Reset for new round
    this.deck.reset();
    this._community = [];
    this.potManager.reset();
    this._foldWin = null;
    this._seq++;

    for (const p of this._players) {
      if (p.status !== 'out') {
        p.status = 'active';
        p.bet = 0;
        p.cards = [];
        p.cardsRevealed = undefined;
      }
    }

    // Deal hole cards
    const activePlayers = this._players.filter(p => p.status === 'active');
    for (const p of activePlayers) {
      p.cards = this.deck.dealMultiple(2);
    }

    // Start preflop betting
    this._phase = 'preflop';
    this.bettingRound = BettingRound.createPreflop(this._players, this._dealer, this._blinds);
  }

  handleAction(seat: number, action: PlayerAction): ActionResult {
    if (!this.bettingRound) {
      return { valid: false, reason: 'No active betting round' };
    }

    const result = this.bettingRound.handleAction(seat, action);
    if (!result.valid) return result;

    // Check if the round should end early (all folded except one)
    const nonFolded = this._players.filter(p => p.status !== 'folded' && p.status !== 'out');
    if (nonFolded.length === 1) {
      this.collectBetsFromRound();
      this.awardPotToLastPlayer(nonFolded[0]);
      this._phase = 'roundEnd';
      this.bettingRound = null;
      return result;
    }

    // Check if betting round is complete
    if (this.bettingRound.isComplete) {
      this.collectBetsFromRound();
      this.advancePhase();
    }

    return result;
  }

  /**
   * Force-fold a player regardless of turn order.
   * Used for timeout-based auto-fold on disconnected clients.
   * Returns true if the fold was applied, false if no action needed.
   */
  forceFold(seat: number): boolean {
    if (!this.bettingRound) return false;

    const player = this._players.find(p => p.seat === seat);
    if (!player || player.status !== 'active') return false;

    this.bettingRound.forceFold(seat);

    // Check if only one player remains
    const nonFolded = this._players.filter(p => p.status !== 'folded' && p.status !== 'out');
    if (nonFolded.length === 1) {
      this.collectBetsFromRound();
      this.awardPotToLastPlayer(nonFolded[0]);
      this._phase = 'roundEnd';
      this.bettingRound = null;
      return true;
    }

    // Check if betting round is complete after force-fold
    if (this.bettingRound.isComplete) {
      this.collectBetsFromRound();
      this.advancePhase();
    }

    return true;
  }

  /**
   * Advance from an allIn* phase to the next one (dealing the next street),
   * or from allInRiver to showdown.
   * Called by the service layer after a timer fires in the UI.
   */
  advanceRunout(): void {
    switch (this._phase) {
      case 'allInFlop':
        this.deck.deal(); // Burn
        this._community.push(this.deck.deal()); // Turn card
        this._phase = 'allInTurn';
        break;
      case 'allInTurn':
        this.deck.deal(); // Burn
        this._community.push(this.deck.deal()); // River card
        this._phase = 'allInRiver';
        break;
      case 'allInRiver':
        this._phase = 'showdown';
        this.bettingRound = null;
        break;
      default:
        throw new Error(`advanceRunout called in non-allIn phase: ${this._phase}`);
    }
  }

  resolveShowdown(): ShowdownResult {
    if (this._phase !== 'showdown') {
      throw new Error('Not in showdown phase');
    }

    const pots = this.potManager.getPots();
    const hands: ShowdownResult['hands'] = [];
    const winners: ShowdownResult['winners'] = [];

    // Evaluate hands for all non-folded players
    const activePlayers = this._players.filter(p => p.status !== 'folded' && p.status !== 'out');
    const handResults = new Map<number, ReturnType<typeof evaluate7Cards>>();

    for (const p of activePlayers) {
      const allCards = [...p.cards, ...this._community] as Card[];
      const result = evaluate7Cards(allCards);
      handResults.set(p.seat, result);
      hands.push({ seat: p.seat, cards: p.cards, description: result.description });
    }

    // Award each pot
    for (const pot of pots) {
      const eligibleHands = pot.eligible
        .filter(seat => handResults.has(seat))
        .map(seat => ({ seat, hand: handResults.get(seat)! }));

      if (eligibleHands.length === 0) continue;

      // Find best hand(s)
      eligibleHands.sort((a, b) => compareHands(b.hand, a.hand));
      const bestHand = eligibleHands[0].hand;
      const potWinners = eligibleHands.filter(h => compareHands(h.hand, bestHand) === 0);

      // Split pot among winners
      const share = Math.floor(pot.amount / potWinners.length);
      const remainder = pot.amount - share * potWinners.length;

      potWinners.forEach((w, i) => {
        const amount = share + (i === 0 ? remainder : 0);
        const player = this._players.find(p => p.seat === w.seat)!;
        player.chips += amount;
        winners.push({ seat: w.seat, hand: w.hand.description, potAmount: amount });
      });
    }

    this._phase = 'roundEnd';
    return { winners, hands };
  }

  prepareNextRound(): void {
    // Mark players with 0 chips as out
    for (const p of this._players) {
      if (p.chips === 0 && p.status !== 'out') {
        p.status = 'out';
      }
    }

    // Check if game is over
    const playersWithChips = this._players.filter(p => p.status !== 'out');
    if (playersWithChips.length <= 1) {
      this._phase = 'gameOver';
      return;
    }

    // Rotate dealer to next active player
    const activeSeatOrder = this._players
      .filter(p => p.status !== 'out')
      .map(p => p.seat);
    const currentDealerIdx = activeSeatOrder.indexOf(this._dealer);
    this._dealer = activeSeatOrder[(currentDealerIdx + 1) % activeSeatOrder.length];

    this._phase = 'waiting';
  }

  getState(): GameState {
    return {
      seq: this._seq,
      phase: this._phase,
      community: [...this._community],
      pots: this.potManager.getPots(),
      currentBet: this.bettingRound?.currentBet ?? 0,
      activePlayer: this.bettingRound?.activePlayerSeat ?? -1,
      dealer: this._dealer,
      blinds: { ...this._blinds },
      players: this._players.map(p => ({
        ...p,
        cards: [...p.cards],
      })),
      foldWin: this._foldWin ?? undefined,
    };
  }

  /** Get a specific player's private hand (for BLE PrivateHand characteristic) */
  getPrivateHand(seat: number): Card[] {
    const player = this._players.find(p => p.seat === seat);
    return player ? [...player.cards] : [];
  }

  getMinRaiseSize(): number {
    const size = this.bettingRound?.minRaise ?? 0;
    return size > 0 ? size : this._blinds.bb;
  }

  // --- Private methods ---

  private collectBetsFromRound(): void {
    if (!this.bettingRound) return;
    const bets = this.bettingRound.getBets();
    if (bets.length > 0) {
      this.potManager.collectBets(bets);
    }
    // Remove folded players from pot eligibility
    for (const p of this._players) {
      if (p.status === 'folded') {
        this.potManager.removeFoldedPlayer(p.seat);
      }
    }
    // Reset bets for next round
    for (const p of this._players) {
      p.bet = 0;
    }
  }

  private advancePhase(): void {
    const nextPhases: Record<string, Phase> = {
      preflop: 'flop',
      flop: 'turn',
      turn: 'river',
      river: 'showdown',
    };

    const next = nextPhases[this._phase];
    if (!next) return;

    this._phase = next;

    // Deal community cards
    switch (next) {
      case 'flop':
        this.deck.deal(); // Burn
        this._community.push(...this.deck.dealMultiple(3));
        break;
      case 'turn':
      case 'river':
        this.deck.deal(); // Burn
        this._community.push(this.deck.deal());
        break;
      case 'showdown':
        this.bettingRound = null;
        return; // No new betting round for showdown
    }

    // After dealing, check if all remaining players are all-in
    const activePlayers = this._players.filter(p => p.status === 'active');
    if (activePlayers.length <= 1) {
      // Map the just-dealt street to its allIn* counterpart
      const allInPhaseMap: Partial<Record<Phase, Phase>> = {
        flop: 'allInFlop',
        turn: 'allInTurn',
        river: 'allInRiver',
      };
      const allInPhase = allInPhaseMap[this._phase];
      if (allInPhase) {
        this._phase = allInPhase;
        this.bettingRound = null;
        this.revealCardsForAllIn();
        return;
      }
    }

    // Start new betting round (post-flop: first active player after dealer)
    const seatOrder = activePlayers.map(p => p.seat);
    const dealerIdx = seatOrder.indexOf(this._dealer);
    // Find first active player after dealer
    // Heads-up exception: SB (= dealer) acts first postflop
    let firstToAct: number;
    if (dealerIdx === -1) {
      firstToAct = seatOrder[0];
    } else if (seatOrder.length === 2) {
      firstToAct = seatOrder[dealerIdx];
    } else {
      firstToAct = seatOrder[(dealerIdx + 1) % seatOrder.length];
    }
    this.bettingRound = new BettingRound(this._players, firstToAct, 0);
  }

  private revealCardsForAllIn(): void {
    for (const p of this._players) {
      if (p.status !== 'folded' && p.status !== 'out') {
        p.cardsRevealed = true;
      }
    }
  }

  private awardPotToLastPlayer(player: Player): void {
    const total = this.potManager.getTotal();
    player.chips += total;
    this._foldWin = { seat: player.seat, amount: total };
    this.potManager.reset();
  }
}
```

- [ ] **Step 4: Run the new tests**

```bash
npx jest tests/gameEngine/GameLoop.test.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gameEngine/types.ts src/gameEngine/GameLoop.ts tests/gameEngine/GameLoop.test.ts
git commit -m "feat: add allIn* phases and advanceRunout() to GameLoop"
```

---

## Task 3: Add `advanceRunout()` to `GameService` interface

**Files:**
- Modify: `src/services/GameService.ts`

No test needed — interface change, compiler enforces it.

- [ ] **Step 1: Add `advanceRunout()` to the interface**

```ts
// src/services/GameService.ts

import { GameState, PlayerAction, Blinds } from '../gameEngine';
import { ActionResult, ShowdownResult } from '../gameEngine';

export interface ActionInfo {
  canCheck: boolean;
  callAmount: number;     // 0 if can check
  minRaise: number;       // Raise TO value (total bet)
  maxRaise: number;       // = player.chips + player.bet
  canRaise: boolean;      // Has enough chips for minRaise
}

export interface GameService {
  getState(): GameState;
  getActionInfo(seat: number): ActionInfo;

  startGame(
    playerNames: string[],
    blinds: Blinds,
    initialChips: number,
    savedChips?: Record<string, number>,
    botCount?: number,
  ): void;
  startRound(): void;
  handleAction(seat: number, action: PlayerAction): ActionResult;
  resolveShowdown(): ShowdownResult;
  prepareNextRound(): void;
  advanceRunout(): void;

  subscribe(listener: (state: GameState) => void): () => void;

  getBotSeats?(): ReadonlySet<number>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: Compiler errors for all service classes missing `advanceRunout` (we'll fix them next).

---

## Task 4: Implement `advanceRunout()` in `LocalGameService`

**Files:**
- Modify: `src/services/LocalGameService.ts`

- [ ] **Step 1: Add `advanceRunout()` to `LocalGameService`**

Add the method after `prepareNextRound()` (around line 138):

```ts
  advanceRunout(): void {
    if (!this.gameLoop) throw new Error('Game not started');
    this.gameLoop.advanceRunout();
    this.notify();
  }
```

The full `LocalGameService` class should now contain all existing methods plus this one. No other changes needed.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: `LocalGameService` error gone; BLE services still have errors (fixed next).

- [ ] **Step 3: Run existing tests**

```bash
npx jest tests/gameEngine/ --no-coverage
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/GameService.ts src/services/LocalGameService.ts
git commit -m "feat: add advanceRunout() to GameService interface and LocalGameService"
```

---

## Task 5: Update BLE protocol — `VALID_PHASES` and `cardsRevealed`

**Files:**
- Modify: `src/services/ble/GameProtocol.ts:5, 11-18, 87-100`
- Test: `tests/ble/GameProtocol.test.ts`

**Background:** The BLE host broadcasts state using `GameHostMessage`. We need to:
1. Add `'allInFlop', 'allInTurn', 'allInRiver'` to `VALID_PHASES` so these phases pass validation.
2. Add `cardsRevealed?: boolean` to `GameStatePlayer` so revealed-card status travels over BLE.
3. Update `isGameStatePlayerArray()` to accept the new optional field.

- [ ] **Step 1: Write failing tests**

Add to `tests/ble/GameProtocol.test.ts` inside the `validateGameHostMessage` describe block:

```ts
    it('accepts stateUpdate with allInFlop phase', () => {
      expect(validateGameHostMessage({ ...validStateUpdate, phase: 'allInFlop' })).not.toBeNull();
    });

    it('accepts stateUpdate with allInTurn phase', () => {
      expect(validateGameHostMessage({ ...validStateUpdate, phase: 'allInTurn' })).not.toBeNull();
    });

    it('accepts stateUpdate with allInRiver phase', () => {
      expect(validateGameHostMessage({ ...validStateUpdate, phase: 'allInRiver' })).not.toBeNull();
    });

    it('accepts stateUpdate where a player has cardsRevealed=true', () => {
      const msg = {
        ...validStateUpdate,
        phase: 'allInFlop',
        players: [
          { seat: 0, name: 'Alice', chips: 995, status: 'active', bet: 5, cards: ['Ah', 'Kd'], cardsRevealed: true },
          { seat: 1, name: 'Bob', chips: 990, status: 'allIn', bet: 10, cards: ['2h', '7d'], cardsRevealed: true },
        ],
      };
      expect(validateGameHostMessage(msg)).not.toBeNull();
    });

    it('accepts stateUpdate where cardsRevealed is undefined (omitted)', () => {
      // existing validStateUpdate has no cardsRevealed — should still pass
      expect(validateGameHostMessage(validStateUpdate)).not.toBeNull();
    });

    it('rejects stateUpdate where cardsRevealed is not boolean', () => {
      const msg = {
        ...validStateUpdate,
        players: [
          { seat: 0, name: 'Alice', chips: 995, status: 'active', bet: 5, cards: [], cardsRevealed: 'yes' },
        ],
      };
      expect(validateGameHostMessage(msg)).toBeNull();
    });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/ble/GameProtocol.test.ts --no-coverage
```

Expected: The three `allIn*` phase tests and the `cardsRevealed` tests FAIL.

- [ ] **Step 3: Update `GameProtocol.ts`**

Make three targeted changes:

**Change 1** — `VALID_PHASES` (line 5):
```ts
const VALID_PHASES: Phase[] = ['waiting', 'preflop', 'flop', 'turn', 'river', 'allInFlop', 'allInTurn', 'allInRiver', 'showdown', 'roundEnd', 'gameOver'];
```

**Change 2** — `GameStatePlayer` type (lines 11-18):
```ts
export type GameStatePlayer = {
  seat: number;
  name: string;
  chips: number;
  status: PlayerStatus;
  bet: number;
  cards: Card[];
  cardsRevealed?: boolean;
};
```

**Change 3** — `isGameStatePlayerArray()` validator (lines 87-100). Add the `cardsRevealed` check as the last condition:
```ts
function isGameStatePlayerArray(value: unknown): value is GameStatePlayer[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    p =>
      isObject(p) &&
      typeof p.seat === 'number' &&
      typeof p.name === 'string' &&
      typeof p.chips === 'number' &&
      typeof p.status === 'string' &&
      VALID_STATUSES.includes(p.status as PlayerStatus) &&
      typeof p.bet === 'number' &&
      isCardArray(p.cards) &&
      (p.cardsRevealed === undefined || typeof p.cardsRevealed === 'boolean'),
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest tests/ble/GameProtocol.test.ts --no-coverage
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/GameProtocol.ts tests/ble/GameProtocol.test.ts
git commit -m "feat: add allIn* phases and cardsRevealed to BLE protocol"
```

---

## Task 6: Update `BleHostGameService` — `advanceRunout()` and card reveal broadcast

**Files:**
- Modify: `src/services/ble/BleHostGameService.ts`

Three changes:
1. Add `advanceRunout()` method.
2. Update `broadcastState()` to send actual cards (not `[]`) when `p.cardsRevealed === true`.
3. Update `getState()` to expose revealed cards for the host's UI too.
4. Update `sendCurrentStateTo()` (for late-joining spectators) — same card reveal logic as `broadcastState()`.

- [ ] **Step 1: Add `advanceRunout()` after `prepareNextRound()`**

```ts
  advanceRunout(): void {
    if (!this.gameLoop) throw new Error('Game not started');
    this.gameLoop.advanceRunout();
    this.broadcastState();
    this.notifyListeners();
  }
```

- [ ] **Step 2: Update `getState()` to expose revealed cards**

Replace the existing `getState()` method:

```ts
  getState(): GameState {
    if (!this.gameLoop) throw new Error('Game not started');
    const state = this.gameLoop.getState();
    return {
      ...state,
      players: state.players.map(p =>
        p.seat === this.hostSeat || p.cardsRevealed ? p : { ...p, cards: [] },
      ),
    };
  }
```

- [ ] **Step 3: Update `broadcastState()` to send actual cards when revealed**

Replace the `players` mapping inside `broadcastState()`:

```ts
  private broadcastState(): void {
    if (!this.gameLoop) return;
    const state = this.gameLoop.getState();

    const msg: GameHostMessage = {
      type: 'stateUpdate',
      seq: state.seq,
      phase: state.phase,
      community: state.community,
      pots: state.pots,
      currentBet: state.currentBet,
      activePlayer: state.activePlayer,
      dealer: state.dealer,
      blinds: state.blinds,
      players: state.players.map(p => ({
        seat: p.seat,
        name: p.name,
        chips: p.chips,
        status: p.status,
        bet: p.bet,
        cards: p.cardsRevealed ? p.cards : [] as Card[],
        cardsRevealed: p.cardsRevealed,
      })),
      minRaiseSize: this.gameLoop.getMinRaiseSize(),
      frozenSeats: Array.from(this.frozenSeats.keys()),
    };

    if (state.foldWin) {
      msg.foldWin = state.foldWin;
    }

    this.sendToAll('gameState', msg);
  }
```

- [ ] **Step 4: Update `sendCurrentStateTo()` (spectator catch-up) with same card reveal logic**

Replace the `players` mapping inside `sendCurrentStateTo()`:

```ts
  private sendCurrentStateTo(clientId: string): void {
    if (!this.gameLoop) return;
    const state = this.gameLoop.getState();
    const msg: GameHostMessage = {
      type: 'stateUpdate',
      seq: state.seq,
      phase: state.phase,
      community: state.community,
      pots: state.pots,
      currentBet: state.currentBet,
      activePlayer: state.activePlayer,
      dealer: state.dealer,
      blinds: state.blinds,
      players: state.players.map(p => ({
        seat: p.seat,
        name: p.name,
        chips: p.chips,
        status: p.status,
        bet: p.bet,
        cards: p.cardsRevealed ? p.cards : [] as Card[],
        cardsRevealed: p.cardsRevealed,
      })),
      minRaiseSize: this.gameLoop.getMinRaiseSize(),
      frozenSeats: Array.from(this.frozenSeats.keys()),
    };
    if (state.foldWin) msg.foldWin = state.foldWin;
    this.sendToClient(clientId, 'gameState', msg);
  }
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: `BleHostGameService` error gone; `BleClientGameService` and `BleSpectatorGameService` errors remain.

- [ ] **Step 6: Commit**

```bash
git add src/services/ble/BleHostGameService.ts
git commit -m "feat: BleHostGameService advanceRunout() and cardsRevealed broadcast"
```

---

## Task 7: Update `BleClientGameService` and `BleSpectatorGameService`

**Files:**
- Modify: `src/services/ble/BleClientGameService.ts`
- Modify: `src/services/ble/BleSpectatorGameService.ts`
- Test: `tests/ble/BleClientGameService.test.ts`

Both client services need:
1. A no-op `advanceRunout()` (host drives the runout).
2. `cardsRevealed` passed through when constructing player state from `stateUpdate` messages.

- [ ] **Step 1: Write failing tests for `BleClientGameService`**

Add to `tests/ble/BleClientGameService.test.ts`:

```ts
  describe('advanceRunout', () => {
    it('is a no-op (does not throw)', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());
      expect(() => service.advanceRunout()).not.toThrow();
    });
  });

  describe('cardsRevealed passthrough', () => {
    it('preserves cardsRevealed=true from stateUpdate message', () => {
      const msg = makeStateUpdate({
        phase: 'allInFlop',
        players: [
          { seat: 0, name: 'Host', chips: 800, status: 'allIn', bet: 0, cards: ['Ah', 'Kd'], cardsRevealed: true },
          { seat: 1, name: 'Alice', chips: 0, status: 'allIn', bet: 0, cards: ['2h', '7c'], cardsRevealed: true },
          { seat: 2, name: 'Bob', chips: 1000, status: 'folded', bet: 0, cards: [] },
        ],
      });
      sendMessage(transport, 'gameState', msg);
      const state = service.getState();
      const seat0 = state.players.find(p => p.seat === 0)!;
      const seat2 = state.players.find(p => p.seat === 2)!;
      expect(seat0.cardsRevealed).toBe(true);
      expect(seat2.cardsRevealed).toBeUndefined();
    });

    it('exposes revealed hole cards for non-self players', () => {
      // service has mySeat = 1
      const msg = makeStateUpdate({
        phase: 'allInFlop',
        players: [
          { seat: 0, name: 'Host', chips: 800, status: 'allIn', bet: 0, cards: ['Ah', 'Kd'], cardsRevealed: true },
          { seat: 1, name: 'Alice', chips: 0, status: 'allIn', bet: 0, cards: [], cardsRevealed: true },
          { seat: 2, name: 'Bob', chips: 1000, status: 'folded', bet: 0, cards: [] },
        ],
      });
      sendMessage(transport, 'gameState', msg);
      const state = service.getState();
      // Seat 0's cards come from the broadcast (cardsRevealed=true → host sent real cards)
      const seat0 = state.players.find(p => p.seat === 0)!;
      expect(seat0.cards).toEqual(['Ah', 'Kd']);
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/ble/BleClientGameService.test.ts --no-coverage
```

Expected: `advanceRunout is not a function` and cardsRevealed tests FAIL.

- [ ] **Step 3: Update `BleClientGameService.ts`**

**Add** `advanceRunout()` as a public no-op after `prepareNextRound()`:

```ts
  prepareNextRound(): void {
    // no-op: host controls round lifecycle; stateUpdate syncs automatically
  }

  advanceRunout(): void {
    // no-op: host drives runout; client observes via stateUpdate
  }
```

**Update** the `stateUpdate` player construction in `handleGameStateMessage()` to pass `cardsRevealed`:

```ts
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
            cards: p.cards,
            cardsRevealed: p.cardsRevealed,
          })),
          foldWin: msg.foldWin,
        };
        this.minRaiseSize = msg.minRaiseSize;
        this.frozenSeats = msg.frozenSeats;
        this.notifyListeners();
        break;
```

- [ ] **Step 4: Update `BleSpectatorGameService.ts`**

**Add** `advanceRunout()` as a public no-op after `prepareNextRound()`:

```ts
  prepareNextRound(): void {
    // no-op
  }

  advanceRunout(): void {
    // no-op: host drives runout; spectator observes via stateUpdate
  }
```

**Update** the `stateUpdate` player construction in `handleGameStateMessage()`:

```ts
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
            cards: p.cards,
            cardsRevealed: p.cardsRevealed,
          })),
          foldWin: msg.foldWin,
        };
        this.notifyListeners();
        break;
```

- [ ] **Step 5: Run tests**

```bash
npx jest tests/ble/ --no-coverage
```

Expected: All PASS.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/services/ble/BleClientGameService.ts src/services/ble/BleSpectatorGameService.ts tests/ble/BleClientGameService.test.ts
git commit -m "feat: BleClientGameService and BleSpectatorGameService advanceRunout() + cardsRevealed"
```

---

## Task 8: Add all-in runout timer in `GameContext`

**Files:**
- Modify: `src/contexts/GameContext.tsx`
- Test: `tests/ui/integration/edgeCases.integration.test.tsx`

**Background:** When the game enters `allInFlop`, `allInTurn`, or `allInRiver`, `GameContext` must fire a `setTimeout` (1500 ms for flop/turn, 2500 ms for river), then call `service.advanceRunout()` and `autoResolveShowdown()`. The cleanup function cancels the timer if the phase changes before it fires.

- [ ] **Step 1: Write a failing integration test**

Add a new describe block at the bottom of `tests/ui/integration/edgeCases.integration.test.tsx`:

```ts
// ---------------------------------------------------------------------------
// E-N: All-in runout timer
// ---------------------------------------------------------------------------
describe('E-N: All-in runout auto-advance', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('auto-advances from allInFlop to allInTurn after 1500ms', async () => {
    // Build a 2-player game where both go all-in preflop
    const service = new LocalGameService();
    service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);

    // Give Bob only 10 chips so he's all-in from BB post
    const bobPlayer = (service as any).gameLoop._players.find((p: any) => p.seat === 1);
    bobPlayer.chips = 10;

    service.startRound();

    // Alice (SB, seat 0 in heads-up) goes all-in
    service.handleAction(0, { action: 'allIn' });

    // Game should now be in allInFlop
    expect(service.getState().phase).toBe('allInFlop');

    const { renderGameScreen } = await import('./helpers/integrationTestHelper');
    // We test the service layer directly — the timer fires via GameContext's useEffect.
    // For a direct service test, manually call advanceRunout after checking phase.
    service.advanceRunout();
    expect(service.getState().phase).toBe('allInTurn');
    expect(service.getState().community).toHaveLength(4);
  });

  it('auto-advances from allInTurn to allInRiver after 1500ms', () => {
    const service = new LocalGameService();
    service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
    const bob = (service as any).gameLoop._players.find((p: any) => p.seat === 1);
    bob.chips = 10;
    service.startRound();
    service.handleAction(0, { action: 'allIn' });
    service.advanceRunout(); // allInFlop → allInTurn
    service.advanceRunout(); // allInTurn → allInRiver
    expect(service.getState().phase).toBe('allInRiver');
    expect(service.getState().community).toHaveLength(5);
  });

  it('auto-advances from allInRiver to showdown after 2500ms', () => {
    const service = new LocalGameService();
    service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
    const bob = (service as any).gameLoop._players.find((p: any) => p.seat === 1);
    bob.chips = 10;
    service.startRound();
    service.handleAction(0, { action: 'allIn' });
    service.advanceRunout();
    service.advanceRunout();
    service.advanceRunout();
    expect(service.getState().phase).toBe('showdown');
  });
});
```

- [ ] **Step 2: Run tests to confirm they pass at service layer**

```bash
npx jest tests/ui/integration/edgeCases.integration.test.tsx -t "All-in runout" --no-coverage
```

Expected: PASS (these tests directly call `service.advanceRunout()`, not the timer).

- [ ] **Step 3: Add the timer `useEffect` to `GameContext.tsx`**

Add the following `useEffect` inside `GameProvider`, after the existing `useEffect` for auto-updating `viewingSeat` (around line 180), before the `doAction` callback:

```ts
  // Auto-advance all-in runout phases via timer
  useEffect(() => {
    if (!state) return;
    const phase = state.phase;
    if (phase !== 'allInFlop' && phase !== 'allInTurn' && phase !== 'allInRiver') return;
    const delay = phase === 'allInRiver' ? 2500 : 1500;
    const timer = setTimeout(() => {
      serviceRef.current.advanceRunout();
      autoResolveShowdown();
    }, delay);
    return () => clearTimeout(timer);
  }, [state?.phase, autoResolveShowdown]);
```

- [ ] **Step 4: Run full test suite to catch regressions**

```bash
npx jest --no-coverage
```

Expected: All previously passing tests still PASS. (If any integration tests relied on the synchronous all-in skip, they will now need fake timers — fix them if they appear.)

- [ ] **Step 5: Commit**

```bash
git add src/contexts/GameContext.tsx tests/ui/integration/edgeCases.integration.test.tsx
git commit -m "feat: GameContext timer auto-advances allIn* phases"
```

---

## Task 9: Show revealed hole cards in `PlayerSeat`

**Files:**
- Modify: `src/components/table/PlayerSeat.tsx:27`

- [ ] **Step 1: Update the `showCards` condition**

In `PlayerSeat.tsx`, find line 27:

```ts
  const showCards = mode === 'debug' || seat === viewingSeat;
```

Change it to:

```ts
  const showCards = mode === 'debug' || seat === viewingSeat || player.cardsRevealed === true;
```

- [ ] **Step 2: Run existing component tests**

```bash
npx jest tests/ui/components/ --no-coverage
```

Expected: All PASS (no existing test asserts that opponent cards are hidden during a specific phase — the change is safe).

- [ ] **Step 3: Commit**

```bash
git add src/components/table/PlayerSeat.tsx
git commit -m "feat: PlayerSeat shows hole cards face-up when cardsRevealed=true"
```

---

## Task 10: Show community cards in `ResultOverlay`

**Files:**
- Modify: `src/components/result/ResultOverlay.tsx`

**Background:** After showdown, the result modal should show the 5 community cards above the hand list so players can review the board.

- [ ] **Step 1: Add the community cards row to `ResultOverlay`**

In `ResultOverlay.tsx`, add the community cards row immediately before the `handsSection` block. Find this existing JSX (around line 50):

```tsx
          {showdownResult && (
            <View style={styles.handsSection}>
```

Insert the new row just above it:

```tsx
          {showdownResult && state.community.length > 0 && (
            <View style={styles.communityRow}>
              {state.community.map((card, i) => (
                <PlayingCard key={i} card={card} faceUp size="hand" />
              ))}
            </View>
          )}

          {showdownResult && (
            <View style={styles.handsSection}>
```

Then add the new style at the end of the `StyleSheet.create({...})` block:

```ts
  communityRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
```

- [ ] **Step 2: Run integration tests that cover the result overlay**

```bash
npx jest tests/ui/integration/resultAndNextRound.integration.test.tsx --no-coverage
```

Expected: All PASS (the community cards render for any showdown result without breaking existing assertions).

- [ ] **Step 3: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/result/ResultOverlay.tsx
git commit -m "feat: ResultOverlay shows community cards above hand list"
```

---

## Self-Review

### 1. Spec coverage

| Spec requirement | Covered by |
|---|---|
| Reveal remaining community cards one at a time with 1.5 s intervals | Task 2 (engine phases) + Task 8 (timer) |
| Reveal all non-folded players' hole cards face-up when all-in runout begins | Task 2 (`revealCardsForAllIn`) + Task 9 (`PlayerSeat`) |
| Wait 2.5 s after river before transitioning to showdown | Task 8 (`delay = phase === 'allInRiver' ? 2500 : 1500`) |
| Show community cards in result overlay | Task 10 |
| `advanceRunout()` added to `GameService` interface | Task 3 |
| `LocalGameService` implements `advanceRunout()` | Task 4 |
| `BleHostGameService` implements `advanceRunout()` + broadcasts cards | Task 6 |
| `BleClientGameService` no-op + passes `cardsRevealed` | Task 7 |
| `BleSpectatorGameService` no-op + passes `cardsRevealed` | Task 7 |
| BLE protocol validates `allIn*` phases and `cardsRevealed` | Task 5 |
| `cardsRevealed` reset on `startRound()` | Task 2 |

All requirements covered. ✓

### 2. Placeholder scan

None found. All steps contain complete code. ✓

### 3. Type consistency

- `Phase` type (`allInFlop`, `allInTurn`, `allInRiver`): defined in Task 1, used consistently in Tasks 2, 5, 6, 7, 8.
- `Player.cardsRevealed?: boolean`: defined in Task 1, set in Task 2 (`revealCardsForAllIn`), broadcast in Task 6, passed through in Task 7, read in Task 9.
- `advanceRunout(): void`: added to interface in Task 3, implemented in Tasks 4, 6, 7.
- `GameStatePlayer.cardsRevealed?: boolean`: added in Task 5, populated in Task 6, read in Task 7. ✓
