import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { initiativeEntryForToken } from '../../src/app/stores/initiativeEntries';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import type { Character } from '../../src/app/types';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';
import { createInMemoryApp, parseFrontmatter } from '../mocks/inMemoryVault';

const collection = vi.hoisted(() => ({ rules: { mode: 'turn-order', roll: '1d20', firstSide: 'players' } as InitiativeRules }));
const menu = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { menu.entries = entries; },
}));
vi.mock('../../src/app/initiative/useMapInitiativeRules', () => ({ useMapInitiativeRules: () => collection.rules }));
vi.mock('../../src/app/react/components/InitiativeCard', () => ({
  InitiativeCard: ({ entry, onContextMenu }: { entry: InitiativeEntry; onContextMenu: (event: React.MouseEvent, entry: InitiativeEntry, element: HTMLElement) => void }) =>
    <div data-combatant={entry.tokenId} onContextMenu={(event) => onContextMenu(event, entry, event.currentTarget)} />,
}));
vi.mock('../../src/app/react/components/StatblockHoverPreview', () => ({
  StatblockHoverPreview: () => null,
  useStatblockHoverPreview: () => [
    { hoveredEntry: null, isVisible: false, isClosing: false, position: null, anchorRect: null },
    { showPreview: vi.fn(), closePreview: vi.fn(), clearPreview: vi.fn() },
  ],
}));

import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';

const NOTE = 'Bestiary/Goblin.md';

function setup(fields: string): ReturnType<typeof createInMemoryApp> & ReturnType<typeof render>
  & { store: ReturnType<typeof createViewAtlasStore>; roll: () => void } {
  const memory = createInMemoryApp({ files: { [NOTE]: `\`\`\`statblock\nname: Goblin\n${fields}\n\`\`\`\n` } });
  vi.mocked(memory.app.metadataCache.getFileCache).mockImplementation((file) => ({ frontmatter: parseFrontmatter(memory.files.get(file.path) ?? '') }));
  const store = createViewAtlasStore(memory.app, 'initiative-modifiers');
  const token: Character = { id: 'goblin', kind: 'character', name: 'Goblin', x: 0, y: 0, imagePath: '', statblockPath: NOTE };
  store.setState({
    persistenceEnabled: false, mapPath: 'atlas-vtt/scenes/Cave.atlasmap', mapLoaded: true, isMapLoading: false,
    objects: { ...store.getState().objects, tokens: { goblin: token } }, initiativeTrackerOpen: true,
  });
  store.getState().addToInitiative(initiativeEntryForToken(token));
  const context = { app: memory.app, view: { viewId: 'initiative-modifiers' }, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
  const rendered = render(
    <AtlasUIContext.Provider value={context}>
      <ViewStoreProvider store={store}><InitiativeTracker /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  const roll = (): void => fireEvent.click(rendered.container.querySelector<HTMLButtonElement>('.atlas-initiative-tracker__btn')!);
  return { ...memory, store, roll, ...rendered };
}

beforeEach(() => {
  collection.rules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
  menu.entries = [];
  Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => [], hasCreature: () => false } });
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  cleanup();
  delete (window as Window & { FantasyStatblocks?: unknown }).FantasyStatblocks;
  vi.restoreAllMocks();
});

describe('initiative from linked statblocks (issue #333)', () => {
  it('adds the modifier from a statblock code fence to the initiative roll', async () => {
    const { store, roll } = setup('modifier: 3');
    roll();
    await waitFor(() => expect(store.getState().initiative.entries[0]?.initiative).toBe(14));
  });

  it('reads a signed modifier from frontmatter without a parsed bestiary entry', async () => {
    const { files, store, roll } = setup('modifier: 99');
    files.set(NOTE, '---\nstatblock: true\nname: Goblin\nmodifier: -2\n---\n');
    roll();
    await waitFor(() => expect(store.getState().initiative.entries[0]?.initiative).toBe(9));
  });

  it('reads initiative automatically when the statblock has no modifier', async () => {
    const { store, roll } = setup('initiative: "+2"');
    roll();
    await waitFor(() => expect(store.getState().initiative.entries[0]?.initiative).toBe(13));
  });

  it('reads a parsed bestiary entry, with current frontmatter taking precedence', async () => {
    Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => [{ name: 'Goblin', path: NOTE, modifier: 3 }], hasCreature: () => false } });
    const { files, store, roll } = setup('modifier: 99');
    files.set(NOTE, '---\nstatblock: true\nname: Goblin\nmodifier: -1\n---\n');
    roll();
    await waitFor(() => expect(store.getState().initiative.entries[0]?.initiative).toBe(10));
  });

  it('preserves a saved modifier on a combatant without a linked statblock', async () => {
    const { store, roll } = setup('modifier: 99');
    const { statblockPath: _path, ...unlinked } = store.getState().objects.tokens.goblin as Character;
    act(() => {
      store.setState({ objects: { ...store.getState().objects, tokens: { goblin: unlinked } } });
      store.getState().updateInitiativeEntry(store.getState().initiative.entries[0]!.id, { initiativeModifier: 2 });
    });
    roll();
    await waitFor(() => expect(store.getState().initiative.entries[0]?.initiative).toBe(13));
  });

  it('uses the configured field for both the button and the individual card menu', async () => {
    collection.rules = { ...collection.rules, modifierField: 'combat.bonus' };
    const { store, roll, container } = setup('modifier: 99\ncombat:\n  bonus: -3');
    roll();
    await waitFor(() => expect(store.getState().initiative.entries[0]?.initiative).toBe(8));
    await waitFor(() => expect(container.querySelector<HTMLButtonElement>('.atlas-initiative-tracker__btn')!.disabled).toBe(false));
    act(() => store.getState().updateInitiativeEntry(store.getState().initiative.entries[0]!.id, { initiative: 0 }));
    fireEvent.contextMenu(container.querySelector('[data-combatant="goblin"]')!);
    const item = menu.entries.find((entry) => entry.type === 'item' && entry.label === 'Roll Initiative');
    if (item?.type !== 'item') throw new Error('Roll Initiative is missing from the card menu');
    await act(async () => { void item.onClick?.(); });
    await waitFor(() => expect(store.getState().initiative.entries[0]?.initiative).toBe(8));
  });

  it('rereads changes before every roll, and unlinking leaves no previous bonus', async () => {
    const { files, store, roll, container } = setup('modifier: 3');
    roll();
    await waitFor(() => expect(store.getState().initiative.entries[0]?.initiative).toBe(14));
    await waitFor(() => expect(container.querySelector<HTMLButtonElement>('.atlas-initiative-tracker__btn')!.disabled).toBe(false));
    files.set(NOTE, '```statblock\nname: Goblin\nmodifier: 5\n```');
    roll();
    await waitFor(() => expect(store.getState().initiative.entries[0]?.initiative).toBe(16));
    await waitFor(() => expect(container.querySelector<HTMLButtonElement>('.atlas-initiative-tracker__btn')!.disabled).toBe(false));
    const { statblockPath: _path, ...unlinked } = store.getState().objects.tokens.goblin as Character;
    act(() => store.setState({ objects: { ...store.getState().objects, tokens: { goblin: unlinked } } }));
    roll();
    await waitFor(() => expect(store.getState().initiative.entries[0]?.initiative).toBe(11));
  });

  it('reads a shared note once and applies the modifier once per combatant', async () => {
    const { app, store, roll } = setup('modifier: 3');
    const clone: Character = { ...store.getState().objects.tokens.goblin as Character, id: 'goblin-2' };
    act(() => {
      store.setState({ objects: { ...store.getState().objects, tokens: { ...store.getState().objects.tokens, 'goblin-2': clone } } });
      store.getState().addToInitiative({ ...initiativeEntryForToken(clone), initiativeModifier: 9 });
    });
    roll();
    await waitFor(() => expect(store.getState().initiative.entries.map((entry) => entry.initiative)).toEqual([14, 14]));
    expect(app.vault.cachedRead).toHaveBeenCalledTimes(1);
  });

  it.each(['modifier: invalid', 'modifier: 1d6+2', 'other: 7'])('uses no modifier for invalid or missing data (%s)', async (fields) => {
    const { store, roll } = setup(fields);
    roll();
    await waitFor(() => expect(store.getState().initiative.entries[0]?.initiative).toBe(11));
  });

  it('does not apply a delayed statblock read after switching scenes', async () => {
    const { app, store, roll, container } = setup('modifier: 3');
    let finish!: (content: string) => void;
    vi.spyOn(app.vault, 'cachedRead').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    roll();
    await waitFor(() => expect(app.vault.cachedRead).toHaveBeenCalledOnce());
    act(() => store.setState({ mapPath: 'atlas-vtt/scenes/Other.atlasmap' }));
    await act(async () => finish('```statblock\nname: Goblin\nmodifier: 3\n```'));
    await waitFor(() => expect(container.querySelector<HTMLButtonElement>('.atlas-initiative-tracker__btn')!.disabled).toBe(false));
    expect(store.getState().initiative.entries[0]?.initiative).toBe(0);
  });
});
