import React, { useState, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import { GameProvider } from '../../../../src/contexts/GameContext';
import { LocalGameService } from '../../../../src/services/LocalGameService';
import { useGame } from '../../../../src/hooks/useGame';
import { PlayerSeat } from '../../../../src/components/table/PlayerSeat';
import { CommunityCards } from '../../../../src/components/table/CommunityCards';
import { PotDisplay } from '../../../../src/components/table/PotDisplay';
import { ActionButtons } from '../../../../src/components/actions/ActionButtons';
import { ResultOverlay } from '../../../../src/components/result/ResultOverlay';
import { PassDeviceScreen } from '../../../../src/components/common/PassDeviceScreen';

interface SetupOptions {
  playerNames?: string[];
  blinds?: { sb: number; bb: number };
  initialChips?: number;
  mode?: 'hotseat' | 'debug';
}

export function setupIntegrationTest(options: SetupOptions = {}) {
  const {
    playerNames = ['Alice', 'Bob', 'Charlie'],
    blinds = { sb: 5, bb: 10 },
    initialChips = 1000,
    mode = 'debug',
  } = options;

  const service = new LocalGameService();
  service.startGame(playerNames, blinds, initialChips);
  service.startRound();

  return { service, mode, playerNames, blinds, initialChips };
}

/**
 * A test version of GameView that mirrors app/game.tsx GameView.
 * Composes the same child components so integration tests
 * exercise the real component tree with a real service.
 */
function TestGameView() {
  const { state, mode } = useGame();
  const [showPassScreen, setShowPassScreen] = useState(false);
  const [nextPlayerName, setNextPlayerName] = useState('');
  const prevActiveRef = useRef<number>(-1);

  useEffect(() => {
    if (!state || mode !== 'hotseat') return;

    const currentActive = state.activePlayer;
    const prevActive = prevActiveRef.current;

    if (
      currentActive >= 0 &&
      currentActive !== prevActive &&
      state.phase !== 'roundEnd' &&
      state.phase !== 'showdown'
    ) {
      const player = state.players.find(p => p.seat === currentActive);
      if (player) {
        setNextPlayerName(player.name);
        setShowPassScreen(true);
      }
    }
    prevActiveRef.current = currentActive;
  }, [state?.activePlayer, state?.phase, mode]);

  if (!state) return null;

  if (showPassScreen) {
    return (
      <PassDeviceScreen
        playerName={nextPlayerName}
        onDismiss={() => setShowPassScreen(false)}
      />
    );
  }

  const playerCount = state.players.length;
  const seats = state.players.map(p => p.seat);

  return (
    <View testID="game-view">
      {seats.map(seat => (
        <PlayerSeat key={seat} seat={seat} />
      ))}
      <PotDisplay />
      <CommunityCards />
      <ActionButtons />
      <ResultOverlay />
    </View>
  );
}

export function renderGameScreen(
  service: LocalGameService,
  mode: 'hotseat' | 'debug' = 'debug',
) {
  return render(
    <GameProvider service={service} mode={mode}>
      <TestGameView />
    </GameProvider>,
  );
}

/**
 * Advance the game by having all players check/call until the target phase.
 * Uses the service directly (not UI events) — call this before render
 * or wrap in act() if called after render.
 */
export function advanceToPhase(
  service: LocalGameService,
  targetPhase: string,
): void {
  let state = service.getState();
  let safety = 0;
  while (state.phase !== targetPhase && safety < 100) {
    if (state.activePlayer < 0) {
      // In showdown, resolve it
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

/**
 * Complete the current betting round by having all remaining players check/call.
 */
export function completeCurrentBettingRound(service: LocalGameService): void {
  let state = service.getState();
  const startPhase = state.phase;
  let safety = 0;
  while (state.phase === startPhase && state.activePlayer >= 0 && safety < 20) {
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
