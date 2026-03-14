import { subscribePersistence, PersistenceConfig } from '../../src/hooks/usePersistence';
import { InMemoryGameRepository } from '../../src/services/persistence/InMemoryGameRepository';
import { GameRepository } from '../../src/services/persistence/GameRepository';
import { GameState, Phase, Player, PlayerStatus, Blinds } from '../../src/gameEngine';

// Minimal mock GameService — only subscribe() is needed by usePersistence
function createMockService() {
  let listener: ((state: GameState) => void) | null = null;
  return {
    subscribe: jest.fn((fn: (state: GameState) => void) => {
      listener = fn;
      return () => { listener = null; };
    }),
    emit(state: GameState) {
      listener?.(state);
    },
    // Stubs to satisfy GameService interface
    getState: jest.fn(),
    getActionInfo: jest.fn(),
    startGame: jest.fn(),
    startRound: jest.fn(),
    handleAction: jest.fn(),
    resolveShowdown: jest.fn(),
    prepareNextRound: jest.fn(),
  };
}

function makeState(phase: Phase, players?: Partial<Player>[]): GameState {
  const defaultPlayers: Player[] = [
    { seat: 0, name: 'Alice', chips: 1000, status: 'active' as PlayerStatus, bet: 0, cards: [] },
    { seat: 1, name: 'Bob', chips: 1000, status: 'active' as PlayerStatus, bet: 0, cards: [] },
  ];
  const mergedPlayers = players
    ? defaultPlayers.map((p, i) => ({ ...p, ...players[i] }))
    : defaultPlayers;

  return {
    seq: 1,
    phase,
    community: [],
    pots: [{ amount: 0, eligible: [0, 1] }],
    currentBet: 0,
    activePlayer: 0,
    dealer: 0,
    blinds: { sb: 5, bb: 10 },
    players: mergedPlayers,
  };
}

describe('usePersistence (unit — no React)', () => {
  let repo: InMemoryGameRepository;
  let mockService: ReturnType<typeof createMockService>;
  let config: PersistenceConfig;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    repo = new InMemoryGameRepository();
    mockService = createMockService();
    config = {
      mode: 'hotseat',
      initialChips: 1000,
      blinds: { sb: 5, bb: 10 },
    };
  });

  afterEach(() => {
    cleanup?.();
  });

  it('saves player chips on roundEnd transition', async () => {
    cleanup = subscribePersistence(mockService, repo, config);

    // First emit preflop (sets prevPhase)
    mockService.emit(makeState('preflop'));
    // Then roundEnd with updated chips
    mockService.emit(makeState('roundEnd', [{ chips: 1200 }, { chips: 800 }]));

    // Wait for fire-and-forget promises
    await new Promise(r => setTimeout(r, 10));

    expect(await repo.getPlayerChips('Alice')).toBe(1200);
    expect(await repo.getPlayerChips('Bob')).toBe(800);
  });

  it('does not save on duplicate roundEnd (same phase twice)', async () => {
    cleanup = subscribePersistence(mockService, repo, config);

    mockService.emit(makeState('preflop'));
    mockService.emit(makeState('roundEnd', [{ chips: 1200 }, { chips: 800 }]));
    // Second roundEnd should be ignored
    mockService.emit(makeState('roundEnd', [{ chips: 9999 }, { chips: 9999 }]));

    await new Promise(r => setTimeout(r, 10));

    expect(await repo.getPlayerChips('Alice')).toBe(1200);
  });

  it('saves game record on gameOver transition', async () => {
    cleanup = subscribePersistence(mockService, repo, config);

    // Simulate two rounds then gameOver
    mockService.emit(makeState('preflop'));
    mockService.emit(makeState('roundEnd', [{ chips: 1200 }, { chips: 800 }]));
    mockService.emit(makeState('preflop'));
    mockService.emit(makeState('roundEnd', [{ chips: 1500 }, { chips: 500 }]));
    mockService.emit(makeState('gameOver', [{ chips: 1500 }, { chips: 500 }]));

    await new Promise(r => setTimeout(r, 10));

    const history = await repo.getGameHistory();
    expect(history).toHaveLength(1);
    expect(history[0].mode).toBe('hotseat');
    expect(history[0].rounds).toBe(2);
    expect(history[0].blinds).toEqual({ sb: 5, bb: 10 });
    expect(history[0].initialChips).toBe(1000);
    expect(history[0].results).toEqual([
      { name: 'Alice', chipChange: 500, finalChips: 1500 },
      { name: 'Bob', chipChange: -500, finalChips: 500 },
    ]);
  });

  it('does nothing when repository is null', async () => {
    cleanup = subscribePersistence(mockService, null, config);

    mockService.emit(makeState('preflop'));
    mockService.emit(makeState('roundEnd', [{ chips: 1200 }, { chips: 800 }]));

    await new Promise(r => setTimeout(r, 10));

    // subscribe should not have been called
    expect(mockService.subscribe).not.toHaveBeenCalled();
  });
});
