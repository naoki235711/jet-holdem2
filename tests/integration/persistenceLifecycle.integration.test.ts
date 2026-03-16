import { LocalGameService } from '../../src/services/LocalGameService';
import { InMemoryGameRepository } from '../../src/services/persistence/InMemoryGameRepository';
import { subscribePersistence, PersistenceConfig } from '../../src/hooks/usePersistence';

// Helper: advance game by having all players check/call until targetPhase
function advanceToPhase(service: LocalGameService, targetPhase: string): void {
  let state = service.getState();
  let safety = 0;
  while (state.phase !== targetPhase && safety < 100) {
    if (state.activePlayer < 0) {
      if (state.phase === 'showdown') {
        service.resolveShowdown();
        state = service.getState();
        continue;
      }
      break;
    }
    const info = service.getActionInfo(state.activePlayer);
    if (info.canCheck) {
      service.handleAction(state.activePlayer, { action: 'check' });
    } else {
      service.handleAction(state.activePlayer, { action: 'call' });
    }
    state = service.getState();
    safety++;
  }
}

// Helper: fold all but the last active player → fold-win roundEnd
function foldToRoundEnd(service: LocalGameService): void {
  let state = service.getState();
  while (state.phase !== 'roundEnd' && state.activePlayer >= 0) {
    service.handleAction(state.activePlayer, { action: 'fold' });
    state = service.getState();
  }
}

// Wait for fire-and-forget async saves to complete
const flushPromises = () => new Promise(r => setTimeout(r, 20));

describe('Persistence Lifecycle Integration', () => {
  let service: LocalGameService;
  let repo: InMemoryGameRepository;
  let config: PersistenceConfig;
  let unsub: () => void;

  beforeEach(() => {
    service = new LocalGameService();
    repo = new InMemoryGameRepository();
    config = { mode: 'hotseat', initialChips: 1000, blinds: { sb: 5, bb: 10 } };
  });

  afterEach(() => {
    unsub?.();
  });

  // PL-1
  it('saves player chips on roundEnd via real game progression', async () => {
    unsub = subscribePersistence(service, repo, config);
    service.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000);
    service.startRound();
    advanceToPhase(service, 'roundEnd');

    await flushPromises();

    const state = service.getState();
    expect(state.phase).toBe('roundEnd');

    for (const player of state.players) {
      const savedChips = await repo.getPlayerChips(player.name);
      expect(savedChips).toBe(player.chips);
    }
  });

  // PL-2
  it('saved chips restore correctly in next game', async () => {
    unsub = subscribePersistence(service, repo, config);
    service.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000);
    service.startRound();
    advanceToPhase(service, 'roundEnd');

    await flushPromises();

    // Load saved chips
    const savedChips: Record<string, number> = {};
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      const chips = await repo.getPlayerChips(name);
      savedChips[name] = chips!;
    }

    // Start a new game with saved chips
    const service2 = new LocalGameService();
    service2.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000, savedChips);
    const state2 = service2.getState();

    for (const player of state2.players) {
      expect(player.chips).toBe(savedChips[player.name]);
    }
  });

  // PL-3
  it('fold-win saves chips correctly', async () => {
    unsub = subscribePersistence(service, repo, config);
    service.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000);
    service.startRound();

    // Record chips after blinds posted
    const preState = service.getState();
    const totalBefore = preState.players.reduce((s, p) => s + p.chips + p.bet, 0);

    foldToRoundEnd(service);

    await flushPromises();

    const state = service.getState();
    expect(state.phase).toBe('roundEnd');

    // Verify chip conservation
    const totalAfter = state.players.reduce((s, p) => s + p.chips, 0);
    expect(totalAfter).toBe(totalBefore);

    // Verify winner's chips increased
    const winner = state.players.find(p => p.seat === state.foldWin!.seat)!;
    expect(winner.chips).toBeGreaterThan(1000);

    // Verify saved chips match
    for (const player of state.players) {
      const saved = await repo.getPlayerChips(player.name);
      expect(saved).toBe(player.chips);
    }
  });

  // PL-4
  it('saves game record on gameOver', async () => {
    // Use 2 players with low chips to reach gameOver quickly
    const lowConfig: PersistenceConfig = { mode: 'hotseat', initialChips: 30, blinds: { sb: 10, bb: 20 } };
    unsub = subscribePersistence(service, repo, lowConfig);
    service.startGame(['Alice', 'Bob'], { sb: 10, bb: 20 }, 30);

    // Play rounds until gameOver
    while (service.getState().phase !== 'gameOver') {
      service.startRound();
      advanceToPhase(service, 'roundEnd');
      service.prepareNextRound();
    }

    await flushPromises();

    const history = await repo.getGameHistory();
    expect(history).toHaveLength(1);

    const record = history[0];
    expect(record.mode).toBe('hotseat');
    expect(record.blinds).toEqual({ sb: 10, bb: 20 });
    expect(record.initialChips).toBe(30);
    expect(record.results).toHaveLength(2);

    // One player has all chips, the other has 0
    const winner = record.results.find(r => r.finalChips > 0)!;
    const loser = record.results.find(r => r.finalChips === 0)!;
    expect(winner.finalChips).toBe(60); // Total chips
    expect(loser.finalChips).toBe(0);
    expect(winner.chipChange).toBe(30);
    expect(loser.chipChange).toBe(-30);
  });

  // PL-5
  it('round count is accurate in game record', async () => {
    const lowConfig: PersistenceConfig = { mode: 'hotseat', initialChips: 50, blinds: { sb: 10, bb: 20 } };
    unsub = subscribePersistence(service, repo, lowConfig);
    service.startGame(['Alice', 'Bob'], { sb: 10, bb: 20 }, 50);

    let roundsPlayed = 0;
    while (service.getState().phase !== 'gameOver') {
      service.startRound();
      advanceToPhase(service, 'roundEnd');
      roundsPlayed++;
      service.prepareNextRound();
    }

    await flushPromises();

    const history = await repo.getGameHistory();
    expect(history).toHaveLength(1);
    expect(history[0].rounds).toBe(roundsPlayed);
    expect(roundsPlayed).toBeGreaterThanOrEqual(1);
  });
});
