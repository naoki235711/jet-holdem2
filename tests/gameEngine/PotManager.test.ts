import { PotManager } from '../../src/gameEngine/PotManager';

describe('PotManager', () => {
  let pm: PotManager;

  beforeEach(() => {
    pm = new PotManager();
  });

  describe('simple pot (no all-in)', () => {
    it('collects bets into main pot', () => {
      // 4 players each bet 100
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: false },
        { seat: 1, amount: 100, isAllIn: false },
        { seat: 2, amount: 100, isAllIn: false },
        { seat: 3, amount: 100, isAllIn: false },
      ]);

      const pots = pm.getPots();
      expect(pots).toHaveLength(1);
      expect(pots[0].amount).toBe(400);
      expect(pots[0].eligible).toEqual([0, 1, 2, 3]);
    });

    it('accumulates across multiple betting rounds', () => {
      pm.collectBets([
        { seat: 0, amount: 50, isAllIn: false },
        { seat: 1, amount: 50, isAllIn: false },
      ]);
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: false },
        { seat: 1, amount: 100, isAllIn: false },
      ]);

      const pots = pm.getPots();
      expect(pots).toHaveLength(1);
      expect(pots[0].amount).toBe(300);
    });
  });

  describe('side pots', () => {
    it('creates side pot when one player is all-in for less', () => {
      // Player 0 all-in for 100, Players 1,2 bet 300
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: true },
        { seat: 1, amount: 300, isAllIn: false },
        { seat: 2, amount: 300, isAllIn: false },
      ]);

      const pots = pm.getPots();
      expect(pots).toHaveLength(2);
      // Main pot: 100 * 3 = 300 (all three eligible)
      expect(pots[0].amount).toBe(300);
      expect(pots[0].eligible).toEqual([0, 1, 2]);
      // Side pot: 200 * 2 = 400 (only 1 and 2)
      expect(pots[1].amount).toBe(400);
      expect(pots[1].eligible).toEqual([1, 2]);
    });

    it('handles three-way all-in at different amounts', () => {
      // Player A (100), B (300), C (500) all-in
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: true },
        { seat: 1, amount: 300, isAllIn: true },
        { seat: 2, amount: 500, isAllIn: true },
      ]);

      const pots = pm.getPots();
      expect(pots).toHaveLength(3);
      // Main: 100 * 3 = 300
      expect(pots[0].amount).toBe(300);
      expect(pots[0].eligible).toEqual([0, 1, 2]);
      // Side 1: 200 * 2 = 400
      expect(pots[1].amount).toBe(400);
      expect(pots[1].eligible).toEqual([1, 2]);
      // Side 2: 200 * 1 = 200 (returned to C)
      expect(pots[2].amount).toBe(200);
      expect(pots[2].eligible).toEqual([2]);
    });

    it('handles 4-player with 2 all-ins at same amount', () => {
      pm.collectBets([
        { seat: 0, amount: 200, isAllIn: true },
        { seat: 1, amount: 200, isAllIn: true },
        { seat: 2, amount: 500, isAllIn: false },
        { seat: 3, amount: 500, isAllIn: false },
      ]);

      const pots = pm.getPots();
      expect(pots).toHaveLength(2);
      // Main: 200 * 4 = 800
      expect(pots[0].amount).toBe(800);
      expect(pots[0].eligible).toEqual([0, 1, 2, 3]);
      // Side: 300 * 2 = 600
      expect(pots[1].amount).toBe(600);
      expect(pots[1].eligible).toEqual([2, 3]);
    });
  });

  describe('folded players', () => {
    it('folded players are not eligible for pots', () => {
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: false },
        { seat: 1, amount: 50, isAllIn: false },  // will fold
        { seat: 2, amount: 100, isAllIn: false },
      ]);
      pm.removeFoldedPlayer(1);

      const pots = pm.getPots();
      expect(pots).toHaveLength(1);
      expect(pots[0].amount).toBe(250);
      expect(pots[0].eligible).toEqual([0, 2]);
    });
  });

  describe('reset', () => {
    it('clears all pots', () => {
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: false },
        { seat: 1, amount: 100, isAllIn: false },
      ]);
      pm.reset();
      expect(pm.getPots()).toHaveLength(0);
      expect(pm.getTotal()).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('collectBets with empty array does nothing', () => {
      pm.collectBets([]);
      expect(pm.getPots()).toHaveLength(0);
      expect(pm.getTotal()).toBe(0);
    });

    it('handles duplicate all-in amounts (same boundary twice)', () => {
      // Two players all-in for the same amount — boundary de-duplicated
      pm.collectBets([
        { seat: 0, amount: 200, isAllIn: true },
        { seat: 1, amount: 200, isAllIn: true },
        { seat: 2, amount: 200, isAllIn: false },
      ]);
      const pots = pm.getPots();
      // Single pot of 600, all eligible
      expect(pots).toHaveLength(1);
      expect(pots[0].amount).toBe(600);
      expect(pots[0].eligible).toEqual([0, 1, 2]);
    });
  });

  describe('getTotal', () => {
    it('returns sum of all pots', () => {
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: true },
        { seat: 1, amount: 300, isAllIn: false },
        { seat: 2, amount: 300, isAllIn: false },
      ]);
      expect(pm.getTotal()).toBe(700);
    });
  });
});
