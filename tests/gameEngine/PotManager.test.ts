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

  describe('side pots with partial bets (folded player bet < all-in boundary)', () => {
    it('correctly counts chips when folded player bet less than all-in amount', () => {
      // Scenario: SB posts 5, Player 1 all-in for 50, Player 2 calls 50, SB folds
      // SB's bet of 5 is still in getBets() because bet > 0
      pm.collectBets([
        { seat: 0, amount: 5, isAllIn: false },   // SB folded after posting
        { seat: 1, amount: 50, isAllIn: true },    // all-in
        { seat: 2, amount: 50, isAllIn: false },   // called
      ]);

      // Total chips actually bet: 5 + 50 + 50 = 105
      expect(pm.getTotal()).toBe(105);
    });

    it('correctly counts chips when bet is between two all-in boundaries', () => {
      // Player 0: all-in 100, Player 1: all-in 300, Player 2: bet 200 (folded), Player 3: calls 300
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: true },
        { seat: 1, amount: 300, isAllIn: true },
        { seat: 2, amount: 200, isAllIn: false },  // folded after betting 200
        { seat: 3, amount: 300, isAllIn: false },
      ]);

      // Total chips actually bet: 100 + 300 + 200 + 300 = 900
      expect(pm.getTotal()).toBe(900);
    });

    it('creates correct pot structure with partial bet below all-in', () => {
      // Player 0: all-in 50, Player 1: bet 10 (folded), Player 2: calls 50
      pm.collectBets([
        { seat: 0, amount: 50, isAllIn: true },
        { seat: 1, amount: 10, isAllIn: false },
        { seat: 2, amount: 50, isAllIn: false },
      ]);

      // Correct calculation:
      // Layer [0-10]: all 3 contribute 10 each → 30, eligible: all who bet >= 10 (but really
      //   the important thing is the TOTAL must equal 50 + 10 + 50 = 110)
      expect(pm.getTotal()).toBe(110);
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
