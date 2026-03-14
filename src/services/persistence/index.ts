export type { GameRecord, GameSettings } from './types';
export type { GameRepository } from './GameRepository';
export { InMemoryGameRepository } from './InMemoryGameRepository';
export { AsyncStorageGameRepository } from './AsyncStorageGameRepository';

import { AsyncStorageGameRepository } from './AsyncStorageGameRepository';
export const repository = new AsyncStorageGameRepository();
