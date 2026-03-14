import { useContext } from 'react';
import { GameContext, GameContextValue } from '../contexts/GameContext';

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return ctx;
}
