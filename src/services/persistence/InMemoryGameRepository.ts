import { GameRecord, GameSettings } from './types';
import { GameRepository } from './GameRepository';

export class InMemoryGameRepository implements GameRepository {
  private chips = new Map<string, number>();
  private history: GameRecord[] = [];
  private settings: GameSettings | null = null;

  async getPlayerChips(playerName: string): Promise<number | null> {
    return this.chips.get(playerName) ?? null;
  }

  async savePlayerChips(playerName: string, chips: number): Promise<void> {
    this.chips.set(playerName, chips);
  }

  async saveGameRecord(record: GameRecord): Promise<void> {
    this.history.push(record);
  }

  async getGameHistory(): Promise<GameRecord[]> {
    return [...this.history];
  }

  async getSettings(): Promise<GameSettings | null> {
    return this.settings;
  }

  async saveSettings(settings: GameSettings): Promise<void> {
    this.settings = settings;
  }
}
