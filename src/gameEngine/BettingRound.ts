import { Player, PlayerAction, Blinds } from './types';
import { BetEntry } from './PotManager';

export interface ActionResult {
  valid: boolean;
  reason?: string;
}

export class BettingRound {
  private players: Player[];
  private _currentBet: number;
  private _activeSeat: number;      // Seat number of player who must act next
  private actedSet: Set<number>;    // Seats that have acted since last raise
  private lastRaiserSeat: number | null;
  private minRaiseSize: number;     // Minimum raise increment

  constructor(players: Player[], firstToActSeat: number, currentBet: number) {
    this.players = players;
    this._currentBet = currentBet;
    this.actedSet = new Set();
    this.lastRaiserSeat = null;
    this.minRaiseSize = currentBet; // Initial min raise = BB or current bet
    this._activeSeat = firstToActSeat;
  }

  static createPreflop(players: Player[], dealer: number, blinds: Blinds): BettingRound {
    const activePlayers = players.filter(p => p.status === 'active');
    const seatOrder = activePlayers.map(p => p.seat);

    let sbSeat: number;
    let bbSeat: number;
    let firstToActSeat: number;

    if (activePlayers.length === 2) {
      // Heads-up: dealer = SB, other = BB
      sbSeat = dealer;
      bbSeat = seatOrder.find(s => s !== dealer)!;
      firstToActSeat = sbSeat; // SB acts first preflop in heads-up
    } else {
      // 3-4 players: SB is left of dealer, BB left of SB
      const dealerIdx = seatOrder.indexOf(dealer);
      sbSeat = seatOrder[(dealerIdx + 1) % seatOrder.length];
      bbSeat = seatOrder[(dealerIdx + 2) % seatOrder.length];
      firstToActSeat = seatOrder[(dealerIdx + 3) % seatOrder.length];
    }

    // Post blinds
    const sbPlayer = players.find(p => p.seat === sbSeat)!;
    const bbPlayer = players.find(p => p.seat === bbSeat)!;

    const sbAmount = Math.min(blinds.sb, sbPlayer.chips);
    sbPlayer.chips -= sbAmount;
    sbPlayer.bet = sbAmount;
    if (sbPlayer.chips === 0) sbPlayer.status = 'allIn';

    const bbAmount = Math.min(blinds.bb, bbPlayer.chips);
    bbPlayer.chips -= bbAmount;
    bbPlayer.bet = bbAmount;
    if (bbPlayer.chips === 0) bbPlayer.status = 'allIn';

    const round = new BettingRound(players, firstToActSeat, blinds.bb);
    round.minRaiseSize = blinds.bb;
    return round;
  }

  get currentBet(): number {
    return this._currentBet;
  }

  get activePlayerSeat(): number {
    if (this.getActionablePlayers().length === 0) return -1;
    return this._activeSeat;
  }

  get isComplete(): boolean {
    // Only one non-folded player left
    const nonFolded = this.players.filter(p => p.status !== 'folded' && p.status !== 'out');
    if (nonFolded.length <= 1) return true;

    // No one left who can act (all are all-in or folded)
    const actionable = this.getActionablePlayers();
    if (actionable.length === 0) return true;

    // Everyone who can act has acted since last raise, and bets are matched
    for (const p of actionable) {
      if (!this.actedSet.has(p.seat)) return false;
    }
    return true;
  }

  handleAction(seat: number, action: PlayerAction): ActionResult {
    // Validate turn
    if (seat !== this.activePlayerSeat) {
      return { valid: false, reason: `Seat ${seat}: not your turn (active: ${this.activePlayerSeat})` };
    }

    const player = this.players.find(p => p.seat === seat)!;

    switch (action.action) {
      case 'fold':
        return this.handleFold(player);
      case 'check':
        return this.handleCheck(player);
      case 'call':
        return this.handleCall(player);
      case 'raise':
        return this.handleRaise(player, action.amount ?? 0);
      case 'allIn':
        return this.handleAllIn(player);
      default:
        return { valid: false, reason: 'Unknown action' };
    }
  }

  getBets(): BetEntry[] {
    return this.players
      .filter(p => p.bet > 0)
      .map(p => ({
        seat: p.seat,
        amount: p.bet,
        isAllIn: p.status === 'allIn',
      }));
  }

  // --- Private methods ---

  private handleFold(player: Player): ActionResult {
    player.status = 'folded';
    this.actedSet.add(player.seat);
    this.advanceTurn();
    return { valid: true };
  }

  private handleCheck(player: Player): ActionResult {
    if (player.bet < this._currentBet) {
      return { valid: false, reason: 'Cannot check — must call, raise, or fold' };
    }
    this.actedSet.add(player.seat);
    this.advanceTurn();
    return { valid: true };
  }

  private handleCall(player: Player): ActionResult {
    const toCall = this._currentBet - player.bet;
    if (toCall <= 0) {
      return { valid: false, reason: 'Nothing to call — use check' };
    }

    const amount = Math.min(toCall, player.chips);
    player.chips -= amount;
    player.bet += amount;
    if (player.chips === 0) player.status = 'allIn';

    this.actedSet.add(player.seat);
    this.advanceTurn();
    return { valid: true };
  }

  /** @param totalAmount - The total bet amount to raise TO (not the increment). E.g., raise to 200 means totalAmount=200. */
  private handleRaise(player: Player, totalAmount: number): ActionResult {
    const raiseIncrement = totalAmount - this._currentBet;
    if (raiseIncrement < this.minRaiseSize && totalAmount < player.chips + player.bet) {
      return {
        valid: false,
        reason: `Minimum raise is ${this._currentBet + this.minRaiseSize}, got ${totalAmount}`,
      };
    }

    const toAdd = totalAmount - player.bet;
    if (toAdd > player.chips) {
      return { valid: false, reason: 'Not enough chips — use all-in' };
    }

    player.chips -= toAdd;
    player.bet = totalAmount;
    this.minRaiseSize = raiseIncrement;
    this._currentBet = totalAmount;
    this.lastRaiserSeat = player.seat;

    // Reset acted set — everyone needs to act again
    this.actedSet.clear();
    this.actedSet.add(player.seat);

    this.advanceTurn();
    return { valid: true };
  }

  private handleAllIn(player: Player): ActionResult {
    const amount = player.chips;
    player.bet += amount;
    player.chips = 0;
    player.status = 'allIn';

    // If this all-in is a raise (bet > currentBet by at least minRaise), reopen action
    const raiseIncrement = player.bet - this._currentBet;
    if (raiseIncrement >= this.minRaiseSize) {
      this.minRaiseSize = raiseIncrement;
      this._currentBet = player.bet;
      this.actedSet.clear();
    }
    if (player.bet > this._currentBet) {
      this._currentBet = player.bet;
    }

    this.actedSet.add(player.seat);
    this.advanceTurn();
    return { valid: true };
  }

  /** Advance to the next player who can act, walking seats in order. */
  private advanceTurn(): void {
    const actionable = this.getActionablePlayers();
    if (actionable.length === 0) return;

    const seats = actionable.map(p => p.seat);
    const currentIdx = seats.indexOf(this._activeSeat);

    if (currentIdx === -1) {
      // Current seat was removed (fold/allIn) — find next seat after it in circular order
      this._activeSeat = seats.find(s => s > this._activeSeat) ?? seats[0];
    } else {
      this._activeSeat = seats[(currentIdx + 1) % seats.length];
    }
  }

  private getActionablePlayers(): Player[] {
    return this.players.filter(p => p.status === 'active');
  }
}
