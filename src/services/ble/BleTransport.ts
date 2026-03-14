/**
 * Role-specific BLE transport interfaces.
 * Split into Host (Peripheral) and Client (Central) to avoid
 * the overloaded onMessageReceived ambiguity.
 * LobbyHost/LobbyClient depend on these abstractions, not on mock classes.
 */

export interface BleHostTransport {
  startAdvertising(serviceName: string): Promise<void>;
  stopAdvertising(): Promise<void>;
  onClientConnected(callback: (clientId: string) => void): void;
  onClientDisconnected(callback: (clientId: string) => void): void;
  onMessageReceived(
    callback: (clientId: string, characteristicId: string, data: Uint8Array) => void,
  ): void;
  sendToClient(clientId: string, characteristicId: string, data: Uint8Array): Promise<void>;
  sendToAll(characteristicId: string, data: Uint8Array): Promise<void>;
}

export interface BleClientTransport {
  startScanning(serviceUuid: string): Promise<void>;
  stopScanning(): Promise<void>;
  onHostDiscovered(callback: (hostId: string, hostName: string) => void): void;
  connectToHost(hostId: string): Promise<void>;
  disconnect(): Promise<void>;
  onMessageReceived(callback: (characteristicId: string, data: Uint8Array) => void): void;
  sendToHost(characteristicId: string, data: Uint8Array): Promise<void>;
}
