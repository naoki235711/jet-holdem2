export type SlotName = 'TL' | 'TC' | 'TR' | 'LT' | 'LB' | 'RT' | 'RB' | 'BL' | 'BC' | 'BR';
export type SlotMap = Partial<Record<SlotName, number>>;

const SLOTS_BY_COUNT: Record<number, SlotName[]> = {
  2: ['BC', 'TC'],
  3: ['BC', 'BL', 'TR'],
  4: ['BC', 'BL', 'TC', 'TR'],
  5: ['BC', 'BL', 'LT', 'TC', 'TR'],
  6: ['BC', 'BL', 'LT', 'TC', 'TR', 'RB'],
  7: ['BC', 'BL', 'LT', 'TC', 'TR', 'RT', 'BR'],
  8: ['BC', 'BL', 'LB', 'LT', 'TC', 'TR', 'RT', 'BR'],
  9: ['BC', 'BL', 'LB', 'LT', 'TC', 'TR', 'RT', 'RB', 'BR'],
};

export function getTableSlots(allSeats: number[], myIdx: number): SlotMap {
  const playerCount = allSeats.length;
  const slots = SLOTS_BY_COUNT[playerCount];
  if (!slots) return {};

  let anchorIdx = myIdx;
  if (anchorIdx === -1) {
    const seatZeroPos = allSeats.indexOf(0);
    anchorIdx = seatZeroPos !== -1 ? seatZeroPos : 0;
  }

  const result: SlotMap = {};
  for (let i = 0; i < playerCount; i++) {
    result[slots[i]] = allSeats[(anchorIdx + i) % playerCount];
  }
  return result;
}
