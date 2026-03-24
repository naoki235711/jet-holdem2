import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { useGame } from '../../src/hooks/useGame';
import { GameProvider } from '../../src/contexts/GameContext';
import { createMockService } from '../ui/helpers/renderWithGame';

describe('useGame', () => {
  it('throws when used outside GameProvider', () => {
    expect(() => renderHook(() => useGame())).toThrow(
      'useGame must be used within a GameProvider',
    );
  });

  it('returns context value when used inside GameProvider', () => {
    const service = createMockService();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GameProvider service={service} mode="debug">
        {children}
      </GameProvider>
    );
    const { result } = renderHook(() => useGame(), { wrapper });
    expect(result.current.mode).toBe('debug');
    expect(result.current.service).toBe(service);
  });
});
