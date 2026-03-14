import { LobbyHost } from '../../../src/services/ble/LobbyHost';
import { LobbyClient } from '../../../src/services/ble/LobbyClient';
import {
  MockBleHostTransport,
  MockBleClientTransport,
  MockBleNetwork,
} from '../../../src/services/ble/MockBleTransport';

describe('LobbyFlow integration', () => {
  let hostTransport: MockBleHostTransport;
  let clientTransport1: MockBleClientTransport;
  let clientTransport2: MockBleClientTransport;
  let host: LobbyHost;
  let client1: LobbyClient;
  let client2: LobbyClient;

  beforeEach(() => {
    hostTransport = new MockBleHostTransport();
    clientTransport1 = new MockBleClientTransport();
    clientTransport2 = new MockBleClientTransport();
    MockBleNetwork.create(hostTransport, [clientTransport1, clientTransport2]);

    host = new LobbyHost(hostTransport, 'Host');
    client1 = new LobbyClient(clientTransport1, 'Alice');
    client2 = new LobbyClient(clientTransport2, 'Bob');
  });

  it('full flow: 2 clients join → ready → gameStart', async () => {
    const hostPlayersCb = jest.fn();
    const client1JoinCb = jest.fn();
    const client2JoinCb = jest.fn();
    const client1GameStartCb = jest.fn();
    const client2GameStartCb = jest.fn();
    const hostGameStartCb = jest.fn();

    host.onPlayersChanged(hostPlayersCb);
    host.onGameStart(hostGameStartCb);
    client1.onJoinResult(client1JoinCb);
    client2.onJoinResult(client2JoinCb);
    client1.onGameStart(client1GameStartCb);
    client2.onGameStart(client2GameStartCb);

    // Host starts lobby
    await host.start();

    // Client 1 joins
    hostTransport.simulateClientConnected('client-1');
    await client1.connectToHost('host-1');

    expect(client1JoinCb).toHaveBeenCalledWith({
      accepted: true,
      gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
    });

    // Client 2 joins
    hostTransport.simulateClientConnected('client-2');
    await client2.connectToHost('host-1');

    expect(client2JoinCb).toHaveBeenCalledWith({
      accepted: true,
      gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
    });

    // Both clients are listed on host
    const lastHostPlayers = hostPlayersCb.mock.calls[hostPlayersCb.mock.calls.length - 1][0];
    expect(lastHostPlayers).toHaveLength(3);

    // Both clients set ready
    client1.setReady();
    client2.setReady();

    // Host starts game
    host.startGame();

    expect(hostGameStartCb).toHaveBeenCalledWith({ sb: 5, bb: 10 });
    expect(client1GameStartCb).toHaveBeenCalledWith({ blinds: { sb: 5, bb: 10 }, initialChips: 1000 });
    expect(client2GameStartCb).toHaveBeenCalledWith({ blinds: { sb: 5, bb: 10 }, initialChips: 1000 });
  });

  it('client disconnect mid-lobby: player removed, seat freed', async () => {
    const hostPlayersCb = jest.fn();
    host.onPlayersChanged(hostPlayersCb);

    await host.start();

    // Client 1 joins
    hostTransport.simulateClientConnected('client-1');
    await client1.connectToHost('host-1');

    // Client 1 disconnects
    hostTransport.simulateClientDisconnected('client-1');

    const lastPlayers = hostPlayersCb.mock.calls[hostPlayersCb.mock.calls.length - 1][0];
    expect(lastPlayers).toHaveLength(1); // Only host remains
    expect(lastPlayers[0]).toEqual({ seat: 0, name: 'Host', ready: true });
  });

  it('host stop: all clients receive lobbyClosed', async () => {
    const client1DisconnectCb = jest.fn();
    const client2DisconnectCb = jest.fn();
    client1.onDisconnected(client1DisconnectCb);
    client2.onDisconnected(client2DisconnectCb);

    await host.start();

    hostTransport.simulateClientConnected('client-1');
    await client1.connectToHost('host-1');
    hostTransport.simulateClientConnected('client-2');
    await client2.connectToHost('host-1');

    await host.stop();

    expect(client1DisconnectCb).toHaveBeenCalled();
    expect(client2DisconnectCb).toHaveBeenCalled();
  });
});
