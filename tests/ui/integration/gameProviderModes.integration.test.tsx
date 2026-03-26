import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import { GameProvider } from '../../../src/contexts/GameContext';
import { useGame } from '../../../src/hooks/useGame';
import { LocalGameService } from '../../../src/services/LocalGameService';
import { InMemoryGameRepository } from '../../../src/services/persistence/InMemoryGameRepository';
import { GameService, ActionInfo } from '../../../src/services/GameService';
import { GameState, PlayerAction, Card, Phase, PlayerStatus } from '../../../src/gameEngine';
import { ActionResult, ShowdownResult } from '../../../src/gameEngine';

// --- Test consumer component that exposes context values ---
function TestConsumer({ onContext }: { onContext?: (ctx: ReturnType<typeof useGame>) => void }) {
  const ctx = useGame();
  React.useEffect(() => { onContext?.(ctx); });
  return (
    <>
      <Text testID="phase">{ctx.state?.phase ?? 'null'}</Text>
      <Text testID="showdown-result">{ctx.showdownResult ? 'set' : 'null'}</Text>
    </>
  );
}

// --- Mock GameService for BLE-client mode tests (GM-3, GM-4) ---
function createMockGameService() {
  let listener: ((state: GameState) => void) | null = null;
  const mockState: GameState = {
    seq: 1,
    phase: 'preflop' as Phase,
    community: [],
    pots: [{ amount: 0, eligible: [0, 1] }],
    currentBet: 10,
    activePlayer: 0,
    dealer: 0,
    blinds: { sb: 5, bb: 10 },
    players: [
      { seat: 0, name: 'Alice', chips: 990, status: 'active' as PlayerStatus, bet: 5, cards: ['Ah' as Card, 'Ks' as Card] },
      { seat: 1, name: 'Bob', chips: 990, status: 'active' as PlayerStatus, bet: 10, cards: [] },
    ],
  };

  let currentState = { ...mockState };

  const service: GameService & { emit: (state: GameState) => void } = {
    getState: jest.fn(() => currentState),
    getActionInfo: jest.fn((): ActionInfo => ({
      canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
    })),
    startGame: jest.fn(),
    startRound: jest.fn(),
    handleAction: jest.fn((_seat: number, _action: PlayerAction): ActionResult => {
      // After action, transition to showdown
      currentState = { ...currentState, phase: 'showdown' as Phase, activePlayer: -1 };
      return { valid: true };
    }),
    resolveShowdown: jest.fn((): ShowdownResult => ({
      winners: [{ seat: 0, hand: 'Pair of Aces', potAmount: 100 }],
      hands: [
        { seat: 0, cards: ['Ah' as Card, 'As' as Card], description: 'Pair of Aces' },
        { seat: 1, cards: ['Kh' as Card, 'Ks' as Card], description: 'Pair of Kings' },
      ],
    })),
    prepareNextRound: jest.fn(() => {
      currentState = { ...currentState, phase: 'waiting' as Phase };
    }),
    advanceRunout: jest.fn(),
    subscribe: jest.fn((fn: (state: GameState) => void) => {
      listener = fn;
      return () => { listener = null; };
    }),
    emit(state: GameState) {
      currentState = state;
      listener?.(state);
    },
  };

  return service;
}

// --- Helpers ---
function advanceToPhase(service: LocalGameService, targetPhase: string): void {
  let state = service.getState();
  let safety = 0;
  while (state.phase !== targetPhase && safety < 100) {
    if (state.activePlayer < 0) {
      if (state.phase === 'showdown') {
        service.resolveShowdown();
        state = service.getState();
        continue;
      }
      break;
    }
    const info = service.getActionInfo(state.activePlayer);
    if (info.canCheck) {
      service.handleAction(state.activePlayer, { action: 'check' });
    } else {
      service.handleAction(state.activePlayer, { action: 'call' });
    }
    state = service.getState();
    safety++;
  }
}

const flushPromises = () => new Promise(r => setTimeout(r, 20));

describe('GameProvider mode-specific logic', () => {
  describe('showdown auto-resolve', () => {
    // GM-1
    it('hotseat mode: doAction auto-resolves showdown', () => {
      const service = new LocalGameService();
      service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
      service.startRound();

      // Advance to river via service (before render)
      advanceToPhase(service, 'river');

      let ctx: ReturnType<typeof useGame> | null = null;
      render(
        <GameProvider service={service} mode="hotseat">
          <TestConsumer onContext={c => { ctx = c; }} />
        </GameProvider>,
      );

      // Get the active player and complete river via context doAction
      const state = service.getState();
      if (state.activePlayer >= 0) {
        act(() => {
          let s = service.getState();
          while (s.phase === 'river' && s.activePlayer >= 0) {
            const info = ctx!.getActionInfo(s.activePlayer);
            if (info.canCheck) {
              ctx!.doAction(s.activePlayer, { action: 'check' });
            } else {
              ctx!.doAction(s.activePlayer, { action: 'call' });
            }
            s = service.getState();
          }
        });
      }

      expect(ctx!.showdownResult).not.toBeNull();
      expect(ctx!.showdownResult!.winners.length).toBeGreaterThan(0);
    });

    // GM-2
    it('debug mode: doAction auto-resolves showdown', () => {
      const service = new LocalGameService();
      service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
      service.startRound();
      advanceToPhase(service, 'river');

      let ctx: ReturnType<typeof useGame> | null = null;
      render(
        <GameProvider service={service} mode="debug">
          <TestConsumer onContext={c => { ctx = c; }} />
        </GameProvider>,
      );

      act(() => {
        let s = service.getState();
        while (s.phase === 'river' && s.activePlayer >= 0) {
          const info = ctx!.getActionInfo(s.activePlayer);
          if (info.canCheck) {
            ctx!.doAction(s.activePlayer, { action: 'check' });
          } else {
            ctx!.doAction(s.activePlayer, { action: 'call' });
          }
          s = service.getState();
        }
      });

      expect(ctx!.showdownResult).not.toBeNull();
    });

    // GM-3
    it('ble-client mode: doAction does NOT auto-resolve showdown', () => {
      const mockService = createMockGameService();

      let ctx: ReturnType<typeof useGame> | null = null;
      render(
        <GameProvider service={mockService} mode="ble-client">
          <TestConsumer onContext={c => { ctx = c; }} />
        </GameProvider>,
      );

      // doAction triggers handleAction (which updates currentState to showdown internally)
      // but mock's handleAction does NOT call the listener, so React state won't update
      act(() => {
        ctx!.doAction(0, { action: 'call' });
      });

      // In ble-client mode, doAction should NOT call resolveShowdown
      expect(mockService.resolveShowdown).not.toHaveBeenCalled();
      expect(ctx!.showdownResult).toBeNull();
    });

    // GM-4
    it('ble-client mode: subscribe detects showdown phase transition', () => {
      const mockService = createMockGameService();

      let ctx: ReturnType<typeof useGame> | null = null;
      render(
        <GameProvider service={mockService} mode="ble-client">
          <TestConsumer onContext={c => { ctx = c; }} />
        </GameProvider>,
      );

      // Emit a preflop state first (set prevPhaseRef)
      act(() => {
        mockService.emit({
          ...mockService.getState(),
          phase: 'preflop' as Phase,
        });
      });

      // Now emit showdown phase transition
      act(() => {
        mockService.emit({
          ...mockService.getState(),
          phase: 'showdown' as Phase,
          activePlayer: -1,
        });
      });

      // GameProvider should have detected the transition and called resolveShowdown
      expect(mockService.resolveShowdown).toHaveBeenCalled();
      expect(ctx!.showdownResult).not.toBeNull();
      expect(ctx!.showdownResult!.winners).toHaveLength(1);
    });
  });

  describe('persistence integration', () => {
    // GM-5
    it('repository passed → persistence activates on roundEnd', async () => {
      const service = new LocalGameService();
      service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
      service.startRound();

      const repo = new InMemoryGameRepository();

      render(
        <GameProvider service={service} mode="debug" repository={repo} initialChips={1000} blinds={{ sb: 5, bb: 10 }}>
          <TestConsumer />
        </GameProvider>,
      );

      act(() => { advanceToPhase(service, 'roundEnd'); });

      await act(async () => { await flushPromises(); });

      const state = service.getState();
      for (const player of state.players) {
        const saved = await repo.getPlayerChips(player.name);
        expect(saved).toBe(player.chips);
      }
    });

    // GM-6
    it('repository omitted → persistence disabled', async () => {
      const service = new LocalGameService();
      service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
      service.startRound();

      render(
        <GameProvider service={service} mode="debug">
          <TestConsumer />
        </GameProvider>,
      );

      act(() => { advanceToPhase(service, 'roundEnd'); });

      await act(async () => { await flushPromises(); });

      // No repository means nothing was saved — no way to check
      // The key assertion is that no error was thrown
      expect(service.getState().phase).toBe('roundEnd');
    });

    // GM-7
    it('debug mode maps to hotseat for persistence config', async () => {
      const service = new LocalGameService();
      const lowConfig = { sb: 10, bb: 20 };
      service.startGame(['Alice', 'Bob'], lowConfig, 30);

      const repo = new InMemoryGameRepository();

      render(
        <GameProvider service={service} mode="debug" repository={repo} initialChips={30} blinds={lowConfig}>
          <TestConsumer />
        </GameProvider>,
      );

      // Play to gameOver to trigger saveGameRecord
      act(() => {
        while (service.getState().phase !== 'gameOver') {
          service.startRound();
          advanceToPhase(service, 'roundEnd');
          service.prepareNextRound();
        }
      });

      await act(async () => { await flushPromises(); });

      const history = await repo.getGameHistory();
      expect(history).toHaveLength(1);
      expect(history[0].mode).toBe('hotseat'); // debug → hotseat
    });

    // GM-8
    it('ble-host mode persistence records correct mode', async () => {
      const service = new LocalGameService();
      const lowConfig = { sb: 10, bb: 20 };
      service.startGame(['Alice', 'Bob'], lowConfig, 30);

      const repo = new InMemoryGameRepository();

      render(
        <GameProvider service={service} mode="ble-host" repository={repo} initialChips={30} blinds={lowConfig}>
          <TestConsumer />
        </GameProvider>,
      );

      act(() => {
        while (service.getState().phase !== 'gameOver') {
          service.startRound();
          advanceToPhase(service, 'roundEnd');
          service.prepareNextRound();
        }
      });

      await act(async () => { await flushPromises(); });

      const history = await repo.getGameHistory();
      expect(history).toHaveLength(1);
      expect(history[0].mode).toBe('ble-host');
    });
  });

  describe('nextRound', () => {
    // GM-9
    it('nextRound transitions to preflop and clears showdownResult', () => {
      const service = new LocalGameService();
      service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
      service.startRound();

      let ctx: ReturnType<typeof useGame> | null = null;
      render(
        <GameProvider service={service} mode="debug">
          <TestConsumer onContext={c => { ctx = c; }} />
        </GameProvider>,
      );

      // Advance to roundEnd via doAction (to set showdownResult)
      act(() => {
        let s = service.getState();
        while (s.phase !== 'roundEnd' && s.activePlayer >= 0) {
          const info = ctx!.getActionInfo(s.activePlayer);
          if (info.canCheck) {
            ctx!.doAction(s.activePlayer, { action: 'check' });
          } else {
            ctx!.doAction(s.activePlayer, { action: 'call' });
          }
          s = service.getState();
          if (s.phase === 'showdown') break;
        }
      });

      // showdownResult should be set (auto-resolved by doAction in non-ble-client mode)
      expect(ctx!.showdownResult).not.toBeNull();

      // Call nextRound
      act(() => { ctx!.nextRound(); });

      expect(ctx!.state?.phase).toBe('preflop');
      expect(ctx!.showdownResult).toBeNull();
    });
  });
});
