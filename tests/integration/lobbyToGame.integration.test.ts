import { LobbyHost } from '../../src/services/ble/LobbyHost';
import { LobbyClient } from '../../src/services/ble/LobbyClient';
import { BleHostGameService } from '../../src/services/ble/BleHostGameService';
import { BleClientGameService } from '../../src/services/ble/BleClientGameService';
import {
  MockBleHostTransport,
  MockBleClientTransport,
  MockBleNetwork,
} from '../../src/services/ble/MockBleTransport';

function setupLobby(gameSettings = { sb: 5, bb: 10, initialChips: 1000 }) {
  const hostTransport = new MockBleHostTransport();
  const clientTransports = [
    new MockBleClientTransport(),
    new MockBleClientTransport(),
    new MockBleClientTransport(),
  ];
  MockBleNetwork.create(hostTransport, clientTransports);

  const lobbyHost = new LobbyHost(hostTransport, 'Host', gameSettings);
  const lobbyClients = [
    new LobbyClient(clientTransports[0], 'Player2'),
    new LobbyClient(clientTransports[1], 'Player3'),
    new LobbyClient(clientTransports[2], 'Player4'),
  ];

  return { hostTransport, clientTransports, lobbyHost, lobbyClients, gameSettings };
}

async function joinAndReady(
  lobbyHost: LobbyHost,
  lobbyClients: LobbyClient[],
  hostTransport: MockBleHostTransport,
  count: number,
): Promise<void> {
  await lobbyHost.start();

  for (let i = 0; i < count; i++) {
    // Simulate client connecting
    hostTransport.simulateClientConnected(`client-${i + 1}`);
    await lobbyClients[i].connectToHost(`host-1`);
  }

  // Set all clients ready (MockBleNetwork routes messages synchronously)
  for (let i = 0; i < count; i++) {
    lobbyClients[i].setReady();
  }
}

describe('BLE Lobby → Game Transition', () => {
  // LG-1
  it('lobby settings propagate to game initialization', async () => {
    const { hostTransport, lobbyHost, lobbyClients, gameSettings } = setupLobby();

    let receivedBlinds: { sb: number; bb: number } | null = null;
    lobbyHost.onGameStart((blinds) => { receivedBlinds = blinds; });

    await joinAndReady(lobbyHost, lobbyClients, hostTransport, 2);
    lobbyHost.startGame();

    expect(receivedBlinds).toEqual({ sb: 5, bb: 10 });

    // Initialize BleHostGameService with lobby data
    const clientSeatMap = lobbyHost.getClientSeatMap();
    const hostService = new BleHostGameService(hostTransport, clientSeatMap);

    // Get player names from lobby (host + clients)
    const playerNames = ['Host', 'Player2', 'Player3'];
    hostService.startGame(playerNames, receivedBlinds!, gameSettings.initialChips);

    const state = hostService.getState();
    expect(state.blinds).toEqual({ sb: 5, bb: 10 });
    expect(state.players).toHaveLength(3);
    // Host sees own chips, clients' cards are hidden
    expect(state.players[0].chips).toBe(1000);
  });

  // LG-2
  it('lobby participants become game players with correct seats', async () => {
    const { hostTransport, lobbyHost, lobbyClients, gameSettings } = setupLobby();

    await joinAndReady(lobbyHost, lobbyClients, hostTransport, 3);

    const clientSeatMap = lobbyHost.getClientSeatMap();
    expect(clientSeatMap.size).toBe(3);

    lobbyHost.startGame();

    const hostService = new BleHostGameService(hostTransport, clientSeatMap);
    const playerNames = ['Host', 'Player2', 'Player3', 'Player4'];
    hostService.startGame(playerNames, { sb: 5, bb: 10 }, gameSettings.initialChips);

    const state = hostService.getState();
    expect(state.players).toHaveLength(4);
    expect(state.players[0].name).toBe('Host');
    expect(state.players[0].seat).toBe(0);
    expect(state.players[1].name).toBe('Player2');
    expect(state.players[1].seat).toBe(1);
  });

  // LG-3
  it('lobby → game → first round starts, clients receive state', async () => {
    const { hostTransport, clientTransports, lobbyHost, lobbyClients, gameSettings } = setupLobby();

    await joinAndReady(lobbyHost, lobbyClients, hostTransport, 2);

    const clientSeatMap = lobbyHost.getClientSeatMap();
    lobbyHost.startGame();

    // Create host game service
    const hostService = new BleHostGameService(hostTransport, clientSeatMap);
    hostService.startGame(['Host', 'Player2', 'Player3'], { sb: 5, bb: 10 }, gameSettings.initialChips);

    // Create client game services
    const clientService1 = new BleClientGameService(clientTransports[0], 1);
    const clientService2 = new BleClientGameService(clientTransports[1], 2);

    // Start round — triggers broadcastState + sendPrivateHands
    hostService.startRound();

    // Clients should now have game state
    const clientState1 = clientService1.getState();
    expect(clientState1.phase).toBe('preflop');
    expect(clientState1.players).toHaveLength(3);

    // Client 1 (seat 1) sees own cards
    const client1Self = clientState1.players.find(p => p.seat === 1)!;
    expect(client1Self.cards).toHaveLength(2);

    // Client 1 does NOT see client 2's cards
    const client1SeesOther = clientState1.players.find(p => p.seat === 2)!;
    expect(client1SeesOther.cards).toHaveLength(0);

    // Client 2 (seat 2) sees own cards
    const clientState2 = clientService2.getState();
    const client2Self = clientState2.players.find(p => p.seat === 2)!;
    expect(client2Self.cards).toHaveLength(2);
  });

  // LG-4
  it('modified lobby settings reflected in game', async () => {
    const customSettings = { sb: 10, bb: 20, initialChips: 2000 };
    const { hostTransport, lobbyHost, lobbyClients } = setupLobby(customSettings);

    // Verify client receives settings
    let clientSettings: { sb: number; bb: number; initialChips: number } | null = null;
    lobbyClients[0].onGameStart((config) => {
      clientSettings = { sb: config.blinds.sb, bb: config.blinds.bb, initialChips: config.initialChips };
    });

    await joinAndReady(lobbyHost, lobbyClients, hostTransport, 1);
    lobbyHost.startGame();

    expect(clientSettings).toEqual({ sb: 10, bb: 20, initialChips: 2000 });

    // Create game with custom settings
    const clientSeatMap = lobbyHost.getClientSeatMap();
    const hostService = new BleHostGameService(hostTransport, clientSeatMap);
    hostService.startGame(['Host', 'Player2'], { sb: 10, bb: 20 }, 2000);

    const state = hostService.getState();
    expect(state.blinds).toEqual({ sb: 10, bb: 20 });
    expect(state.players[0].chips).toBe(2000);
  });
});
