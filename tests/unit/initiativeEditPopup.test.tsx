// @vitest-environment jsdom
import React, { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { createInMemoryApp, parseFrontmatter } from '../mocks/inMemoryVault';
import type { ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';
import { initiativeEdit, modifierText } from '../../src/app/initiative/initiativeEdit';

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../src/app/react/root/ContextMenuContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/ContextMenuContext')>(),
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
}));
vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));
vi.mock('../../src/app/initiative/useMapInitiativeRules', () => ({
  useMapInitiativeRules: () => ({ mode: 'turn-order', roll: '1d20', firstSide: 'players', modifier: { field: 'initiative' } }),
}));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
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
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';

const CAPTAIN = 'statblocks/Bandit Captain.md';

describe('what the edit popup writes', () => {
  it('sets the total, and the GM\'s own modifier, 0 included', () => {
    expect(initiativeEdit('14', '2')).toEqual({ initiative: 14, initiativeModifier: 2, modifierByHand: true });
    expect(initiativeEdit('14', '0')).toEqual({ initiative: 14, initiativeModifier: 0, modifierByHand: true });
    expect(initiativeEdit('14', '-1')).toEqual({ initiative: 14, initiativeModifier: -1, modifierByHand: true });
  });

  it('clears the modifier where the field is emptied, and leaves alone what is no number', () => {
    expect(initiativeEdit('14', ' ')).toEqual({ initiative: 14, initiativeModifier: 0, modifierByHand: undefined });
    expect(initiativeEdit('', '1.5')).toEqual({});
  });

  it('opens with the GM\'s own modifier, and empty where there is none', () => {
    expect(modifierText({ initiativeModifier: 0 })).toBe('');
    expect(modifierText({ initiativeModifier: 0, modifierByHand: true })).toBe('0');
    expect(modifierText({ initiativeModifier: 3 })).toBe('3');
  });
});

function setup(): { app: App; store: ViewAtlasStore; id: string } {
  const { app, files } = createInMemoryApp({ files: { [CAPTAIN]: '---\nstatblock: true\nname: Bandit Captain\ninitiative: +5\n---\n' } });
  app.metadataCache.getFileCache = (file) => ({ frontmatter: parseFrontmatter(files.get(file.path) ?? '') });
  const store = createViewAtlasStore(app, 'initiative-edit');
  store.getState().setMapPath('scenes/Road.atlasmap');
  store.setState({ mapLoaded: true, initiativeTrackerOpen: true });
  let id = '';
  act(() => {
    const tokenId = store.getState().addToken({ kind: 'character', name: 'Captain', x: 0, y: 0, imagePath: 'tokens/c.webp', statblockPath: CAPTAIN });
    id = store.getState().addToInitiative(initiativeEntryForToken(store.getState().objects.tokens[tokenId]!));
  });
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store}><InitiativeTracker /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  return { app, store, id };
}

function openPopup(): void {
  fireEvent.contextMenu(document.querySelector('.atlas-initiative-card')!);
  const item = opened.entries.find((entry) => entry.type === 'item' && entry.label === 'Edit Initiative');
  if (item?.type !== 'item') throw new Error('no "Edit Initiative" item');
  act(() => { void item.onClick?.(); });
}

afterEach(() => vi.restoreAllMocks());

describe('the GM\'s own modifier in the initiative card\'s edit popup', () => {
  it('wins over the statblock\'s, an explicit 0 too, and once cleared the statblock counts again', async () => {
    const { store, id } = setup();
    const entry = (): ReturnType<typeof store.getState>['initiative']['entries'][number] => store.getState().initiative.entries.find((e) => e.id === id)!;

    openPopup();
    const modifier = screen.getByLabelText<HTMLInputElement>('Modifier');
    expect(modifier.value).toBe('');
    fireEvent.change(modifier, { target: { value: '0' } });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(entry()).toMatchObject({ initiativeModifier: 0, modifierByHand: true });

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    fireEvent.click(screen.getByRole('button', { name: 'Roll initiative' }));
    await waitFor(() => expect(entry().initiative).toBe(11));
    vi.restoreAllMocks();

    openPopup();
    expect(screen.getByLabelText<HTMLInputElement>('Modifier').value).toBe('0');
    fireEvent.change(screen.getByLabelText('Modifier'), { target: { value: '' } });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(entry().modifierByHand).toBeUndefined();
    expect(entry().initiativeModifier).toBe(0);

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    fireEvent.click(screen.getByRole('button', { name: 'Roll initiative' }));
    await waitFor(() => expect(entry().initiative).toBe(16));
  });
});
