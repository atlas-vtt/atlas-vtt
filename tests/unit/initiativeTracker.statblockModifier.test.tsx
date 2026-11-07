// @vitest-environment jsdom
import React, { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { createInMemoryApp, parseFrontmatter } from '../mocks/inMemoryVault';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';

const rules = vi.hoisted(() => ({ current: { mode: 'turn-order', roll: '1d20', firstSide: 'players', modifier: { field: 'initiative' } } as InitiativeRules }));
vi.mock('../../src/app/initiative/useMapInitiativeRules', () => ({ useMapInitiativeRules: () => rules.current }));
const showNotice = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/ui/notice', () => ({ showNotice }));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
const played = vi.hoisted(() => ({ campaign: null as { campaign: { name: string } } | null }));
vi.mock('../../src/app/campaigns/usePlayedSystemCampaign', () => ({ usePlayedSystemCampaign: () => played.campaign }));
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

const SCENE = 'atlas-vtt/collections/5e/scenes/Road.atlasmap';
const CAPTAIN = 'statblocks/Bandit Captain.md';
const COMMONER = 'statblocks/Commoner.md';
const WOLF = 'statblocks/Wolf.md';
const SRD_CAPTAIN = 'statblocks/SRD Bandit Captain.md';
// As Fantasy Statblocks' Pathfinder 2e import writes a creature into a note's properties
const GOBLIN_PF2E = 'statblocks/Goblin Warrior.md';
// A TTRPG CLI note: the statblock in a fence, the note's own properties beside it
const GOBLIN_CLI = 'statblocks/Goblin.md';

function setup(): { app: App; store: ViewAtlasStore } {
  const { app, files } = createInMemoryApp({ files: {
    [CAPTAIN]: '---\nstatblock: true\nname: Bandit Captain\ninitiative: +5\n---\n',
    [COMMONER]: '---\nstatblock: true\nname: Commoner\nhp: 4\n---\n',
    [WOLF]: '```statblock\ncreature: Wolf\n```\n',
    [SRD_CAPTAIN]: '```statblock\ncreature: Bandit Captain\n```\n',
    [GOBLIN_PF2E]: '---\nstatblock: true\nlayout: Basic Pathfinder 2e Layout\nname: Goblin Warrior\nlevel: Creature -1\nmodifier: 5\n'
      + 'perception:\n  - name: Perception\n    desc: "Perception +5; darkvision"\n---\n',
    [GOBLIN_CLI]: '---\nstatblock: inline\ntags: [monster]\nstats: see below\n---\n'
      + '```statblock\nname: Goblin\nstats: [8, 14, 10, 10, 8, 8]\n```\n',
  } });
  // The notes' properties, as Obsidian's metadata cache reads them
  app.metadataCache.getFileCache = (file) => ({ frontmatter: parseFrontmatter(files.get(file.path) ?? '') });
  const store = createViewAtlasStore(app, 'initiative-modifier');
  store.getState().setMapPath(SCENE);
  store.setState({ mapLoaded: true, initiativeTrackerOpen: true });
  return { app, store };
}

function add(store: ViewAtlasStore, name: string, statblockPath?: string, ownModifier = 0): string {
  const token = store.getState().addToken({ kind: 'character', name, x: 0, y: 0, imagePath: `tokens/${name}.webp`, ...(statblockPath && { statblockPath }) });
  const tokenId = typeof token === 'string' ? token : Object.values(store.getState().objects.tokens).find((t) => t.kind === 'character' && t.name === name)!.id;
  return store.getState().addToInitiative({ ...initiativeEntryForToken(store.getState().objects.tokens[tokenId]!), initiativeModifier: ownModifier });
}

function show(app: App, store: ViewAtlasStore): void {
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store}><InitiativeTracker /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
}

const initiativeOf = (store: ViewAtlasStore, id: string): number | undefined =>
  store.getState().initiative.entries.find((entry) => entry.id === id)?.initiative;

afterEach(() => {
  vi.restoreAllMocks();
  rules.current = { mode: 'turn-order', roll: '1d20', firstSide: 'players', modifier: { field: 'initiative' } };
  showNotice.mockClear();
  played.campaign = null;
  delete (window as Window & { FantasyStatblocks?: unknown }).FantasyStatblocks;
});

describe('rolling initiative with the statblocks\' modifiers', () => {
  it('adds the linked statblock\'s modifier, keeps a hand-set one, and adds nothing where the statblock has none', async () => {
    const { app, store } = setup();
    let captain = '', commoner = '', veteran = '', plain = '';
    act(() => {
      captain = add(store, 'Captain', CAPTAIN);
      commoner = add(store, 'Commoner', COMMONER, 2);
      veteran = add(store, 'Veteran', CAPTAIN, -1);
      plain = add(store, 'Plain');
    });
    show(app, store);

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    fireEvent.click(screen.getByRole('button', { name: 'Roll initiative' }));
    await waitFor(() => expect(initiativeOf(store, captain)).toBe(16));
    expect(initiativeOf(store, commoner)).toBe(13);
    expect(initiativeOf(store, veteran)).toBe(10);
    expect(initiativeOf(store, plain)).toBe(11);
    expect(store.getState().initiative.entries.find((entry) => entry.id === captain)?.initiativeModifier).toBe(0);
  });

  it('rolls while Fantasy Statblocks still reads the vault, and says how many rolled without their statblock', async () => {
    Object.assign(window, { FantasyStatblocks: { isResolved: () => false, hasCreature: () => false, getBestiaryCreatures: () => [] } });
    const { app, store } = setup();
    let captain = '', wolf = '', ownWolf = '';
    act(() => {
      captain = add(store, 'Captain', CAPTAIN);
      wolf = add(store, 'Wolf', WOLF);
      // Its modifier is the GM's own, so nothing was missed
      ownWolf = add(store, 'Own Wolf', WOLF, 3);
    });
    show(app, store);

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    fireEvent.click(screen.getByRole('button', { name: 'Roll initiative' }));
    await waitFor(() => expect(initiativeOf(store, captain)).toBe(16));
    expect(initiativeOf(store, wolf)).toBe(11);
    expect(initiativeOf(store, ownWolf)).toBe(14);
    expect(showNotice).toHaveBeenCalledWith(expect.stringMatching(/still reading the vault: 1 combatant rolled without its statblock/));
  });

  it('rolls with the Perception of a Fantasy Statblocks Pathfinder import, the field typed with a capital (Discord, 2026-10-16)', async () => {
    rules.current = { mode: 'turn-order', roll: '1d20', firstSide: 'players', modifier: { field: 'Perception' } };
    const { app, store } = setup();
    let goblin = '';
    act(() => { goblin = add(store, 'Goblin', GOBLIN_PF2E); });
    show(app, store);

    vi.spyOn(Math, 'random').mockReturnValue(0);
    fireEvent.click(screen.getByRole('button', { name: 'Roll initiative' }));
    await waitFor(() => expect(initiativeOf(store, goblin)).toBe(6));
    expect(showNotice).not.toHaveBeenCalled();
  });

  it('rolls with the DEX of a fence statblock whose note holds other properties under the same keys', async () => {
    rules.current = { mode: 'turn-order', roll: '1d20', firstSide: 'players', modifier: { field: 'stats.dex' } };
    const { app, store } = setup();
    let goblin = '';
    act(() => { goblin = add(store, 'Goblin', GOBLIN_CLI); });
    show(app, store);

    vi.spyOn(Math, 'random').mockReturnValue(0);
    fireEvent.click(screen.getByRole('button', { name: 'Roll initiative' }));
    await waitFor(() => expect(initiativeOf(store, goblin)).toBe(3));
  });

  it('says how many combatants rolled without a modifier, which field it looked for and where to choose it', async () => {
    rules.current = { mode: 'turn-order', roll: '1d20', firstSide: 'players', modifier: { field: 'perception' } };
    const { app, store } = setup();
    act(() => {
      add(store, 'Captain', CAPTAIN);
      add(store, 'Commoner', COMMONER);
      add(store, 'Plain');
      // A note that is gone holds no number under any field: it is no setup mistake and is not counted
      add(store, 'Lost', 'statblocks/Deleted.md');
    });
    show(app, store);

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    fireEvent.click(screen.getByRole('button', { name: 'Roll initiative' }));
    await waitFor(() => expect(showNotice).toHaveBeenCalledTimes(1));
    expect(showNotice).toHaveBeenCalledWith(
      '2 combatants rolled without a modifier: their statblocks have no number under "perception". Choose the field in Collection settings → Default Widgets',
    );
  });

  it('points to the played campaign\'s game system where its rules apply', async () => {
    rules.current = { mode: 'turn-order', roll: '1d20', firstSide: 'players', modifier: { field: 'perception' } };
    played.campaign = { campaign: { name: 'Blue Mouth Caves' } };
    const { app, store } = setup();
    act(() => { add(store, 'Commoner', COMMONER); });
    show(app, store);

    fireEvent.click(screen.getByRole('button', { name: 'Roll initiative' }));
    await waitFor(() => expect(showNotice).toHaveBeenCalledTimes(1));
    expect(showNotice).toHaveBeenCalledWith(
      '1 combatant rolled without a modifier: its statblock has no number under "perception". The campaign Blue Mouth Caves sets the rules: choose the field in its Game System → Initiative',
    );
  });

  it('rolls 1d20+3 for a 5e Bandit Captain of Fantasy Statblocks\' SRD (DEX 16) by the D&D 5e rules', async () => {
    const { BUILT_IN_SYSTEM_PRESETS } = await import('../../src/app/gameSystems/builtInPresets');
    const { collectionInitiativeRules } = await import('../../src/app/gameSystems/initiativeRules');
    const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((p) => p.name === 'D&D 5e')!;
    rules.current = collectionInitiativeRules({ systemPresetId: dnd5e.id }, BUILT_IN_SYSTEM_PRESETS);
    // As Fantasy Statblocks' bundled SRD holds it: no initiative, the six scores as `stats`
    const banditCaptain = {
      name: 'Bandit Captain', path: SRD_CAPTAIN, source: '5e SRD', size: 'Medium', type: 'humanoid', ac: 15, hp: 65,
      hit_dice: '10d8 + 20', speed: '30 ft.', stats: [15, 16, 14, 14, 11, 14], cr: '2',
    };
    Object.assign(window, { FantasyStatblocks: { isResolved: () => true, hasCreature: () => false, getBestiaryCreatures: () => [banditCaptain] } });
    const { app, store } = setup();
    let captain = '';
    act(() => { captain = add(store, 'Captain', SRD_CAPTAIN); });
    show(app, store);

    vi.spyOn(Math, 'random').mockReturnValue(0);
    fireEvent.click(screen.getByRole('button', { name: 'Roll initiative' }));
    await waitFor(() => expect(initiativeOf(store, captain)).toBe(4));
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    fireEvent.click(screen.getByRole('button', { name: 'Roll initiative' }));
    await waitFor(() => expect(initiativeOf(store, captain)).toBe(23));
  });
});
