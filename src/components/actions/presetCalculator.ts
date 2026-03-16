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

function round(value: number, bb: number): number {
  return Math.round(value / bb) * bb;
}
