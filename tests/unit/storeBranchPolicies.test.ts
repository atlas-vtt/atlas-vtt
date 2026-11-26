// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sceneFileHarness, type SceneFileHarness } from '../helpers/sceneFileHarness';
import { PLAIN_SCENE_PATH, RICH_SCENE_PATH, plainSceneFile, richSceneFile } from '../fixtures/sceneFiles';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { getHistoryStore, runUntracked } from '../../src/app/stores/history';
import type AtlasVTTPlugin from '../../main';

/**
 * What becomes of each branch of a view store's state, as Atlas shows it: the keys a scene file holds
 * (in the order it holds them), what a map switch puts back, and how deep undo looks into a branch.
 * Every other key is the view's own: never saved, kept across scenes, never undone.
 */
const FILE_KEYS = [
  'schema', 'version', 'mapPath', 'background', 'levels', 'viewedLevel', 'grid', 'objects', 'camera', 'widgetValues', 'widgetSettings',
  'dmNotePath', 'tokenSettings', 'initiative', 'initiativeTrackerOpen', 'diceLog', 'pinnedNotePreviews', 'lootRoller', 'lighting',
  'exploredMask', 'exploredMasks', 'playerFrames', 'sound', 'roomSizes',
];

/** Saved inside each level of `levels`, never under a key of its own. */
const SAVED_INSIDE_LEVELS = ['levelAlignments'];

const CLEARED_ON_MAP_SWITCH: Record<string, unknown> = {
  objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, audios: {} },
  grid: { enabled: true, visible: true, snapToGrid: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5, lineType: 'solid', lineWidth: 1 },
  camera: { x: 0, y: 0, scale: 1 },
  selectedIds: [],
  dmNotePath: null,
  widgetSettings: { widgets: {}, globalVisible: true, position: 'top', scale: 1 },
  widgetValues: {},
  pinnedNotePreviews: {},
  lootRoller: { open: false, disabledViews: [], excludedRarities: [], count: 1, pane: 'results' },
  lighting: { enabled: false, ambient: 0.1 },
  playerFrames: [],
  sound: null,
  roomSizes: undefined,
  exploredMask: null,
  exploredMasks: undefined,
  exploredEdits: 0,
  turnMoves: {},
  levels: undefined,
  levelAlignments: undefined,
  viewedLevel: null,
};

const UNDO_DEPTH: Record<string, 0 | 1 | 2> = {
  objects: 2, grid: 0, background: 0, widgetValues: 1, exploredEdits: 0, partyValues: 1, levelAlignments: 1, turnMoves: 1,
};

/** Never saved, and a load keeps what the view holds even where the file has them. */
const SESSION_ONLY = { exploredEdits: 7, partyValues: { 'pc:hp': 3 }, turnMoves: { tok_rogue: { distance: 30, turn: 2 } }, fightsStarted: 4, exploredForgotten: 2 };

const VIEW_OWN = [
  'mapLoadingProgress', 'mapLoadingMessage', 'persistenceEnabled', 'mapLoaded', 'isMapLoading', 'fightsStarted', 'exploredForgotten', '_audioDirty',
  'isPlayerView', 'isGMView', 'selectionMode', 'activeTool', 'heldRulerFrom', 'isDragging', 'plugin', 'roomTool', 'tableMode',
  'isGridSettingsOpen', 'isDMScreenOpen', 'dmScreenPage', 'isGridAlignmentOpen', 'isFloorPositioning', 'isDiceLogOpen', 'isHotkeyHelpOpen',
  'isDocsOpen', 'isAssetManagerOpen', 'assetManagerInitialTab', 'assetManagerAddsCombatants', 'assetManagerArmarium', 'isCommandPaletteOpen',
  'commandPalettePage', 'isDiceTrayOpen', 'lightPopover', 'lightZonePopover', 'levelLinkPopover', 'levelSurfacePopover', 'measurePopover',
  'measureTool', 'drawTool', 'fogTool', 'lightingTool', 'toolSwitches', 'heldTokens', 'exploredBrush', 'isToolbarEditing', 'dungeonGenerator',
  'roofsHidden', 'selectMore', 'conditionsShownEntry',
];

const KNOWN_KEYS = new Set([...FILE_KEYS, ...SAVED_INSIDE_LEVELS, ...Object.keys(CLEARED_ON_MAP_SWITCH), ...Object.keys(UNDO_DEPTH), ...Object.keys(SESSION_ONLY), ...VIEW_OWN]);

type State = Record<string, unknown>;
const stateOf = (store: ViewAtlasStore): State => store.getState() as unknown as State;
const dataKeys = (state: State): string[] => Object.keys(state).filter((key) => typeof state[key] !== 'function');

function sceneFiles(): Record<string, string> {
  return { [RICH_SCENE_PATH]: JSON.stringify(richSceneFile()), [PLAIN_SCENE_PATH]: JSON.stringify(plainSceneFile()) };
}

async function opened(path: string, files = sceneFiles()): Promise<SceneFileHarness> {
  const harness = sceneFileHarness(files);
  await harness.open(path);
  return harness;
}

/** The scene's file once the store has saved it again without a change. */
async function resaved(harness: SceneFileHarness, path: string): Promise<string> {
  harness.store.setState({});
  await harness.save();
  return harness.files.get(path)!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('every branch of a view store', () => {
  it('has a known policy, in a new view, a loaded scene and after a map switch', async () => {
    const harness = await opened(RICH_SCENE_PATH);
    const { store } = harness;
    const seen = new Set(dataKeys(stateOf(store)));
    store.getState().setMapLoading(true, 10, 'Loading');
    store.getState().holdRuler();
    store.getState().forgetOtherLevelsExplored();
    store.getState().startCombat();
    for (const key of dataKeys(stateOf(store))) seen.add(key);
    store.getState().clearMapState();
    for (const key of dataKeys(stateOf(store))) seen.add(key);
    const { app } = createInMemoryApp();
    const withPlugin = createViewAtlasStore(app, 'with-plugin', {} as AtlasVTTPlugin, true);
    for (const key of dataKeys(stateOf(withPlugin))) seen.add(key);

    expect([...seen].filter((key) => !KNOWN_KEYS.has(key))).toEqual([]);
  });
});

describe('what a scene file holds', () => {
  it('holds the saved branches of a scene in the order Atlas has always written them', async () => {
    const harness = await opened(RICH_SCENE_PATH);
    const saved = JSON.parse(await resaved(harness, RICH_SCENE_PATH)) as { state: State };
    expect(Object.keys(saved.state)).toEqual(FILE_KEYS);
  });

  it.each([
    ['a scene of several levels with everything', RICH_SCENE_PATH, './sceneFiles/richScene.saved.json'],
    ['a scene of one level', PLAIN_SCENE_PATH, './sceneFiles/plainScene.saved.json'],
  ])('saves %s byte for byte as before, and the same again once reopened', async (_name, path, snapshot) => {
    const first = await opened(path);
    const bytes = await resaved(first, path);
    await expect(bytes).toMatchFileSnapshot(snapshot);

    const reopened = await opened(path, { ...sceneFiles(), [path]: bytes });
    expect(await resaved(reopened, path)).toBe(bytes);
  });

  it('gives back every saved branch as it was once saved and opened again', async () => {
    const first = await opened(RICH_SCENE_PATH);
    const bytes = await resaved(first, RICH_SCENE_PATH);
    const reopened = await opened(RICH_SCENE_PATH, { ...sceneFiles(), [RICH_SCENE_PATH]: bytes });

    const before = stateOf(first.store);
    const after = stateOf(reopened.store);
    for (const key of [...FILE_KEYS, ...SAVED_INSIDE_LEVELS]) {
      expect(after[key], key).toEqual(before[key]);
    }
    expect(before.levelAlignments).toBeDefined();
    expect(before.viewedLevel).toBe('level_cellar');
  });

  it('never brings the branches a view counts for itself', async () => {
    const harness = await opened(RICH_SCENE_PATH);
    const kept = { exploredEdits: 1, partyValues: { 'pc:hp': 9 }, turnMoves: {}, fightsStarted: 1, exploredForgotten: 1, viewedLevel: 'level_ground' };
    runUntracked(harness.store, () => harness.store.setState(kept));
    harness.files.set(RICH_SCENE_PATH, JSON.stringify({ version: 5, state: { ...richSceneFile().state, ...SESSION_ONLY, viewedLevel: 'level_cellar' } }));

    await harness.store.rehydrateFromFile();

    const state = stateOf(harness.store);
    for (const [key, value] of Object.entries(kept)) expect(state[key], key).toEqual(value);
  });
});

describe('a map switch', () => {
  it('puts back the branches of the scene and keeps every other as it was', async () => {
    const { store } = await opened(RICH_SCENE_PATH);
    runUntracked(store, () => store.setState({ selectedIds: ['tok_rogue'], exploredEdits: 3, turnMoves: { tok_rogue: { distance: 5, turn: 1 } }, partyValues: { 'pc:hp': 2 } }));
    const before = { ...stateOf(store) };

    store.getState().clearMapState();

    const after = stateOf(store);
    // The tracker follows the tokens that left with the scene (`followTokensInTracker`)
    expect(after.initiative).toEqual({ ...(before.initiative as object), entries: [] });
    for (const key of new Set([...dataKeys(before), ...dataKeys(after)])) {
      if (key === 'initiative') continue;
      if (key in CLEARED_ON_MAP_SWITCH) {
        expect(Object.hasOwn(after, key), key).toBe(true);
        expect(after[key], key).toStrictEqual(CLEARED_ON_MAP_SWITCH[key]);
      } else {
        expect(Object.hasOwn(after, key), key).toBe(Object.hasOwn(before, key));
        expect(after[key], key).toBe(before[key]);
      }
    }
  });
});

describe('undo', () => {
  type Record3 = { a: { x: number; y: number }; b: number };
  const start: Record3 = { a: { x: 1, y: 1 }, b: 1 };

  /** The branch after a GM edit of `a.x`, an edit of Atlas itself of `a.y` and `b`, and an undo. */
  function undoneAfterOwnEdits(store: ViewAtlasStore, key: string): unknown {
    runUntracked(store, () => store.setState({ [key]: start }));
    getHistoryStore(store)!.getState().clear();
    store.setState({ [key]: { ...start, a: { x: 2, y: 1 } } });
    const steps = getHistoryStore(store)!.getState().pastStates.length;
    runUntracked(store, () => store.setState({ [key]: { a: { x: 2, y: 3 }, b: 3 } }));
    getHistoryStore(store)!.getState().undo();
    return steps === 0 ? null : stateOf(store)[key];
  }

  const undoneAt: Record<0 | 1 | 2, Record3> = {
    0: { a: { x: 1, y: 1 }, b: 1 },
    1: { a: { x: 1, y: 1 }, b: 3 },
    2: { a: { x: 1, y: 3 }, b: 3 },
  };

  it('takes steps of the undoable branches, each as deep as it looks', () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, 'undo-depths');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const [key, depth] of Object.entries(UNDO_DEPTH)) {
      expect(undoneAfterOwnEdits(store, key), key).toEqual(undoneAt[depth]);
    }
  });

  /** Another value of the kind `value` is, so that what reads the branch can still read it. */
  function changed(value: unknown): unknown {
    if (Array.isArray(value)) return [...value];
    if (typeof value === 'object' && value !== null) return { ...value };
    if (typeof value === 'number') return value + 1;
    if (typeof value === 'boolean') return !value;
    return `${String(value)}-changed`;
  }

  it('never takes a step of any other branch', async () => {
    const { store } = await opened(RICH_SCENE_PATH);
    const history = getHistoryStore(store)!.getState();
    history.resume();
    history.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const stepped = [...KNOWN_KEYS].filter((key) => !(key in UNDO_DEPTH)).filter((key) => {
      store.setState({ [key]: changed(stateOf(store)[key]) });
      const steps = getHistoryStore(store)!.getState().pastStates.length;
      getHistoryStore(store)!.getState().clear();
      return steps > 0;
    });
    expect(stepped).toEqual([]);
  });
});
