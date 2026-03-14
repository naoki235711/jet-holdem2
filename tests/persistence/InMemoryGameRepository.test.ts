import { InMemoryGameRepository } from '../../src/services/persistence/InMemoryGameRepository';
import { GameRecord, GameSettings } from '../../src/services/persistence/types';

describe('InMemoryGameRepository', () => {
  let repo: InMemoryGameRepository;

  beforeEach(() => {
    repo = new InMemoryGameRepository();
  });

  describe('getPlayerChips / savePlayerChips', () => {
    it('returns null for unknown player', async () => {
      expect(await repo.getPlayerChips('Alice')).toBeNull();
    });

    it('returns saved chips', async () => {
      await repo.savePlayerChips('Alice', 1500);
      expect(await repo.getPlayerChips('Alice')).toBe(1500);
    });

    it('overwrites previous chips', async () => {
      await repo.savePlayerChips('Alice', 1500);
      await repo.savePlayerChips('Alice', 800);
      expect(await repo.getPlayerChips('Alice')).toBe(800);
    });

    it('stores chips independently per player', async () => {
      await repo.savePlayerChips('Alice', 1500);
      await repo.savePlayerChips('Bob', 500);
      expect(await repo.getPlayerChips('Alice')).toBe(1500);
      expect(await repo.getPlayerChips('Bob')).toBe(500);
    });
  });

  describe('saveGameRecord / getGameHistory', () => {
    const record: GameRecord = {
      date: '2026-03-15T10:00:00.000Z',
      mode: 'hotseat',
      rounds: 5,
      blinds: { sb: 5, bb: 10 },
      initialChips: 1000,
      results: [
        { name: 'Alice', chipChange: 200, finalChips: 1200 },
        { name: 'Bob', chipChange: -200, finalChips: 800 },
      ],
    };

    it('returns empty array initially', async () => {
      expect(await repo.getGameHistory()).toEqual([]);
    });

    it('stores and retrieves a game record', async () => {
      await repo.saveGameRecord(record);
      const history = await repo.getGameHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(record);
    });

    it('returns records in insertion order', async () => {
      const record2: GameRecord = { ...record, date: '2026-03-15T11:00:00.000Z', rounds: 3 };
      await repo.saveGameRecord(record);
      await repo.saveGameRecord(record2);
      const history = await repo.getGameHistory();
      expect(history).toHaveLength(2);
      expect(history[0].date).toBe('2026-03-15T10:00:00.000Z');
      expect(history[1].date).toBe('2026-03-15T11:00:00.000Z');
    });

    it('returns a copy (not a reference to internal array)', async () => {
      await repo.saveGameRecord(record);
      const history1 = await repo.getGameHistory();
      history1.push(record);
      const history2 = await repo.getGameHistory();
      expect(history2).toHaveLength(1);
    });
  });

  describe('getSettings / saveSettings', () => {
    const settings: GameSettings = {
      initialChips: 1000,
      sb: 5,
      bb: 10,
      playerNames: ['Alice', 'Bob', 'Charlie'],
    };

    it('returns null initially', async () => {
      expect(await repo.getSettings()).toBeNull();
    });

    it('stores and retrieves settings', async () => {
      await repo.saveSettings(settings);
      expect(await repo.getSettings()).toEqual(settings);
    });

    it('overwrites previous settings', async () => {
      await repo.saveSettings(settings);
      const updated = { ...settings, sb: 10, bb: 20 };
      await repo.saveSettings(updated);
      expect(await repo.getSettings()).toEqual(updated);
    });
  });
});
