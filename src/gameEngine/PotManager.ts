import { Pot } from './types';

export interface BetEntry {
  seat: number;
  amount: number;
  isAllIn: boolean;
}

export class PotManager {
  private pots: Pot[] = [];

  collectBets(bets: BetEntry[]): void {
    if (bets.length === 0) return;

    // Sort by amount ascending for side pot calculation
    const sorted = [...bets].sort((a, b) => a.amount - b.amount);

    // Find all-in amounts that create pot boundaries
    const allInAmounts = sorted
      .filter(b => b.isAllIn)
      .map(b => b.amount);
    const boundaries = [...new Set(allInAmounts)].sort((a, b) => a - b);

    if (boundaries.length === 0) {
      // No all-ins: everything goes to main pot
      const total = bets.reduce((sum, b) => sum + b.amount, 0);
      const eligible = bets.map(b => b.seat).sort((a, b) => a - b);
      this.addToPot(total, eligible);
      return;
    }

    let previousBoundary = 0;

    for (const boundary of boundaries) {
      const layerAmount = boundary - previousBoundary;
      if (layerAmount <= 0) continue;

      // Players who contributed at least this boundary amount
      const eligible = bets
        .filter(b => b.amount >= boundary)
        .map(b => b.seat)
        .sort((a, b) => a - b);
      // Sum each contributor's actual contribution to this layer
      const potAmount = bets
        .filter(b => b.amount > previousBoundary)
        .reduce((sum, b) => sum + Math.min(b.amount, boundary) - previousBoundary, 0);

      this.addToPot(potAmount, eligible);
      previousBoundary = boundary;
    }

    // Remaining amount above all all-in boundaries
    const maxAllIn = boundaries[boundaries.length - 1];
    const remainingBets = bets.filter(b => b.amount > maxAllIn);
    if (remainingBets.length > 0) {
      const remainingTotal = remainingBets.reduce(
        (sum, b) => sum + b.amount - maxAllIn,
        0,
      );
      const eligible = remainingBets
        .map(b => b.seat)
        .sort((a, b) => a - b);
      this.addToPot(remainingTotal, eligible);
    }
  }

  private addToPot(amount: number, eligible: number[]): void {
    // Try to merge with existing pot that has same eligible players
    const existing = this.pots.find(
      p =>
        p.eligible.length === eligible.length &&
        p.eligible.every((s, i) => s === eligible[i]),
    );
    if (existing) {
      existing.amount += amount;
    } else {
      this.pots.push({ amount, eligible: [...eligible] });
    }
  }

  removeFoldedPlayer(seat: number): void {
    for (const pot of this.pots) {
      pot.eligible = pot.eligible.filter(s => s !== seat);
    }
  }

  getPots(): Pot[] {
    return this.pots.map(p => ({ ...p, eligible: [...p.eligible] }));
  }

  getTotal(): number {
    return this.pots.reduce((sum, p) => sum + p.amount, 0);
  }

  reset(): void {
    this.pots = [];
  }
}
