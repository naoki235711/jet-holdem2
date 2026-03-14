let store: Map<string, string>;

jest.mock('@react-native-async-storage/async-storage', () => {
  store = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItem: jest.fn((key: string, val: string) => {
      store.set(key, val);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

import { AsyncStorageGameRepository } from '../../src/services/persistence/AsyncStorageGameRepository';
import { GameRecord, GameSettings } from '../../src/services/persistence/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('AsyncStorageGameRepository', () => {
  let repo: AsyncStorageGameRepository;

  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
    repo = new AsyncStorageGameRepository();
  });

  describe('getPlayerChips / savePlayerChips', () => {
    it('returns null for unknown player', async () => {
      expect(await repo.getPlayerChips('Alice')).toBeNull();
    });

    it('saves and retrieves chips', async () => {
      await repo.savePlayerChips('Alice', 1500);
      expect(await repo.getPlayerChips('Alice')).toBe(1500);
    });

    it('uses correct storage key with prefix', async () => {
      await repo.savePlayerChips('Alice', 1500);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@jetholdem:chips:Alice', '1500');
    });

    it('overwrites previous chips', async () => {
      await repo.savePlayerChips('Alice', 1500);
      await repo.savePlayerChips('Alice', 800);
      expect(await repo.getPlayerChips('Alice')).toBe(800);
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

    it('uses correct storage key', async () => {
      await repo.saveGameRecord(record);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@jetholdem:history',
        expect.any(String),
      );
    });

    it('limits history to 50 records', async () => {
      // Pre-fill with 50 records
      const existing = Array.from({ length: 50 }, (_, i) => ({
        ...record,
        date: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      }));
      store.set('@jetholdem:history', JSON.stringify(existing));

      // Add one more
      const newRecord = { ...record, date: '2026-03-15T12:00:00.000Z' };
      await repo.saveGameRecord(newRecord);

      const history = await repo.getGameHistory();
      expect(history).toHaveLength(50);
      // Oldest record should be dropped, newest should be last
      expect(history[0].date).toBe('2026-01-02T00:00:00.000Z');
      expect(history[49].date).toBe('2026-03-15T12:00:00.000Z');
    });

    it('returns empty array on corrupted JSON', async () => {
      store.set('@jetholdem:history', 'not-json');
      expect(await repo.getGameHistory()).toEqual([]);
    });
  });

  describe('getSettings / saveSettings', () => {
    const settings: GameSettings = {
      initialChips: 1000,
      sb: 5,
      bb: 10,
      playerNames: ['Alice', 'Bob'],
    };

    it('returns null initially', async () => {
      expect(await repo.getSettings()).toBeNull();
    });

    it('stores and retrieves settings', async () => {
      await repo.saveSettings(settings);
      expect(await repo.getSettings()).toEqual(settings);
    });

    it('uses correct storage key', async () => {
      await repo.saveSettings(settings);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@jetholdem:settings',
        JSON.stringify(settings),
      );
    });

    it('returns null on corrupted JSON', async () => {
      store.set('@jetholdem:settings', 'not-json');
      expect(await repo.getSettings()).toBeNull();
    });
  });
});
