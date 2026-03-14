import { BleHostTransport, BleClientTransport } from './BleTransport';

export class MockBleHostTransport implements BleHostTransport {
  sentMessages: { clientId: string; characteristicId: string; data: Uint8Array }[] = [];

  private _onClientConnected: ((clientId: string) => void) | null = null;
  private _onClientDisconnected: ((clientId: string) => void) | null = null;
  private _onMessageReceived:
    | ((clientId: string, characteristicId: string, data: Uint8Array) => void)
    | null = null;

  // --- Send methods (record + optional network routing) ---
  _sendHook:
    | ((clientId: string, characteristicId: string, data: Uint8Array) => void)
    | null = null;
  _sendAllHook:
    | ((characteristicId: string, data: Uint8Array) => void)
    | null = null;

  async startAdvertising(_serviceName: string): Promise<void> {}
  async stopAdvertising(): Promise<void> {}

  onClientConnected(callback: (clientId: string) => void): void {
    this._onClientConnected = callback;
  }

  onClientDisconnected(callback: (clientId: string) => void): void {
    this._onClientDisconnected = callback;
  }

  onMessageReceived(
    callback: (clientId: string, characteristicId: string, data: Uint8Array) => void,
  ): void {
    this._onMessageReceived = callback;
  }

  async sendToClient(
    clientId: string,
    characteristicId: string,
    data: Uint8Array,
  ): Promise<void> {
    this.sentMessages.push({ clientId, characteristicId, data });
    this._sendHook?.(clientId, characteristicId, data);
  }

  async sendToAll(characteristicId: string, data: Uint8Array): Promise<void> {
    this.sentMessages.push({ clientId: '__all__', characteristicId, data });
    this._sendAllHook?.(characteristicId, data);
  }

  // --- Test helpers ---
  simulateClientConnected(clientId: string): void {
    this._onClientConnected?.(clientId);
  }

  simulateClientDisconnected(clientId: string): void {
    this._onClientDisconnected?.(clientId);
  }

  simulateMessageReceived(
    clientId: string,
    characteristicId: string,
    data: Uint8Array,
  ): void {
    this._onMessageReceived?.(clientId, characteristicId, data);
  }
}

export class MockBleClientTransport implements BleClientTransport {
  sentMessages: { characteristicId: string; data: Uint8Array }[] = [];

  private _onHostDiscovered: ((hostId: string, hostName: string) => void) | null = null;
  private _onMessageReceived:
    | ((characteristicId: string, data: Uint8Array) => void)
    | null = null;

  _sendHook: ((characteristicId: string, data: Uint8Array) => void) | null = null;

  async startScanning(_serviceUuid: string): Promise<void> {}
  async stopScanning(): Promise<void> {}
  onHostDiscovered(callback: (hostId: string, hostName: string) => void): void {
    this._onHostDiscovered = callback;
  }
  async connectToHost(_hostId: string): Promise<void> {}
  async disconnect(): Promise<void> {}

  onMessageReceived(callback: (characteristicId: string, data: Uint8Array) => void): void {
    this._onMessageReceived = callback;
  }

  async sendToHost(characteristicId: string, data: Uint8Array): Promise<void> {
    this.sentMessages.push({ characteristicId, data });
    this._sendHook?.(characteristicId, data);
  }

  // --- Test helpers ---
  simulateHostDiscovered(hostId: string, hostName: string): void {
    this._onHostDiscovered?.(hostId, hostName);
  }

  simulateMessageReceived(characteristicId: string, data: Uint8Array): void {
    this._onMessageReceived?.(characteristicId, data);
  }
}

/**
 * Connects mock transports so that:
 *  - host.sendToClient(clientId, ...) → matching client.onMessageReceived(...)
 *  - host.sendToAll(...) → all clients.onMessageReceived(...)
 *  - client.sendToHost(...) → host.onMessageReceived(clientId, ...)
 *
 * Client IDs are assigned as "client-1", "client-2", etc.
 */
export class MockBleNetwork {
  static create(
    host: MockBleHostTransport,
    clients: MockBleClientTransport[],
  ): void {
    const clientMap = new Map<string, MockBleClientTransport>();
    clients.forEach((client, index) => {
      const clientId = `client-${index + 1}`;
      clientMap.set(clientId, client);

      // Wire client → host
      client._sendHook = (characteristicId, data) => {
        host.simulateMessageReceived(clientId, characteristicId, data);
      };
    });

    // Wire host → client
    host._sendHook = (clientId, characteristicId, data) => {
      const client = clientMap.get(clientId);
      client?.simulateMessageReceived(characteristicId, data);
    };

    host._sendAllHook = (characteristicId, data) => {
      for (const client of clientMap.values()) {
        client.simulateMessageReceived(characteristicId, data);
      }
    };
  }
}
