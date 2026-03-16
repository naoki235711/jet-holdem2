import { LocalGameService } from '../../src/services/LocalGameService';
import { InMemoryGameRepository } from '../../src/services/persistence/InMemoryGameRepository';
import { subscribePersistence, PersistenceConfig } from '../../src/hooks/usePersistence';

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

const flushPromises = () => new Promise(r => setTimeout(r, 20));

describe('Repository Resilience', () => {
  let service: LocalGameService;
  let config: PersistenceConfig;

  beforeEach(() => {
    service = new LocalGameService();
    config = { mode: 'hotseat', initialChips: 1000, blinds: { sb: 5, bb: 10 } };
  });

  // RR-1
  it('savePlayerChips throws → game continues', async () => {
    const repo = new InMemoryGameRepository();
    jest.spyOn(repo, 'savePlayerChips').mockRejectedValue(new Error('Storage full'));

    const unsub = subscribePersistence(service, repo, config);
    service.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000);
    service.startRound();
    advanceToPhase(service, 'roundEnd');

    await flushPromises();

    // Game should continue despite save failure
    service.prepareNextRound();
    expect(service.getState().phase).toBe('waiting');
    service.startRound();
    expect(service.getState().phase).toBe('preflop');

    unsub();
  });

  // RR-2
  it('partial failure: one player save fails, others succeed', async () => {
    const repo = new InMemoryGameRepository();
    // Track which players were successfully saved
    const savedChips = new Map<string, number>();
    jest.spyOn(repo, 'savePlayerChips').mockImplementation(
      async (name: string, chips: number) => {
        if (name === 'Bob') throw new Error('Disk error');
        savedChips.set(name, chips);
      },
    );

    const unsub = subscribePersistence(service, repo, config);
    service.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000);
    service.startRound();
    advanceToPhase(service, 'roundEnd');

    await flushPromises();

    const state = service.getState();
    // Alice and Charlie saved, Bob not saved
    expect(savedChips.get('Alice')).toBe(state.players[0].chips);
    expect(savedChips.has('Bob')).toBe(false); // Failed, not saved
    expect(savedChips.get('Charlie')).toBe(state.players[2].chips);

    unsub();
  });

  // RR-3
  it('saveGameRecord throws → game state intact', async () => {
    const repo = new InMemoryGameRepository();
    jest.spyOn(repo, 'saveGameRecord').mockRejectedValue(new Error('Write error'));

    const lowConfig: PersistenceConfig = { mode: 'hotseat', initialChips: 30, blinds: { sb: 10, bb: 20 } };
    const unsub = subscribePersistence(service, repo, lowConfig);
    service.startGame(['Alice', 'Bob'], { sb: 10, bb: 20 }, 30);

    while (service.getState().phase !== 'gameOver') {
      service.startRound();
      advanceToPhase(service, 'roundEnd');
      service.prepareNextRound();
    }

    await flushPromises();

    expect(service.getState().phase).toBe('gameOver');
    // Record not saved due to error
    expect(await repo.getGameHistory()).toHaveLength(0);

    unsub();
  });

  // RR-4
  it('repository=null → full game flow completes without exceptions', async () => {
    const unsub = subscribePersistence(service, null, config);

    service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
    service.startRound();
    advanceToPhase(service, 'roundEnd');
    service.prepareNextRound();
    expect(service.getState().phase).toBe('waiting');
    service.startRound();
    expect(service.getState().phase).toBe('preflop');

    unsub();
  });

  // RR-5
  it('slow save does not block game progression', async () => {
    const repo = new InMemoryGameRepository();
    jest.spyOn(repo, 'savePlayerChips').mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 1000)),
    );

    const unsub = subscribePersistence(service, repo, config);
    service.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000);
    service.startRound();
    advanceToPhase(service, 'roundEnd');

    // Game should proceed immediately without waiting for 1s save
    service.prepareNextRound();
    expect(service.getState().phase).toBe('waiting');
    service.startRound();
    expect(service.getState().phase).toBe('preflop');

    unsub();
  });
});
