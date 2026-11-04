// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { Text } from 'pixi.js';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getDataFilePath } from '../../src/app/utils/dataFileMigration';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { TokenStatblockLinkService } from '../../src/app/services/TokenStatblockLinkService';
import { isNameplateVisible } from '../../src/app/pixi/token-renderer/nameplateVisibility';
import { buildStatblockLinkUpdates, STATBLOCK_UNLINK_UPDATES } from '../../src/app/pixi/token-renderer/statblockFrontmatter';
import { HP_RESOURCE } from '../../src/app/resources/resourceDefinitions';

afterEach(() => vi.restoreAllMocks());

const hero = { kind: 'character', x: 0, y: 0, imagePath: 'hero.png', name: 'Hero', resources: { hp: { current: 8, max: 10 } } } as const;

function createMapStore(path: string) {
  const { app, files } = createInMemoryApp();
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;
  app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
  const store = createViewAtlasStore(app, 'nameplate-test');
  store.setState({ mapPath: path, mapLoaded: true });
  return { app, files, store };
}

describe('per-token nameplate preference', () => {
  it('shows a nameplate when the map shows every nameplate or the token opts in', () => {
    expect(isNameplateVisible({ showNameplate: true }, false)).toBe(true);
    expect(isNameplateVisible({}, true)).toBe(true);
    expect(isNameplateVisible({ showNameplate: false }, true)).toBe(true);
    expect(isNameplateVisible({}, false)).toBe(false);
  });

  it('is not changed by linking or unlinking a statblock', () => {
    const { store } = createMapStore('maps/link.atlasmap');
    const shown = store.getState().addToken({ ...hero, showNameplate: true } as never);
    const hidden = store.getState().addToken({ ...hero, showNameplate: false } as never);

    store.getState().updateToken(shown, STATBLOCK_UNLINK_UPDATES);
    store.getState().updateToken(hidden, buildStatblockLinkUpdates({ fields: { name: 'Goblin', hp: 7 } }, 'Hero', [HP_RESOURCE], undefined));

    expect(store.getState().objects.tokens[shown]?.showNameplate).toBe(true);
    expect(store.getState().objects.tokens[hidden]?.showNameplate).toBe(false);
  });

  it('survives unlinking in maps that are not open', async () => {
    const mapPath = 'maps/closed.atlasmap';
    const token = { ...hero, id: 'hero', statblockPath: 'statblocks/Hero.md', showNameplate: true };
    const { app, files } = createInMemoryApp({
      files: { [mapPath]: JSON.stringify({ state: { objects: { tokens: { hero: token } } }, version: 1 }) },
    });
    const service = Object.assign(Object.create(TokenStatblockLinkService.prototype), { app });

    await service.updateAllSpawnedTokens('hero.png', null);

    const saved = JSON.parse(files.get(mapPath)!).state.objects.tokens.hero;
    expect(saved.statblockPath).toBeUndefined();
    expect(saved.showNameplate).toBe(true);
  });

  it('is saved to and restored from the map file while the map hides nameplates', async () => {
    const path = 'maps/nameplates.atlasmap';
    const { app, files, store } = createMapStore(path);
    const id = store.getState().addToken(hero as never);
    store.getState().setTokenSettings({ ...store.getState().tokenSettings, showNameplates: false });
    store.getState().updateToken(id, { showNameplate: true });

    await store.flushStorage();
    await waitFor(() => expect(files.has(getDataFilePath(path))).toBe(true));
    const saved = JSON.parse(files.get(getDataFilePath(path))!).state;
    expect(saved.tokenSettings.showNameplates).toBe(false);
    expect(saved.objects.tokens[id].showNameplate).toBe(true);

    const reopened = createViewAtlasStore(app, 'nameplate-reopened');
    reopened.getState().setPersistenceEnabled(false);
    reopened.getState().setMapPath(path);
    await reopened.persist.rehydrate();
    expect(reopened.getState().objects.tokens[id]?.showNameplate).toBe(true);
    expect(reopened.getState().tokenSettings.showNameplates).toBe(false);
  });

  it('renders and renames an opted-in token while the map hides nameplates', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
    } as never);
    vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({ width: 80, height: 20 } as never);
    const { store } = createMapStore('maps/render.atlasmap');
    store.getState().setTokenSettings({ ...store.getState().tokenSettings, showNameplates: false });
    const ui = new TokenUIRenderer(store);
    try {
      ui.update({ ...hero, id: 'hero', showNameplate: true }, 70);
      expect((ui as unknown as { nameText: Text }).nameText.text).toBe('Hero');
      ui.startNameEdit();
      expect(document.activeElement?.classList.contains('atlas-offscreen-input')).toBe(true);
    } finally {
      ui.destroy();
    }
  });
});
