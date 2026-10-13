import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { StatblockTokenSync } from '../../src/app/plugin/StatblockTokenSync';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';
import { FileReferenceService } from '../../src/app/services/FileReferenceService';
import { removeUndefinedConditions } from '../../src/app/services/collectionConditionCleanup';
import { removeUndefinedSenses } from '../../src/app/services/collectionSenseCleanup';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { HP, STRESS } from '../mocks/resourceFixtures';
import { character, statblockFixture } from '../mocks/statblockTokenSync';
import { CAVE, collectionScene, darkvision, openStore, rename, tabScene, token, TOWER } from '../helpers/historyScenes';

vi.mock('../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));
vi.mock('../../src/app/MapLoader', () => ({ MapLoader: { load: vi.fn() } }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Atlas changes the very token an edit changed: undoing the edit takes that change back with it,
// and redoing the edit (or undoing it again after a redo) brings back the token as Atlas left it.

describe('a renamed file of the token an edit moved', () => {
  it('comes back with the token\'s move on redo', () => {
    const { store, history } = openStore();
    const a = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' });
    store.getState().moveToken(a, 70, 0);
    const steps = history().pastStates.length;
    rename(store, 'art/a.png', 'art/a2.png');
    expect(history().pastStates).toHaveLength(steps);
    history().undo();
    expect(token(store, a)).toMatchObject({ x: 0, imagePath: 'art/a.png' });
    history().redo();
    expect(token(store, a)).toMatchObject({ x: 70, imagePath: 'art/a2.png' });
    expect(history().pastStates).toHaveLength(steps);
  });

  it('comes back when the move is undone again after a redo', () => {
    const { store, history } = openStore();
    const a = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' });
    store.getState().moveToken(a, 70, 0);
    history().undo();
    rename(store, 'art/a.png', 'art/a2.png');
    expect(token(store, a)).toMatchObject({ x: 0, imagePath: 'art/a2.png' });
    history().redo();
    expect(token(store, a)).toMatchObject({ x: 70, imagePath: 'art/a.png' });
    history().undo();
    expect(token(store, a)).toMatchObject({ x: 0, imagePath: 'art/a2.png' });
    history().redo();
    expect(token(store, a)).toMatchObject({ x: 70, imagePath: 'art/a.png' });
  });
});

describe('a collection cleaned up after an edit of the token it changed', () => {
  it('keeps the conditions it took away once the edit is redone', async () => {
    const { store, history, app, a } = collectionScene();
    store.getState().moveToken(a, 70, 0);
    await removeUndefinedConditions(app as never, 'heist');
    expect(token(store, a)).toMatchObject({ x: 70, conditions: ['poisoned'] });
    history().undo();
    expect(token(store, a)).toMatchObject({ x: 0, conditions: ['poisoned', 'gone'] });
    history().redo();
    expect(token(store, a)).toMatchObject({ x: 70, conditions: ['poisoned'] });
  });

  it('keeps the senses it took away once the edit is redone', async () => {
    const { store, history, app, a } = collectionScene();
    store.getState().moveToken(a, 70, 0);
    await removeUndefinedSenses(app as never, 'heist', BUILT_IN_SYSTEM_PRESETS);
    expect(token(store, a)).toMatchObject({ vision: { senses: [{ id: darkvision }] } });
    history().undo();
    expect(token(store, a)).toMatchObject({ x: 0, vision: { senses: [{ id: darkvision }, { id: 'home-gone' }] } });
    history().redo();
    expect(token(store, a)).toMatchObject({ x: 70, vision: { senses: [{ id: darkvision }] } });
  });
});

describe('resources Atlas starts for the token an edit moved', () => {
  it('come back with the move on redo', async () => {
    const fixture = statblockFixture();
    const store = createViewAtlasStore(fixture.app, `redo-own-writes-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    let definitions: readonly ResourceDefinition[] = [HP];
    const sync = new StatblockTokenSync(fixture.app, store, fixture.links, () => definitions);
    const history = getHistoryStore(store)!;
    store.getState().addToken(character({ resources: { hp: { current: 2, max: 7 } } }));
    store.getState().moveToken('hero', 70, 20);
    definitions = [HP, STRESS];
    sync.fillMissingResources();
    await vi.waitFor(() => expect(token(store, 'hero')).toMatchObject({ resources: { stress: { current: 0, max: 6 } } }));
    history.getState().undo();
    expect(token(store, 'hero')).toMatchObject({ x: 10 });
    history.getState().redo();
    expect(token(store, 'hero')).toMatchObject({ x: 70, resources: { hp: { current: 2, max: 7 }, stress: { current: 0, max: 6 } } });
    sync.destroy();
  });
});

describe('a scene whose file was rewritten for the token an edit moved while its tab was away', () => {
  it('brings the rewritten art back with the move on redo', async () => {
    const scene = tabScene();
    await scene.load(CAVE);
    scene.store.getState().moveToken('a', 80, 20);
    await scene.save();
    scene.leave();
    await scene.load(TOWER);
    await new FileReferenceService(scene.app).handleFilesMoved([{ from: 'tokens/a.png', to: 'art/a.png' }]);
    expect(scene.files.get(CAVE)).toContain('art/a.png');
    await scene.load(CAVE);
    scene.comeBack();
    const history = getHistoryStore(scene.store)!;

    history.getState().undo();
    expect(token(scene.store, 'a')).toMatchObject({ x: 10 });
    history.getState().redo();
    expect(token(scene.store, 'a')).toMatchObject({ x: 80, imagePath: 'art/a.png' });
    expect(token(scene.store, 'b')).toMatchObject({ x: 10, imagePath: 'tokens/b.png' });
  });
});
