import { useEffect, useRef } from 'react';
import { GameState, Phase } from '../gameEngine';
import { GameService } from '../services/GameService';
import { GameRepository } from '../services/persistence/GameRepository';
import { GameRecord } from '../services/persistence/types';

export type PersistenceConfig = {
  mode: 'hotseat' | 'ble-host' | 'ble-client';
  initialChips: number;
  blinds: { sb: number; bb: number };
};

/**
 * Core persistence logic extracted for testability without React.
 * Subscribes to a GameService and saves data to the repository on phase transitions.
 * Returns an unsubscribe function.
 */
export function subscribePersistence(
  service: GameService,
  repository: GameRepository | null,
  config: PersistenceConfig,
): () => void {
  if (!repository) return () => {};

  let prevPhase: Phase | null = null;
  let roundCount = 0;

  const unsub = service.subscribe((state: GameState) => {
    const currentPhase = state.phase;

    // Round end: save all player chips
    if (currentPhase === 'roundEnd' && prevPhase !== 'roundEnd') {
      roundCount++;
      for (const player of state.players) {
        repository.savePlayerChips(player.name, player.chips);
      }
    }

    // Game over: save game record
    if (currentPhase === 'gameOver' && prevPhase !== 'gameOver') {
      const record: GameRecord = {
        date: new Date().toISOString(),
        mode: config.mode,
        rounds: roundCount,
        blinds: config.blinds,
        initialChips: config.initialChips,
        results: state.players.map(p => ({
          name: p.name,
          chipChange: p.chips - config.initialChips,
          finalChips: p.chips,
        })),
      };
      repository.saveGameRecord(record);
    }

    prevPhase = currentPhase;
  });

  return unsub;
}

/**
 * React hook wrapper around subscribePersistence.
 * Call unconditionally (React Rules of Hooks). Pass repository=null to disable.
 */
export function usePersistence(
  service: GameService,
  repository: GameRepository | null,
  config: PersistenceConfig,
): void {
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    return subscribePersistence(service, repository, configRef.current);
  }, [service, repository]);
}
