declare module 'react-native-multi-ble-peripheral' {
  interface WriteEvent {
    requestId: string;
    deviceId: string;
    characteristicId: string;
    data: number[];
  }

  const Peripheral: {
    addService(serviceUuid: string): Promise<void>;
    addCharacteristic(
      serviceUuid: string,
      characteristicUuid: string,
      permissions: number,
    ): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    sendNotification(
      serviceUuid: string,
      characteristicUuid: string,
      data: number[],
      deviceId?: string,
    ): Promise<void>;
    onWrite(callback: (event: WriteEvent) => void): void;
  };

  export default Peripheral;
}
