// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { resourceUpdate } from '../../src/app/resources/resourceValues';
import { getDataFilePath } from '../../src/app/utils/dataFileMigration';

describe('token resource persistence', () => {
  it('round-trips independent changes to several resources through map storage', async () => {
    const { app, files } = createInMemoryApp();
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
    const path = 'maps/resources.atlasmap';
    const store = createViewAtlasStore(app, 'resources-test');
    store.setState({ mapPath: path, mapLoaded: true });
    const resources = { hp: { current: 27, max: 27 }, hope: { current: 6, max: 6 }, mana: { current: 8, max: 8 } };
    const [first, second] = [10, 30].map((x) => store.getState().addToken({ kind: 'character', x, y: 20, imagePath: 'mage.png', name: 'Mage', resources } as never));
    for (const [key, current] of [['hp', 15], ['hope', 2], ['mana', 3]] as const) {
      const token = store.getState().objects.tokens[first!]!;
      store.getState().updateToken(first!, resourceUpdate(token, key, { current, max: resources[key].max }, false));
    }
    await (store as typeof store & { flushStorage: () => Promise<void> }).flushStorage();
    await waitFor(() => expect(files.has(getDataFilePath(path))).toBe(true));
    const saved = JSON.parse(files.get(getDataFilePath(path))!);
    const changed = { hp: { current: 15, max: 27 }, hope: { current: 2, max: 6 }, mana: { current: 3, max: 8 } };
    // The file keeps the fields every version of Atlas reads
    const savedToken = saved.state.objects.tokens[first!];
    expect(savedToken).toMatchObject({ hp: changed.hp, hope: changed.hope, statblockResources: { mana: changed.mana } });
    expect(savedToken).not.toHaveProperty('resources');
    expect(saved.state.objects.tokens[second!]).toMatchObject({ hp: resources.hp, hope: resources.hope, statblockResources: { mana: resources.mana } });
    expect(saved.state.tokenSettings).toMatchObject({ showHPBars: true, hiddenResources: [] });
    const reopened = createViewAtlasStore(app, 'resources-reopened');
    reopened.getState().setPersistenceEnabled(false);
    reopened.getState().setMapPath(path);
    await reopened.persist.rehydrate();
    expect(reopened.getState().objects.tokens[first!]!.resources).toEqual(changed);
  });

  it('writes a scene of an older Atlas back with the fields that version reads', async () => {
    const path = 'maps/older.atlasmap';
    const token = { id: 't1', kind: 'character', name: 'Cultist', x: 10, y: 20, imagePath: 'cultist.png', hp: { current: 4, max: 9 }, stress: { current: 1, max: 6 }, maxStress: 6, maxHpOverridden: true };
    const entry = { id: 'e1', tokenId: 't1', name: 'Cultist', initiative: 12, initiativeModifier: 0, imagePath: 'cultist.png', isActive: true, isNPC: true, order: 0, hp: { current: 4, max: 9 }, stress: { current: 1, max: 6 }, isDefeated: false };
    const older = { version: 4, state: {
      version: 4, mapPath: path,
      objects: { tokens: { t1: token }, walls: {}, lights: {} },
      tokenSettings: { showNameplates: true, showInstanceBadges: true, showHPBars: false, showStressBars: true },
      initiative: { entries: [entry], currentIndex: 0, round: 1, isActive: true },
    } };
    const { app, files } = createInMemoryApp({ files: { [getDataFilePath(path)]: JSON.stringify(older) } });
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
    const store = createViewAtlasStore(app, 'older-test');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath(path);
    await store.persist.rehydrate();

    // In memory the scene holds resources, a hidden list and no copies
    const loaded = store.getState();
    expect(loaded.objects.tokens.t1).toMatchObject({ resources: { hp: { current: 4, max: 9 }, stress: { current: 1, max: 6 } }, overriddenMax: ['hp'] });
    expect(loaded.objects.tokens.t1).not.toHaveProperty('hp');
    expect(loaded.tokenSettings.hiddenResources).toEqual(['hp']);
    expect(loaded.initiative.entries[0]).not.toHaveProperty('hp');

    store.setState({ mapLoaded: true });
    store.getState().setPersistenceEnabled(true);
    store.getState().updateToken('t1', { x: 50 });
    await (store as typeof store & { flushStorage: () => Promise<void> }).flushStorage();
    await waitFor(() => expect(JSON.parse(files.get(getDataFilePath(path))!).state.objects.tokens.t1.x).toBe(50));

    const saved = JSON.parse(files.get(getDataFilePath(path))!).state;
    expect(saved.objects.tokens.t1).toEqual({ ...token, x: 50 });
    expect(saved.tokenSettings).toMatchObject(older.state.tokenSettings);
    expect(saved.initiative.entries[0]).toEqual(entry);
  });
});
