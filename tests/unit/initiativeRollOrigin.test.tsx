import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform, TFile } from 'obsidian';
import { DEFAULT_DICE_RULES } from '../../src/app/gameSystems/diceRules';
import { DiceTool } from '../../src/app/tools/DiceTool';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { MAP_A, MAP_B, SCENE_B_TOKENS, lastCard, sceneState, setupPlayerDice, type PlayerDiceHarness } from '../helpers/playerDiceRolls';

vi.mock('../../src/app/atlas-view', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
vi.mock('../../src/app/initiative/useMapInitiativeRules', () => ({
  useMapInitiativeRules: () => ({ mode: 'turn-order', roll: '1d20', firstSide: 'players' }),
}));
vi.mock('../../src/app/react/ViewStoreContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/ViewStoreContext')>(),
  useAtlasStore: (selector: (value: unknown) => unknown) => selector(gm.state),
}));
// jsdom has no WebGL: the player window shows result cards.
vi.mock('../../src/app/dice3d/stagePool', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/dice3d/stagePool')>(),
  canShowDice: (): boolean => true,
}));

import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';

const WOLF = 'statblocks/Wolf.md';
const gm = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));

/** The GM's map view with scene `mapPath`: one token `wolf` in initiative, linked to the wolf statblock. */
function gmScene(mapPath: string, name: string): Record<string, unknown> {
  return {
    mapPath, mapLoaded: true, isMapLoading: false, initiativeTrackerOpen: true,
    initiative: { isActive: false, round: 0, entries: [
      { id: `entry-${name}`, tokenId: 'wolf', name, initiative: 12, initiativeModifier: 0, isActive: false, isNPC: true, order: 0, statblockPath: WOLF, imagePath: '' },
    ] },
    objects: { tokens: { wolf: { id: 'wolf', kind: 'character', name, x: 0, y: 0, imagePath: '', statblockPath: WOLF } } },
    tokenSettings: { showInstanceBadges: true },
    ...Object.fromEntries(['removeFromInitiative', 'rollAllInitiative', 'rollEntryInitiative', 'nextTurn', 'previousTurn', 'reorderInitiative',
      'moveToFront', 'moveToBack', 'startCombat', 'endCombat', 'updateInitiativeEntry', 'updateTokens', 'setInitiativeSitsOut', 'resetInitiative',
    ].map((action) => [action, vi.fn()])),
  };
}

let player: PlayerDiceHarness;
let origins: unknown[];

/** The GM's tracker, with a dice tool rolling onto the bus the player window follows. */
function renderTracker(): { rerender: () => void } {
  const tool = new DiceTool(player.bus, () => DEFAULT_DICE_RULES, { random: () => 0.5, rollId: () => 'roll-1', roller: () => 'GM', onFormulaError: vi.fn() });
  const rollDice = tool.rollDice.bind(tool);
  vi.spyOn(tool, 'rollDice').mockImplementation((formula, source, origin) => { origins.push(origin); return rollDice(formula, source, origin); });
  const app = Object.assign(player.app, {
    plugins: { plugins: { 'obsidian-5e-statblocks': { manager: {
      getAllLayouts: () => [],
      getDefaultLayout: () => ({ name: 'Basic', id: 'basic', blocks: [{ type: 'property', id: 'bite', properties: ['bite'], display: 'Bite' }] }),
    } } } },
  });
  Object.assign(app.workspace, {
    getLeavesOfType: () => [{ view: { viewId: 'view-1', serviceManager: { getToolController: () => ({ getDiceTool: () => tool }) } } }],
  });
  const vault = app.vault as unknown as { getAbstractFileByPath: (path: string) => unknown };
  const lookUp = vault.getAbstractFileByPath.bind(vault);
  vault.getAbstractFileByPath = (path: string) => (path === WOLF ? new TFile(WOLF) : lookUp(path));
  const context = { app, view: { viewId: 'view-1' }, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
  const tree = (): React.ReactElement => <AtlasUIContext.Provider value={context}><InitiativeTracker /></AtlasUIContext.Provider>;
  const { rerender } = render(tree());
  return { rerender: () => rerender(tree()) };
}

beforeEach(() => {
  Platform.isMacOS = true;
  origins = [];
  gm.state = gmScene(MAP_A, 'Wolf');
  player = setupPlayerDice();
  Object.assign(window, { FantasyStatblocks: {
    getBestiaryCreatures: () => [{ name: 'Wolf', path: WOLF, bite: '1d6+2' }],
    hasCreature: () => false,
    isResolved: () => true,
  } });
});

afterEach(() => {
  cleanup();
  act(() => player.service.destroy());
  Platform.isMacOS = false;
  delete (window as Window & { FantasyStatblocks?: unknown }).FantasyStatblocks;
  vi.restoreAllMocks();
});

describe('a statblock preview kept open from the initiative tracker', () => {
  it('rolls for the scene it was opened in, and the players see only the numbers on another scene', async () => {
    const tracker = renderTracker();
    fireEvent.mouseMove(document.querySelector('.atlas-initiative-card')!, { metaKey: true });
    await waitFor(() => expect(document.querySelector('.statblock-hover-preview .atlas-dice-link')).not.toBeNull());

    // The GM moves on to scene B, whose token has the same id; players are shown B.
    gm.state = gmScene(MAP_B, 'Bone Hound');
    act(() => tracker.rerender());
    act(() => player.store.setState(sceneState(MAP_B, SCENE_B_TOKENS)));
    act(() => player.service.presentCanvas(player.sourceFor(), 'scene-b'));

    act(() => document.querySelector<HTMLElement>('.statblock-hover-preview .atlas-dice-link')!.click());
    expect(origins).toEqual([{ viewId: 'view-1', mapPath: MAP_A, tokenId: 'wolf' }]);

    const card = lastCard(player.doc);
    expect(card?.textContent).toMatch(/\d/);
    expect(card?.textContent).not.toMatch(/Wolf|Bone Hound|Bite/);
    expect(card?.querySelector('img')).toBeNull();
  });
});
