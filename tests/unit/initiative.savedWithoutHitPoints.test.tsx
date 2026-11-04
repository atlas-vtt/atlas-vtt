// @vitest-environment jsdom
import React, { act } from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/resources/useMapResources', async () => {
  const definitions = [(await import('../../src/app/resources/resourceDefinitions')).HP_RESOURCE];
  return { useMapResources: () => definitions };
});

vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ zoomToTokenWithHighlight: vi.fn() }));
vi.mock('../../src/app/react/components/StatblockHoverPreview', () => ({
  StatblockHoverPreview: () => null,
  useStatblockHoverPreview: () => [
    { hoveredEntry: null, isVisible: false, isClosing: false, position: null, anchorRect: null, notePath: null },
    { showPreview: vi.fn(), closePreview: vi.fn(), clearPreview: vi.fn() },
  ],
}));

import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';
import { initiativeEntryForToken } from '../../src/app/stores/initiativeEntries';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasState, type ViewAtlasStore } from '../../src/app/storeFactory';

const SCENE = "atlas-vtt/collections/Daggerheart/scenes/Hallow's Rest.atlasmap";
const STATBLOCK = 'atlas-vtt/collections/Daggerheart/statblocks/Acid Burrower.md';

function vault(files: Record<string, string> = {}): { app: App; files: Map<string, string> } {
  const { app, files: stored } = createInMemoryApp({ files });
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;
  app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
  app.vault.adapter.getResourcePath = (path: string): string => `app://${path}`;
  return { app, files: stored };
}

/** The store side of opening a scene: bound to the file and filled from it. */
async function openScene(app: App, viewId: string): Promise<ViewAtlasStore> {
  const store = createViewAtlasStore(app, viewId);
  store.getState().setMapPath(SCENE);
  await store.persist.rehydrate();
  store.setState({ mapLoaded: true });
  return store;
}

function showTracker(app: App, store: ViewAtlasStore): HTMLElement {
  return render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store}><InitiativeTracker /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  ).container;
}

const savedEntries = (files: Map<string, string>): Array<Record<string, unknown>> =>
  (JSON.parse(files.get(SCENE) ?? '{}') as { state: ViewAtlasState }).state.initiative.entries as unknown as Array<Record<string, unknown>>;

afterEach(() => vi.restoreAllMocks());

describe('a creature with a statblock but no hit points in the initiative', () => {
  it('is added, synced, saved and shown again after a reload without an HP bar', async () => {
    const { app, files } = vault();
    const store = await openScene(app, 'no-hp-session');
    act(() => {
      store.getState().setInitiativeTrackerOpen(true);
      store.getState().addToken({ kind: 'character', name: 'Acid Burrower', statblockPath: STATBLOCK, x: 0, y: 0, imagePath: 'tokens/burrower.webp' });
      store.getState().addToInitiative(initiativeEntryForToken(Object.values(store.getState().objects.tokens)[0]!));
    });

    const session = showTracker(app, store);
    expect(session.querySelectorAll('.atlas-initiative-card')).toHaveLength(1);
    expect(session.querySelector('.atlas-initiative-card__hp-bar')).toBeNull();
    await store.flushStorage();

    expect(savedEntries(files)).toHaveLength(1);
    expect(savedEntries(files)[0]).not.toHaveProperty('hp');
    expect(savedEntries(files)[0]).toMatchObject({ name: 'Acid Burrower', statblockPath: STATBLOCK });

    const reloaded = showTracker(app, await openScene(app, 'no-hp-reload'));
    expect(reloaded.querySelectorAll('.atlas-initiative-card')).toHaveLength(1);
    expect(reloaded.querySelector('.atlas-initiative-card__hp-bar')).toBeNull();
  });

  it('shows entries that hold no hp, isDefeated, order or isActive, with the hit points of their tokens', async () => {
    const entry = (tokenId: string): Record<string, unknown> => ({
      tokenId, name: tokenId, initiative: 12, initiativeModifier: 0, imagePath: `tokens/${tokenId}.webp`, isNPC: true,
      statblockPath: STATBLOCK, id: `init_${tokenId}`,
    });
    const token = (id: string, hp?: { current: number; max: number }): Record<string, unknown> => ({
      id, kind: 'character', name: id, x: 0, y: 0, imagePath: `tokens/${id}.webp`, statblockPath: STATBLOCK, ...(hp ? { hp } : {}),
    });
    const { app } = vault({
      [SCENE]: JSON.stringify({
        version: 4,
        state: {
          mapPath: SCENE, initiativeTrackerOpen: true,
          objects: { tokens: { burrower: token('burrower'), bear: token('bear', { current: 3, max: 6 }) } },
          initiative: { entries: [entry('burrower'), entry('bear')], currentIndex: -1, round: 0, isActive: false, config: { autoSort: true }, removedTokenIds: [] },
        },
      }),
    });

    const store = await openScene(app, 'token-resources-file');
    const tracker = showTracker(app, store);

    expect(tracker.querySelectorAll('.atlas-initiative-card')).toHaveLength(2);
    // The creature with hit points shows them from its token (stored in the old format here); the other has none
    expect(tracker.querySelectorAll('.atlas-initiative-card__hp-bar')).toHaveLength(1);
    expect(tracker.querySelector<HTMLElement>('.atlas-initiative-card__hp-fill')?.style.width).toBe('50%');
    expect(store.getState().initiative.entries.some((saved) => 'hp' in saved)).toBe(false);
    expect(store.getState().objects.tokens.bear?.resources).toEqual({ hp: { current: 3, max: 6 } });
  });
});
