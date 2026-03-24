// tests/ble/integration/BleAutoSpectatorTransition.test.ts

import { BleHostGameService } from '../../../src/services/ble/BleHostGameService';
import { BleClientGameService } from '../../../src/services/ble/BleClientGameService';
import {
  MockBleHostTransport,
  MockBleClientTransport,
  MockBleNetwork,
} from '../../../src/services/ble/MockBleTransport';
import { GameState } from '../../../src/gameEngine';
import { ChunkManager } from '../../../src/services/ble/ChunkManager';

describe('BleAutoSpectatorTransition integration', () => {
  let hostTransport: MockBleHostTransport;
  let clientTransport: MockBleClientTransport;

  beforeEach(() => {
    hostTransport = new MockBleHostTransport();
    clientTransport = new MockBleClientTransport();
    MockBleNetwork.create(hostTransport, [clientTransport]);
    // client-1 is the client
  });

  it('stateUpdate forwarded to client subscriber contains status:out after bust', () => {
    // Setup: 2-player heads-up game. Seat 0 = Host, Seat 1 = client-1.
    const clientSeatMap = new Map<string, number>([['client-1', 1]]);
    const hostService = new BleHostGameService(hostTransport, clientSeatMap);
    const clientService = new BleClientGameService(clientTransport, 1);

    // Capture all states received by the client subscriber
    const receivedStates: GameState[] = [];
    clientService.subscribe((state: GameState) => {
      receivedStates.push(state);
    });

    // Start a heads-up game with small initial chips so one player can go all-in easily
    hostService.startGame(['Host', 'Alice'], { sb: 5, bb: 10 }, 100);
    hostService.startRound();

    // Drive the game: force all-in for the active player, then opponent calls
    // We want a bust scenario: one player raises all-in, opponent calls → showdown
    let hostState = hostService.getState();
    let iterations = 0;

    // First action: raise all-in (this will be one of the players posting blind or acting)
    // Play until preflop: have the active player go all-in
    while (hostState.phase === 'preflop' && hostState.activePlayer >= 0 && iterations < 10) {
      iterations++;
      const activeSeat = hostState.activePlayer;
      const info = hostService.getActionInfo(activeSeat);

      if (activeSeat === 0) {
        // Host acts directly — go all-in
        if (info.canRaise) {
          hostService.handleAction(activeSeat, { action: 'raise', amount: info.maxRaise });
        } else {
          hostService.handleAction(activeSeat, { action: 'call' });
        }
      } else {
        // Client acts via BLE — go all-in (call the all-in)
        if (info.canRaise) {
          clientService.handleAction(activeSeat, { action: 'raise', amount: info.maxRaise });
        } else {
          clientService.handleAction(activeSeat, { action: 'call' });
        }
      }
      hostState = hostService.getState();
    }

    // Continue until showdown or roundEnd
    iterations = 0;
    while (
      hostState.phase !== 'showdown' &&
      hostState.phase !== 'roundEnd' &&
      hostState.activePlayer >= 0 &&
      iterations < 50
    ) {
      iterations++;
      const activeSeat = hostState.activePlayer;
      const info = hostService.getActionInfo(activeSeat);

      if (activeSeat === 0) {
        if (info.canCheck) {
          hostService.handleAction(activeSeat, { action: 'check' });
        } else {
          hostService.handleAction(activeSeat, { action: 'call' });
        }
      } else {
        if (info.canCheck) {
          clientService.handleAction(activeSeat, { action: 'check' });
        } else {
          clientService.handleAction(activeSeat, { action: 'call' });
        }
      }
      hostState = hostService.getState();
    }

    // Resolve showdown if needed
    if (hostState.phase === 'showdown') {
      hostService.resolveShowdown();
    }

    // Trigger prepareNextRound which broadcasts the state with status:'out' for the loser
    hostService.prepareNextRound();

    // The client subscriber should have received at least one state where a player has status:'out'
    const stateWithBust = receivedStates.find(state =>
      state.players.some(p => p.status === 'out'),
    );
    expect(stateWithBust).toBeDefined();
    const bustPlayer = stateWithBust!.players.find(p => p.status === 'out');
    expect(bustPlayer).toBeDefined();
    expect(bustPlayer!.chips).toBe(0);
  });

  it('spectator client action guard: spectator clientId is ignored by host', () => {
    // Setup: 2-player game where client-1 is a spectator
    const clientSeatMap = new Map<string, number>([['client-1', 1]]);
    const spectatorClientIds = ['client-1'];
    const hostService = new BleHostGameService(hostTransport, clientSeatMap, spectatorClientIds);

    hostService.startGame(['Host', 'Alice'], { sb: 5, bb: 10 }, 1000);
    hostService.startRound();

    const stateBefore = hostService.getState();
    const seqBefore = stateBefore.seq;
    const activeSeatBefore = stateBefore.activePlayer;

    // Simulate the spectator (client-1) sending a playerAction via transport
    const chunkManager = new ChunkManager();
    const actionMsg = JSON.stringify({ type: 'playerAction', action: 'fold' });
    const chunks = chunkManager.encode(actionMsg);
    for (const chunk of chunks) {
      hostTransport.simulateMessageReceived('client-1', 'playerAction', chunk);
    }

    // The host should have ignored the spectator's action:
    // state seq should be unchanged, activePlayer should be the same
    const stateAfter = hostService.getState();
    expect(stateAfter.seq).toBe(seqBefore);
    expect(stateAfter.activePlayer).toBe(activeSeatBefore);
    // The active player should NOT be folded
    const activePlayer = stateAfter.players.find(p => p.seat === activeSeatBefore);
    expect(activePlayer!.status).not.toBe('folded');
  });
});
