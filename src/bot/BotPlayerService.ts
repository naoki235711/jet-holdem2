// src/bot/BotPlayerService.ts

import { GameState, PlayerAction, Card } from '../gameEngine/types';
import { decidePreflopAction } from './strategy/preflopStrategy';
import { decidePostflopAction } from './strategy/postflopStrategy';

export interface BotContext {
  gameState: GameState;
  holeCards: Card[];
  seat: number;
}

export function decide(ctx: BotContext): PlayerAction {
  const { gameState, holeCards, seat } = ctx;
  const phase = gameState.phase;

  if (phase === 'preflop') {
    return decidePreflopAction(gameState, holeCards, seat);
  }
  if (phase === 'flop' || phase === 'turn' || phase === 'river') {
    return decidePostflopAction(gameState, holeCards, seat);
  }

  // フォールバック（showdown等、通常は呼ばれない）
  return { action: 'fold' };
}
