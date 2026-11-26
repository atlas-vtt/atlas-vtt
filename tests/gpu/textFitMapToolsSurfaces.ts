import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { App } from 'obsidian';
import { expect, vi } from 'vitest';
import { DRAW_MODES } from '../../src/app/annotations/annotationTypes';
import { GENERIC_LIGHT_PRESETS } from '../../src/app/gameSystems/lightPresets/generic';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import { HotkeyHelp } from '../../src/app/keyboard/HotkeyHelp';
import { emissionOf, lightPresetsOnMap } from '../../src/app/lighting/lightPresetChoice';
import type { WallToolSubMode } from '../../src/app/lighting/lightingTool';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { DrawToolBar } from '../../src/app/packages/components/toolbar/DrawToolBar';
import { FogToolBar } from '../../src/app/packages/components/toolbar/FogToolBar';
import { LightingToolBar } from '../../src/app/packages/components/toolbar/LightingToolBar';
import { LightingToolGroup } from '../../src/app/packages/components/toolbar/LightingToolGroup';
import { MeasureToolBar } from '../../src/app/packages/components/toolbar/MeasureToolBar';
import { MeasureToolGroup } from '../../src/app/packages/components/toolbar/MeasureToolGroup';
import { MEASURE_MODES } from '../../src/app/packages/components/toolbar/measureToolChoices';
import { MoveToolGroup } from '../../src/app/packages/components/toolbar/MoveToolGroup';
import { PinToolGroup } from '../../src/app/packages/components/toolbar/PinToolGroup';
import type { ToolGroupControls } from '../../src/app/packages/components/toolbar/ToolGroup';
import { LightPopoverHost } from '../../src/app/pixi/lighting/LightPopover';
import { LightZonePopoverHost } from '../../src/app/pixi/lighting/LightZonePopover';
import { doorMenuEntries, showLightMenu, type LightingMenuContext } from '../../src/app/pixi/lighting/lightingMenus';
import { openEditTokenModal } from '../../src/app/pixi/token-renderer/EditTokenModal';
import { BottomToolbarRow } from '../../src/app/react/components/BottomToolbarRow';
import { LightingSettingsPanel } from '../../src/app/react/components/command-palette/LightingSettingsPanel';
import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { closeContextMenuGlobal, ContextMenuProvider, openContextMenuGlobal } from '../../src/app/react/root/ContextMenuContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { emptyMapActions } from '../../src/app/selection/emptyMapMenu';
import { selectionMenu } from '../../src/app/selection/selectionMenu';
import { tokenActions } from '../../src/app/selection/tokenActionList';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { genericLight } from '../mocks/lights';
import { HP, STR } from '../mocks/resourceFixtures';
import { centreOf, mouse } from './realMouse';

/**
 * The map tools' surfaces for the text fit test: each mounts as its own GPU test mounts it, opens what a click
 * opens, and hands every state it reaches to `check`. The caller unmounts between surfaces.
 */

export type Check = (root: Element, state: string) => void;
export interface Surface { name: string; run: (check: Check) => Promise<void> }

const h = React.createElement;
const settle = (ms = 250): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const all = <T extends Element = HTMLElement>(selector: string): T[] => [...document.querySelectorAll<T>(selector)];

function mapStore(app: App, name: string): ViewAtlasStore {
  const store = createViewAtlasStore(app, `text-fit-${name}-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ isMapLoading: false });
  return store;
}

function appWithSettings(): { app: App; settings: SettingsService } {
  const { app } = createInMemoryApp({ files: {} });
  return { app, settings: new SettingsService(app) };
}

const uiOf = (app: App | undefined): AtlasUIContextValue =>
  ({ app, view: { serviceManager: { getEventBus: () => ({ on: vi.fn(), off: vi.fn(), emit: () => true }) } }, pixiApp: null, renderer: null }) as unknown as AtlasUIContextValue;

function withStore(app: App, store: ViewAtlasStore, child: React.ReactElement): React.ReactElement {
  return h('div', { className: 'atlas-vtt-plugin' },
    h(AtlasUIContext.Provider, { value: uiOf(app) }, h(ViewStoreProvider, { store, children: h(ContextMenuProvider, null, h(TooltipProvider, null, child)) })));
}

/** Presses every closed menu button under `scope` in turn, checking the menu it opens, and closes it again. */
async function eachMenuOf(scope: string, state: string, check: Check): Promise<void> {
  const buttons = all(`${scope} button[aria-haspopup]`);
  for (const [index, button] of buttons.entries()) {
    if (!button.isConnected || button.getAttribute('aria-disabled') === 'true' || (button as HTMLButtonElement).disabled) continue;
    act(() => { button.click(); });
    await settle();
    check(document.body, `${state}, menu ${index + 1}`);
    if (button.getAttribute('aria-expanded') === 'true') act(() => { button.click(); });
    act(() => { fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }); });
    await settle(150);
  }
}

type ToolMenu = (controls: ToolGroupControls) => React.ReactElement;
const TOOL_MENUS: ReadonlyArray<[string, ToolMenu, string]> = [
  ['move', (controls) => h(MoveToolGroup, controls), 'select'],
  ['measure', (controls) => h(MeasureToolGroup, controls), 'measure'],
  ['pin', (controls) => h(PinToolGroup, controls), 'pin'],
  ['lighting', (controls) => h(LightingToolGroup, controls), 'wall'],
];

async function toolMenus(check: Check): Promise<void> {
  for (const [name, menu, tool] of TOOL_MENUS) {
    const { app } = appWithSettings();
    const store = mapStore(app, name);
    store.setState({ activeTool: tool as never });
    store.getState().setSceneLighting({ enabled: true });
    const controls = { activeTool: tool, selectTool: () => undefined, menuOpen: true, toggleMenu: () => undefined, closeMenu: () => undefined } as unknown as ToolGroupControls;
    render(withStore(app, store, h('div', { className: 'atlas-vtt-toolbar', style: { position: 'fixed', left: 40, bottom: 20 } }, menu(controls))));
    await settle();
    check(document.body, `${name} menu`);
    if (name === 'lighting') {
      act(() => { store.getState().setLightingTool({ mode: 'rooms' }); store.getState().setRoomTool({ shape: 'brush' }); });
      await settle();
      check(document.body, 'lighting menu, room brush');
      act(() => { store.getState().setLightingTool({ mode: 'explored-memory' }); store.getState().setExploredBrush({ shape: 'brush' }); });
      await settle();
      check(document.body, 'lighting menu, memory brush');
    }
    cleanup();
  }
}

const LIGHTING_MODES: readonly WallToolSubMode[] = ['rooms', 'draw', 'place-light', 'light-zone', 'level-surface', 'explored-memory'];

async function toolBars(check: Check): Promise<void> {
  const { app } = appWithSettings();
  const store = mapStore(app, 'bars');
  store.getState().setSceneLighting({ enabled: true });
  render(withStore(app, store, h(BottomToolbarRow, {
    start: h('div', { className: 'atlas-vtt-toolbar', style: { width: 104, height: 48 } }),
    options: h(React.Fragment, null, h(LightingToolBar), h(MeasureToolBar, { playerView: false }), h(DrawToolBar), h(FogToolBar)),
    children: h('div', { className: 'atlas-vtt-toolbar atlas-main-toolbar', style: { width: 420, height: 58, boxSizing: 'border-box' } }),
  })));
  const states: Array<[string, () => void]> = [
    ...LIGHTING_MODES.map((mode): [string, () => void] => [`lighting ${mode}`, () => {
      store.setState({ activeTool: 'wall' });
      store.getState().setLightingTool({ mode });
    }]),
    ...MEASURE_MODES.map(({ value }): [string, () => void] => [`measure ${value}`, () => {
      store.setState({ activeTool: 'measure' });
      store.getState().setMeasureTool({ mode: value });
    }]),
    ...DRAW_MODES.map((mode): [string, () => void] => [`draw ${mode}`, () => {
      store.setState({ activeTool: 'draw' });
      store.getState().setDrawTool({ mode });
    }]),
    ['fog', () => { store.setState({ activeTool: 'fog' }); }],
  ];
  for (const [state, enter] of states) {
    act(enter);
    await settle(400);
    check(document.body, `${state} bars`);
    await eachMenuOf('.atlas-tool-bars', `${state} bars`, check);
  }
}

async function lightPopover(check: Check): Promise<void> {
  const { app } = appWithSettings();
  const store = mapStore(app, 'light');
  store.getState().setMapPath('maps/popover.atlasmap');
  store.getState().setSceneLighting({ enabled: true });
  const torch = store.getState().addLight({ x: 400, y: 300, emission: { ...genericLight('torch'), kind: 'torch' } });
  render(withStore(app, store, h(LightPopoverHost)));
  act(() => { store.getState().openLightPopover(torch); });
  await settle();
  check(document.body, 'light popover');
  const flicker = document.querySelector<HTMLElement>('.atlas-vtt-plugin [role="combobox"]');
  if (flicker) {
    act(() => { flicker.click(); });
    await settle();
    check(document.body, 'light popover, flicker list');
  }
}

async function lightZonePopover(check: Check): Promise<void> {
  const { app } = appWithSettings();
  const store = mapStore(app, 'zone');
  store.getState().setMapPath('maps/zones.atlasmap');
  store.getState().setSceneLighting({ enabled: true, ambient: 1 });
  const cave = store.getState().addLightZone({ polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], ambient: 0 });
  render(withStore(app, store, h(LightZonePopoverHost)));
  act(() => { store.getState().openLightZonePopover(cave); });
  await settle();
  check(document.body, 'light zone popover');
}

async function lightingSettings(check: Check): Promise<void> {
  const { app } = appWithSettings();
  const store = mapStore(app, 'lighting-page');
  store.getState().setSceneLighting({ enabled: true });
  render(h('div', { className: 'atlas-vtt-plugin', style: { padding: 40 } },
    h('div', { className: 'atlas-command-palette-container atlas-command-palette-container--expanded' },
      h('div', { className: 'atlas-command-palette-options' },
        h(AtlasUIContext.Provider, { value: uiOf(undefined) }, h(ViewStoreProvider, { store, children: h(LightingSettingsPanel) }))))));
  await settle();
  check(document.body, 'lighting settings');
}

const TORCH = emissionOf(lightPresetsOnMap(GENERIC_LIGHT_PRESETS, { unitType: 'feet', ruleDistance: 5 }, Infinity).find((preset) => preset.id === 'torch')!);
const MIRABEL: Character = {
  id: 't', kind: 'character', name: 'Mirabel', imagePath: 'm.png', x: 0, y: 0,
  resources: { hp: { current: 6, max: 6 }, str: { current: 12, max: 12 } }, vision: { enabled: true, range: 60 }, light: TORCH,
};

async function editToken(check: Check): Promise<void> {
  const { app } = appWithSettings();
  const store = mapStore(app, 'edit-token');
  store.setState({ objects: { ...store.getState().objects, tokens: { t: MIRABEL } } });
  act(() => { openEditTokenModal(MIRABEL, store, app, [HP, STR]); });
  await expect.poll(() => document.querySelector('.atlas-edit-token-modal')).not.toBeNull();
  await settle();
  check(document.querySelector('.atlas-edit-token-modal')!, 'edit token');
  act(() => { document.querySelector<HTMLElement>('.atlas-edit-token-modal .atlas-modal-footer button')!.click(); });
}

async function cheatSheet(check: Check): Promise<void> {
  render(h(HotkeyHelp, { onClose: () => undefined }));
  await settle(400);
  check(document.body, 'cheat sheet');
}

const CONDITIONS: ConditionDefinition[] = [
  { id: 'frightened', name: 'Frightened', color: '#e93147', valued: true },
  { id: 'restrained', name: 'Restrained', color: '#086ddd' },
  { id: 'incapacitated', name: 'Incapacitated', color: '#08b94e' },
];
const GOBLIN: Character = { id: 'goblin', kind: 'character', name: 'Goblin', imagePath: 'goblin.png', x: 70, y: 70, size: 1, resources: { hp: { current: 7, max: 9 } } };

/** Opens a menu and every submenu it has, one by one. */
async function menuWithSubmenus(open: () => void, state: string, check: Check): Promise<void> {
  act(() => { open(); });
  await settle();
  check(document.body, state);
  const triggers = all('.atlas-ctx-menu [aria-haspopup="menu"]').map((trigger) => trigger.textContent ?? '');
  for (const name of triggers) {
    const trigger = all('.atlas-ctx-menu [aria-haspopup="menu"]').find((element) => element.textContent === name);
    if (!trigger) continue;
    const point = centreOf(trigger);
    await mouse.hover(point.x, point.y);
    await settle(300);
    check(document.body, `${state}, ${name}`);
  }
  act(() => { closeContextMenuGlobal(); });
  await settle(300);
}

async function canvasMenus(check: Check): Promise<void> {
  const { app } = appWithSettings();
  const store = mapStore(app, 'menus');
  store.setState({ activeTool: 'select', isGMView: true, objects: { ...store.getState().objects, tokens: { goblin: GOBLIN } } });
  const door = store.getState().addWall({ type: 'door', p1: { x: 0, y: 0 }, p2: { x: 70, y: 0 } });
  const light = store.getState().addLight({ x: 400, y: 300, emission: { ...TORCH, kind: 'torch' } });
  render(withStore(app, store, h('div', { style: { position: 'fixed', inset: 0 } })));
  await settle();
  const at = { x: 200, y: 160 };
  const host = {
    store, app, grid: {} as GridSystem, isPlayerView: false, movement: undefined, touch: false,
    conditions: () => CONDITIONS, resources: () => [HP], editToken: () => undefined, changeResource: () => undefined, paste: () => undefined, preview: () => undefined,
  };
  await menuWithSubmenus(() => openContextMenuGlobal(selectionMenu(tokenActions(host, GOBLIN, at)), at), 'token menu', check);
  await menuWithSubmenus(() => openContextMenuGlobal(selectionMenu(emptyMapActions(store, null, at)), at), 'empty map menu', check);
  await menuWithSubmenus(() => openContextMenuGlobal(doorMenuEntries(store, door), at), 'door menu', check);
  await menuWithSubmenus(() => showLightMenu({ store } as unknown as LightingMenuContext, light, at.x, at.y), 'light menu', check);
}

const combatant = (id: string, name: string): Character => ({ id, kind: 'character', name, imagePath: 'goblin.png', x: 0, y: 0, resources: { hp: { current: 4, max: 7 } } });
const entryOf = (tokenId: string, order: number, initiative: number): InitiativeEntry => ({
  id: `entry-${tokenId}`, tokenId, name: tokenId, initiative, initiativeModifier: 0, imagePath: '', isActive: order === 0, isNPC: true, order,
});

async function initiative(check: Check): Promise<void> {
  for (const names of [false, true]) {
    const { app, settings } = appWithSettings();
    settings.setCompactInitiative(names);
    const store = mapStore(app, 'initiative');
    store.setState({
      initiativeTrackerOpen: true,
      objects: { ...store.getState().objects, tokens: { a: combatant('a', 'Goblin Archer of the Western Hills'), b: combatant('b', 'Rat') } },
      initiative: { ...createDefaultInitiativeState(), isActive: true, entries: [entryOf('a', 0, 18), entryOf('b', 1, 12)] },
    });
    render(withStore(app, store, h(InitiativeTracker)));
    await settle();
    const state = names ? 'initiative with names' : 'initiative';
    check(document.body, state);
    const card = document.querySelector('.atlas-initiative-card');
    if (card) {
      act(() => { fireEvent.contextMenu(card, { clientX: 300, clientY: 200 }); });
      await settle();
      check(document.body, `${state}, card menu`);
      act(() => { closeContextMenuGlobal(); });
      await settle(300);
    }
    await eachMenuOf('.atlas-initiative-tracker', state, check);
    cleanup();
  }
}

export const SURFACES: readonly Surface[] = [
  { name: 'tool menus', run: toolMenus },
  { name: 'tool bars', run: toolBars },
  { name: 'light popover', run: lightPopover },
  { name: 'light zone popover', run: lightZonePopover },
  { name: 'lighting settings', run: lightingSettings },
  { name: 'edit token', run: editToken },
  { name: 'cheat sheet', run: cheatSheet },
  { name: 'canvas menus', run: canvasMenus },
  { name: 'initiative', run: initiative },
];
