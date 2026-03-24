import { BleHostGameService } from '../../../src/services/ble/BleHostGameService';
import { BleClientGameService } from '../../../src/services/ble/BleClientGameService';
import { BleSpectatorGameService } from '../../../src/services/ble/BleSpectatorGameService';
import {
  MockBleHostTransport,
  MockBleClientTransport,
  MockBleNetwork,
} from '../../../src/services/ble/MockBleTransport';

describe('BleSpectatorFlow integration', () => {
  let hostTransport: MockBleHostTransport;
  let clientTransport: MockBleClientTransport;
  let spectatorTransport: MockBleClientTransport;
  let lateSpectatorTransport: MockBleClientTransport;
  let hostService: BleHostGameService;
  let clientService: BleClientGameService;
  let spectatorService: BleSpectatorGameService;

  beforeEach(() => {
    hostTransport = new MockBleHostTransport();
    clientTransport = new MockBleClientTransport();
    spectatorTransport = new MockBleClientTransport();
    lateSpectatorTransport = new MockBleClientTransport();

    // IDs: clientTransport='client-1', spectatorTransport='client-2', lateSpectatorTransport='client-3'
    MockBleNetwork.create(hostTransport, [clientTransport, spectatorTransport, lateSpectatorTransport]);

    const clientSeatMap = new Map<string, number>([['client-1', 1]]);
    // client-2 is a spectator from the start
    hostService = new BleHostGameService(hostTransport, clientSeatMap, ['client-2']);
    clientService = new BleClientGameService(clientTransport, 1);
    spectatorService = new BleSpectatorGameService(spectatorTransport);
  });

  it('spectator receives stateUpdate after host starts game', () => {
    hostService.startGame(['Host', 'Alice'], { sb: 5, bb: 10 }, 1000);
    hostService.startRound();

    const state = spectatorService.getState();
    expect(state.phase).toBe('preflop');
    expect(state.players).toHaveLength(2);
    // All cards stripped — spectator never sees hole cards
    state.players.forEach(p => expect(p.cards).toEqual([]));
  });

  it('spectator receives showdownResult — resolveShowdown returns hand info', () => {
    hostService.startGame(['Host', 'Alice'], { sb: 5, bb: 10 }, 1000);
    hostService.startRound();

    // Play to showdown: check/call all streets
    let state = hostService.getState();
    let iterations = 0;
    while (state.phase !== 'showdown' && state.phase !== 'roundEnd' && iterations < 50) {
      iterations++;
      const seat = state.activePlayer;
      const info = hostService.getActionInfo(seat);
      hostService.handleAction(seat, info.canCheck ? { action: 'check' } : { action: 'call' });
      state = hostService.getState();
    }
    if (state.phase === 'showdown') {
      hostService.resolveShowdown();
    }

    const result = spectatorService.resolveShowdown();
    expect(result.winners.length).toBeGreaterThan(0);
    expect(result.hands.length).toBeGreaterThan(0);
  });

  it('spectator handleAction returns {valid: false} and sends nothing', () => {
    hostService.startGame(['Host', 'Alice'], { sb: 5, bb: 10 }, 1000);
    hostService.startRound();

    const msgsBefore = spectatorTransport.sentMessages.length;
    const result = spectatorService.handleAction(0, { action: 'fold' });
    expect(result.valid).toBe(false);
    expect(spectatorTransport.sentMessages.length).toBe(msgsBefore); // nothing sent
  });

  it('mid-game addSpectator: new spectator (client-3) receives current stateUpdate', () => {
    hostService.startGame(['Host', 'Alice'], { sb: 5, bb: 10 }, 1000);
    hostService.startRound();
    // Play one action so phase is still preflop but seq > 1
    hostService.handleAction(hostService.getState().activePlayer, { action: 'call' });

    // Create the spectator service before addSpectator so its message handler is registered
    const lateSpectator = new BleSpectatorGameService(lateSpectatorTransport);

    // Add late spectator mid-game — they were connected but not yet a spectator
    hostService.addSpectator('client-3');

    const state = lateSpectator.getState();
    expect(state.phase).toBe('preflop');
  });
});
