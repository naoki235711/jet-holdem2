import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameRecord, GameSettings } from './types';
import { GameRepository } from './GameRepository';

const KEYS = {
  playerChips: (name: string) => `@jetholdem:chips:${name}`,
  history: '@jetholdem:history',
  settings: '@jetholdem:settings',
};

export class AsyncStorageGameRepository implements GameRepository {
  async getPlayerChips(playerName: string): Promise<number | null> {
    const val = await AsyncStorage.getItem(KEYS.playerChips(playerName));
    return val !== null ? Number(val) : null;
  }

  async savePlayerChips(playerName: string, chips: number): Promise<void> {
    await AsyncStorage.setItem(KEYS.playerChips(playerName), String(chips));
  }

  async saveGameRecord(record: GameRecord): Promise<void> {
    const existing = await this.getGameHistory();
    existing.push(record);
    const trimmed = existing.slice(-50);
    await AsyncStorage.setItem(KEYS.history, JSON.stringify(trimmed));
  }

  async getGameHistory(): Promise<GameRecord[]> {
    try {
      const val = await AsyncStorage.getItem(KEYS.history);
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  }

  async getSettings(): Promise<GameSettings | null> {
    try {
      const val = await AsyncStorage.getItem(KEYS.settings);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  }

  async saveSettings(settings: GameSettings): Promise<void> {
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings));
  }
}
