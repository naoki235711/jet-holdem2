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

    // Start new betting round (post-flop: first active player after dealer)
    const activePlayers = this._players.filter(p => p.status === 'active');
    if (activePlayers.length <= 1) {
      // All but one (or zero) are all-in — skip to next phase
      this.advancePhase();
      return;
    }

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

  private awardPotToLastPlayer(player: Player): void {
    const total = this.potManager.getTotal();
    player.chips += total;
    this._foldWin = { seat: player.seat, amount: total };
    this.potManager.reset();
  }
}
