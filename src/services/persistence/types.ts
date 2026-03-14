export type GameRecord = {
  date: string;            // ISO 8601 (also serves as unique ID)
  mode: 'hotseat' | 'ble-host' | 'ble-client';
  rounds: number;
  blinds: { sb: number; bb: number };
  initialChips: number;
  results: {
    name: string;
    chipChange: number;    // finalChips - initialChips
    finalChips: number;
  }[];
};

export type GameSettings = {
  initialChips: number;
  sb: number;
  bb: number;
  playerNames: string[];   // Hotseat only; BLE mode ignores this
};
