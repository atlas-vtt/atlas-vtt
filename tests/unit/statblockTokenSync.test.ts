import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatblockTokenSync } from '../../src/app/plugin/StatblockTokenSync';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';
import { HP, STRESS } from '../mocks/resourceFixtures';
import { character, statblockFixture, tokenAsset } from '../mocks/statblockTokenSync';

afterEach(() => vi.restoreAllMocks());

function setup(isPlayerView = false) {
  const fixture = statblockFixture();
  const store = createViewAtlasStore(fixture.app, 'statblock-sync-test', undefined, isPlayerView);
  store.getState().setPersistenceEnabled(false);
  let definitions: readonly ResourceDefinition[] = [HP];
  const sync = new StatblockTokenSync(fixture.app, store, fixture.links, () => definitions);
  return { ...fixture, store, sync, setDefinitions: (next: readonly ResourceDefinition[]): void => { definitions = next; } };
}

describe('StatblockTokenSync', () => {
  it('refreshes linked characters while preserving current values and hand-set maxima', async () => {
    const f = setup();
    f.store.getState().addToken(character({ resources: { hp: { current: 3, max: 10 } } }));
    f.store.getState().addToken(character({ id: 'manual', resources: { hp: { current: 2, max: 7 } }, overriddenMax: ['hp'] }));
    f.store.getState().addToken(character({ id: 'other', statblockPath: 'Other.md' }));
    f.store.getState().addToken({ ...character({ id: 'plain' }), kind: 'token' });
    await f.change();
    expect(f.store.getState().objects.tokens.hero).toMatchObject({ name: 'Hero', difficulty: '15', resources: { hp: { current: 3, max: 20 } } });
    expect(f.store.getState().objects.tokens.manual?.resources?.hp).toEqual({ current: 2, max: 7 });
    expect(f.store.getState().objects.tokens.other).toMatchObject({ name: 'Custom' });
    expect(f.store.getState().objects.tokens.plain).toMatchObject({ name: 'Custom' });
    f.sync.destroy();
  });

  it('ignores files without character markers or cached frontmatter', async () => {
    const f = setup();
    f.store.getState().addToken(character());
    vi.mocked(f.app.metadataCache.getFileCache).mockReturnValueOnce({ frontmatter: { name: 'Not a character' } }).mockReturnValueOnce(null);
    await f.change();
    await f.change();
    expect(f.store.getState().objects.tokens.hero).toMatchObject({ name: 'Custom' });
    expect(f.links.findAssetByAnyPath).not.toHaveBeenCalled();
    f.sync.destroy();
  });

  it('links a token the picture names that links no statblock, and leaves placed art alone', async () => {
    const f = setup();
    f.store.getState().addToken(character());
    f.links.readStatblockImage.mockReturnValue('new.png');
    f.links.findAssetByAnyPath.mockResolvedValue(tokenAsset());
    await f.change();
    expect(f.links.linkTokenToStatblock).toHaveBeenCalledWith('new.png', 'Hero.md', { updateStatblockAvatar: false, fromNote: true });
    expect(f.store.getState().objects.tokens.hero?.imagePath).toBe('hero.png');
    f.sync.destroy();
  });

  it('never links, unlinks or takes a token because of the picture alone', async () => {
    const f = setup();
    f.store.getState().addToken(character());
    f.links.readStatblockImage.mockReturnValue('new.png');
    f.links.findAssetByAnyPath.mockResolvedValue(tokenAsset({ statblockPath: 'Other.md' }));
    await f.change();
    f.links.findAssetByAnyPath.mockResolvedValue(tokenAsset({ statblockPath: 'Hero.md' }));
    await f.change();
    f.links.findAssetByAnyPath.mockResolvedValue(null);
    await f.change();
    f.links.readStatblockImage.mockReturnValue(null);
    await f.change();
    expect(f.links.linkTokenToStatblock).not.toHaveBeenCalled();
    expect(f.store.getState().objects.tokens.hero).toMatchObject({ imagePath: 'hero.png', statblockPath: 'Hero.md' });
    f.sync.destroy();
  });

  it('links every matching image and clears only derived fields when unlinked', async () => {
    const f = setup();
    f.store.getState().addToken(character({ overriddenMax: ['hp'], resources: { hp: { current: 2, max: 7 } } }));
    f.store.getState().addToken({ ...character({ id: 'plain' }), kind: 'token' });
    f.store.getState().addToken(character({ id: 'other', imagePath: 'other.png' }));
    f.link({ type: 'linked', tokenImagePath: 'hero.png', statblockPath: 'Hero.md' });
    await vi.waitFor(() => expect(f.store.getState().objects.tokens.hero?.statblockPath).toBe('Hero.md'));
    await vi.waitFor(() => expect(f.store.getState().objects.tokens.hero?.name).toBe('Hero'));
    for (const id of ['hero', 'plain']) {
      expect(f.store.getState().objects.tokens[id]).toMatchObject({ statblockPath: 'Hero.md', name: 'Hero', difficulty: '15', resources: { hp: { current: 20, max: 20 } } });
      expect(f.store.getState().objects.tokens[id]?.overriddenMax).toBeUndefined();
    }
    f.link({ type: 'unlinked', tokenImagePath: 'hero.png', statblockPath: null });
    await vi.waitFor(() => expect(f.store.getState().objects.tokens.hero?.statblockPath).toBeUndefined());
    const hero = f.store.getState().objects.tokens.hero;
    expect(hero).toMatchObject({ x: 10, y: 20, imagePath: 'hero.png' });
    for (const key of ['statblockPath', 'name', 'statblockName', 'resources', 'difficulty', 'overriddenMax']) {
      expect(hero).not.toHaveProperty(key, expect.anything());
    }
    expect(f.store.getState().objects.tokens.other).toMatchObject({ name: 'Custom', statblockPath: 'Hero.md' });
    f.sync.destroy();
  });

  it('reads current resource definitions and fills missing values without an undo step', async () => {
    const f = setup();
    f.store.getState().addToken(character({ resources: { hp: { current: 2, max: 7 } } }));
    const history = getHistoryStore(f.store)!;
    const before = history.getState().pastStates.length;
    f.setDefinitions([HP, STRESS]);
    f.sync.fillMissingResources();
    await vi.waitFor(() => expect(f.store.getState().objects.tokens.hero?.resources?.stress).toEqual({ current: 0, max: 6 }));
    expect(f.store.getState().objects.tokens.hero?.resources?.hp).toEqual({ current: 2, max: 7 });
    expect(history.getState().pastStates).toHaveLength(before);
    f.sync.destroy();
  });

  it('does not initialize resources in a player view', () => {
    const f = setup(true);
    f.store.getState().addToken(character());
    f.sync.fillMissingResources();
    expect(f.links.readStatblockRecord).not.toHaveBeenCalled();
    f.sync.destroy();
  });

  it('removes its metadata and link listeners on destruction', () => {
    const f = setup();
    f.store.getState().addToken(character());
    expect(f.links.listenerCount('link-changed')).toBe(1);
    f.sync.destroy();
    expect(f.app.metadataCache.offref).toHaveBeenCalledWith(f.ref);
    expect(f.links.listenerCount('link-changed')).toBe(0);
    f.link({ type: 'unlinked', tokenImagePath: 'hero.png', statblockPath: null });
    expect(f.store.getState().objects.tokens.hero).toMatchObject({ name: 'Custom' });
  });
});
