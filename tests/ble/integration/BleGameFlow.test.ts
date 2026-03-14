// tests/ble/integration/BleGameFlow.test.ts

import { BleHostGameService } from '../../../src/services/ble/BleHostGameService';
import { BleClientGameService } from '../../../src/services/ble/BleClientGameService';
import {
  MockBleHostTransport,
  MockBleClientTransport,
  MockBleNetwork,
} from '../../../src/services/ble/MockBleTransport';
import { ChunkManager } from '../../../src/services/ble/ChunkManager';

describe('BleGameFlow integration', () => {
  let hostTransport: MockBleHostTransport;
  let client1Transport: MockBleClientTransport;
  let client2Transport: MockBleClientTransport;
  let hostService: BleHostGameService;
  let client1Service: BleClientGameService;
  let client2Service: BleClientGameService;

  beforeEach(() => {
    hostTransport = new MockBleHostTransport();
    client1Transport = new MockBleClientTransport();
    client2Transport = new MockBleClientTransport();
    MockBleNetwork.create(hostTransport, [client1Transport, client2Transport]);

    const clientSeatMap = new Map<string, number>([
      ['client-1', 1],
      ['client-2', 2],
    ]);
    hostService = new BleHostGameService(hostTransport, clientSeatMap);
    client1Service = new BleClientGameService(client1Transport, 1);
    client2Service = new BleClientGameService(client2Transport, 2);
  });

  it('full game round: startRound → actions → showdown', () => {
    hostService.startGame(['Host', 'Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
    hostService.startRound();

    // Clients should have received state
    const client1State = client1Service.getState();
    expect(client1State.phase).toBe('preflop');
    expect(client1State.players).toHaveLength(3);

    // Client 1 should see own cards
    expect(client1State.players[1].cards).toHaveLength(2);
    // Client 1 should NOT see other players' cards
    expect(client1State.players[0].cards).toEqual([]);
    expect(client1State.players[2].cards).toEqual([]);

    // Client 2 should see own cards
    const client2State = client2Service.getState();
    expect(client2State.players[2].cards).toHaveLength(2);
    expect(client2State.players[0].cards).toEqual([]);
    expect(client2State.players[1].cards).toEqual([]);

    // Play through to showdown: everyone calls/checks
    let hostState = hostService.getState();
    let iterations = 0;
    while (hostState.phase !== 'showdown' && hostState.phase !== 'roundEnd' && iterations < 50) {
      iterations++;
      const activeSeat = hostState.activePlayer;
      if (activeSeat < 0) break;

      const info = hostService.getActionInfo(activeSeat);
      if (activeSeat === 0) {
        // Host acts directly
        if (info.canCheck) {
          hostService.handleAction(activeSeat, { action: 'check' });
        } else {
          hostService.handleAction(activeSeat, { action: 'call' });
        }
      } else {
        // Client acts via BLE (using client service)
        const clientService = activeSeat === 1 ? client1Service : client2Service;
        if (info.canCheck) {
          clientService.handleAction(activeSeat, { action: 'check' });
        } else {
          clientService.handleAction(activeSeat, { action: 'call' });
        }
      }
      hostState = hostService.getState();
    }

    // Should reach showdown or roundEnd
    expect(['showdown', 'roundEnd']).toContain(hostState.phase);

    if (hostState.phase === 'showdown') {
      const result = hostService.resolveShowdown();
      expect(result.winners.length).toBeGreaterThan(0);

      // Clients should have received showdownResult
      const client1Result = client1Service.resolveShowdown();
      expect(client1Result.winners.length).toBeGreaterThan(0);
    }
  });

  it('client disconnect → freeze → timeout → auto-fold', () => {
    jest.useFakeTimers();

    hostService.startGame(['Host', 'Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
    hostService.startRound();

    // Disconnect client-1
    hostTransport.simulateClientDisconnected('client-1');

    // Advance 30 seconds
    jest.advanceTimersByTime(30_000);

    // After timeout, auto-fold should have triggered for player at seat 1
    const hostState = hostService.getState();
    const player1 = hostState.players.find(p => p.seat === 1);
    // Player 1 should be folded after 30s timeout auto-fold
    expect(player1!.status).toBe('folded');

    jest.useRealTimers();
  });

  it('multiple rounds work correctly', () => {
    hostService.startGame(['Host', 'Alice'], { sb: 5, bb: 10 }, 1000);

    // Round 1: one player folds
    hostService.startRound();
    let state = hostService.getState();
    const activeSeat = state.activePlayer;
    hostService.handleAction(activeSeat, { action: 'fold' });

    // Prepare and start round 2
    hostService.prepareNextRound();
    state = hostService.getState();
    if (state.phase !== 'gameOver') {
      hostService.startRound();
      state = hostService.getState();
      expect(state.phase).toBe('preflop');

      // Client should be synced
      const clientState = client1Service.getState();
      expect(clientState.phase).toBe('preflop');
    }
  });
});
