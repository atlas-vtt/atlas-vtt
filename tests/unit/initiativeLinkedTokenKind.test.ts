import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { DEFAULT_INITIATIVE_RULES } from '../../src/app/gameSystems/initiativeRules';
import { initiativeEntryForToken } from '../../src/app/stores/initiativeEntries';
import { rollWithStatblocks } from '../../src/app/initiative/rollWithStatblocks';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => {
  delete (window as Window & { FantasyStatblocks?: unknown }).FantasyStatblocks;
  vi.restoreAllMocks();
});

describe('linked statblocks on stored tokens', () => {
  it.each(['token', 'character'] as const)('reads the modifier of a linked %s without changing its kind', async (kind) => {
    const path = 'Bestiary/Goblin.md';
    const { app } = createInMemoryApp({ files: { [path]: '# Goblin' } });
    Object.assign(window, { FantasyStatblocks: {
      getBestiaryCreatures: () => [{ path, name: 'Goblin', modifier: 3 }],
      hasCreature: () => false,
    } });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const store = createViewAtlasStore(app, `linked-${kind}`);
    // Linking an existing plain token writes its statblockPath without converting its kind.
    const token = { id: 'goblin', kind, name: 'Goblin', imagePath: '', x: 0, y: 0, statblockPath: path };
    store.setState({
      persistenceEnabled: false, isMapLoading: false,
      objects: { ...store.getState().objects, tokens: { goblin: token } },
    });
    store.getState().addToInitiative(initiativeEntryForToken(token));

    await rollWithStatblocks(app, store, DEFAULT_INITIATIVE_RULES);

    expect(store.getState().initiative.entries[0]?.initiative).toBe(14);
    expect(store.getState().objects.tokens.goblin?.kind).toBe(kind);
  });
});
