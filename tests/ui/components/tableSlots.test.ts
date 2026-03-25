import { getTableSlots } from '../../../src/components/table/tableSlots';

describe('getTableSlots', () => {
  describe('2 players', () => {
    it('myIdx=0: viewer at BC, opponent at TC', () => {
      const slots = getTableSlots([10, 20], 0);
      expect(slots.BC).toBe(10);
      expect(slots.TC).toBe(20);
    });

    it('myIdx=1: viewer at BC, opponent at TC', () => {
      const slots = getTableSlots([10, 20], 1);
      expect(slots.BC).toBe(20);
      expect(slots.TC).toBe(10);
    });
  });

  describe('3 players', () => {
    it('myIdx=0: BC=0, BL=1, TR=2', () => {
      const slots = getTableSlots([0, 1, 2], 0);
      expect(slots).toMatchObject({ BC: 0, BL: 1, TR: 2 });
    });

    it('myIdx=2: BC=2, BL=0, TR=1', () => {
      const slots = getTableSlots([0, 1, 2], 2);
      expect(slots).toMatchObject({ BC: 2, BL: 0, TR: 1 });
    });
  });

  describe('4 players', () => {
    it('myIdx=0: BC=0, BL=1, TC=2, TR=3', () => {
      const slots = getTableSlots([0, 1, 2, 3], 0);
      expect(slots).toMatchObject({ BC: 0, BL: 1, TC: 2, TR: 3 });
    });

    it('myIdx=2: BC=2, BL=3, TC=0, TR=1', () => {
      const slots = getTableSlots([0, 1, 2, 3], 2);
      expect(slots).toMatchObject({ BC: 2, BL: 3, TC: 0, TR: 1 });
    });
  });

  describe('5 players', () => {
    it('myIdx=0: 5 slots assigned', () => {
      const slots = getTableSlots([0, 1, 2, 3, 4], 0);
      expect(slots).toMatchObject({ BC: 0, BL: 1, LT: 2, TC: 3, TR: 4 });
    });
  });

  describe('6 players', () => {
    it('myIdx=0: 6 slots assigned', () => {
      const slots = getTableSlots([0, 1, 2, 3, 4, 5], 0);
      expect(slots).toMatchObject({ BC: 0, BL: 1, LT: 2, TC: 3, TR: 4, RB: 5 });
    });
  });

  describe('7 players', () => {
    it('myIdx=0: 7 slots assigned', () => {
      const slots = getTableSlots([0, 1, 2, 3, 4, 5, 6], 0);
      expect(slots).toMatchObject({ BC: 0, BL: 1, LT: 2, TC: 3, TR: 4, RT: 5, BR: 6 });
    });
  });

  describe('8 players', () => {
    it('myIdx=0: 8 slots assigned', () => {
      const slots = getTableSlots([0, 1, 2, 3, 4, 5, 6, 7], 0);
      expect(slots).toMatchObject({ BC: 0, BL: 1, LB: 2, LT: 3, TC: 4, TR: 5, RT: 6, BR: 7 });
    });
  });

  describe('9 players', () => {
    it('myIdx=0: all 9 slots assigned', () => {
      const slots = getTableSlots([0, 1, 2, 3, 4, 5, 6, 7, 8], 0);
      expect(slots).toMatchObject({
        BC: 0, BL: 1, LB: 2, LT: 3, TC: 4, TR: 5, RT: 6, RB: 7, BR: 8,
      });
    });

    it('myIdx=5: offsets wrap correctly', () => {
      const slots = getTableSlots([0, 1, 2, 3, 4, 5, 6, 7, 8], 5);
      expect(slots.BC).toBe(5);
      expect(slots.BL).toBe(6);
      expect(slots.LB).toBe(7);
      expect(slots.TC).toBe(0);
    });
  });

  describe('spectator fallback (myIdx === -1)', () => {
    it('anchors to the index of seat 0 in allSeats', () => {
      // seat 0 is at array position 2
      const slots = getTableSlots([3, 4, 0, 1, 2], -1);
      expect(slots.BC).toBe(0);
      expect(slots.BL).toBe(1);
      expect(slots.LT).toBe(2);
    });

    it('falls back to index 0 when seat 0 is not in allSeats', () => {
      const slots = getTableSlots([5, 6, 7], -1);
      expect(slots.BC).toBe(5);
    });
  });

  describe('slot count matches player count', () => {
    it('returns exactly N entries for N players', () => {
      for (let n = 2; n <= 9; n++) {
        const seats = Array.from({ length: n }, (_, i) => i);
        const slots = getTableSlots(seats, 0);
        expect(Object.keys(slots)).toHaveLength(n);
      }
    });
  });
});
