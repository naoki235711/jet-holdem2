import { GameRecord, GameSettings } from './types';

export interface GameRepository {
  // Player chips (name-based save/load)
  getPlayerChips(playerName: string): Promise<number | null>;
  savePlayerChips(playerName: string, chips: number): Promise<void>;

  // Game history (chronological: oldest first)
  saveGameRecord(record: GameRecord): Promise<void>;
  getGameHistory(): Promise<GameRecord[]>;

  // Settings
  getSettings(): Promise<GameSettings | null>;
  saveSettings(settings: GameSettings): Promise<void>;
}
