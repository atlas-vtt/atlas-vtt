// @vitest-environment jsdom
/**
 * What every preference does in the store it lives in: what a store without it and a store whose
 * value Atlas cannot read give, what a change reads and stores, whether storing the value already
 * there saves and tells the listeners again, and whether a field a newer Atlas stored inside it
 * survives a change.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { SettingsService } from '../../../src/app/services/SettingsService';
import { DEFAULT_DRAW_TOOL } from '../../../src/app/annotations/annotationTypes';
import { memoryPluginData } from '../../mocks/pluginData';
import { PREFERENCE_ACCESS, type PreferenceAccess, type PreferenceContext, type PreferenceName } from './preferenceAccess';

interface Expected {
  /** What reads while nothing is stored. */
  empty: unknown;
  /** Stored entries Atlas cannot read, and what reads from them. */
  malformed: { stored: Record<string, unknown>; reads: unknown };
  /** A change, what reads after it, and what the store holds under the preference's keys then. */
  change: unknown;
  reads: unknown;
  stores: Record<string, unknown>;
  /** Writing the change again once it is stored: whether the store is written, and how often listeners hear of it. */
  again: { saves: boolean; notifies: number };
  /** For a preference stored as one record: whether a field a newer Atlas put into it, beside none of this version's, survives the change. */
  newerField?: boolean;
}

const DEFAULT_PLAYER_VIEW = {
  showToolbar: false, showTokenNameplates: false, showNotePreviews: false, showWidgets: true, showInitiative: true, showDiceRolls: false,
  showCommandPalette: false, showCursors: false, initiativeScale: 1, initiativePulse: false, turnBannerAtLists: false, turnDim: false,
  initiativeMaxCards: 0, playersDraw: false, playersOpenDoors: false, sharedVision: false,
};
const DEFAULT_SOUND = { musicDb: 0, ambienceDb: -6, masterDb: 0, fadeSeconds: 4, crossfadeSeconds: 4, followScenes: true };
const DEFAULT_DUNGEON = {
  style: 'crayon', view: { grid: 'dotted', smallTiles: false, water: true, props: true, shadow: true, secrets: true, monochrome: false },
  theme: 'any', tags: [], floors: 1, bossRoom: true, fiveRoom: false,
};
const { mode: _mode, eraseWhole: _eraseWhole, cellsUnfill: _cellsUnfill, ...REMEMBERED_DRAW_TOOL } = DEFAULT_DRAW_TOOL;
const boolean = (key: string, empty: boolean): Expected => ({
  empty, malformed: { stored: { [key]: 'yes' }, reads: empty }, change: !empty, reads: !empty, stores: { [key]: !empty }, again: { saves: false, notifies: 0 },
});

const EXPECTED: Record<PreferenceName, Expected> = {
  showChangelogOnUpdate: { ...boolean('showChangelogOnUpdate', true), malformed: { stored: { showChangelogOnUpdate: 'yes' }, reads: 'yes' }, again: { saves: true, notifies: 1 } },
  changelogMajorUpdatesOnly: { ...boolean('changelogMajorUpdatesOnly', false), malformed: { stored: { changelogMajorUpdatesOnly: 'yes' }, reads: 'yes' }, again: { saves: true, notifies: 1 } },
  checkForUpdates: { ...boolean('checkForUpdates', true), malformed: { stored: { checkForUpdates: 'yes' }, reads: 'yes' }, again: { saves: true, notifies: 1 } },
  starterTokensAdded: { ...boolean('starterTokensAdded', false), malformed: { stored: { starterTokensAdded: 'yes' }, reads: 'yes' }, again: { saves: true, notifies: 1 } },
  onboarding: {
    empty: { enabled: true, completed: {}, tokenImported: false },
    malformed: { stored: { onboarding: 'none' }, reads: 'none' },
    change: { enabled: false, completed: { map: true }, tokenImported: true },
    reads: { enabled: false, completed: { map: true }, tokenImported: true },
    stores: { onboarding: { enabled: false, completed: { map: true }, tokenImported: true } },
    again: { saves: true, notifies: 1 },
    newerField: false,
  },
  hotkeys: {
    empty: 'm', malformed: { stored: { hotkeys: 'all' }, reads: 'm' },
    change: 'j', reads: 'j', stores: { hotkeys: { measure: 'j' } }, again: { saves: true, notifies: 1 }, newerField: true,
  },
  hiddenStarterOffers: {
    empty: false, malformed: { stored: { hiddenStarterOffers: 'collection-1' }, reads: false },
    change: true, reads: true, stores: { hiddenStarterOffers: ['collection-1'] }, again: { saves: false, notifies: 0 },
  },
  hiddenSoundOffers: {
    empty: false, malformed: { stored: { hiddenSoundOffers: 'starter-ambience' }, reads: false },
    change: true, reads: true, stores: { hiddenSoundOffers: ['starter-ambience'] }, again: { saves: false, notifies: 0 },
  },
  laserPointer: {
    empty: { color: '#ff0059', size: 16 }, malformed: { stored: { laserPointer: { color: 'red', size: 'big' } }, reads: { color: '#ff0059', size: 16 } },
    change: { size: 40 }, reads: { color: '#ff0059', size: 40 }, stores: { laserPointer: { color: '#ff0059', size: 40 } }, again: { saves: true, notifies: 1 }, newerField: true,
  },
  diceDisplay: {
    empty: 'full', malformed: { stored: { diceDisplay: 'huge' }, reads: 'full' },
    change: 'card', reads: 'card', stores: { diceDisplay: 'card' }, again: { saves: false, notifies: 0 },
  },
  diceVolume: {
    empty: 1, malformed: { stored: { diceVolume: 2 }, reads: 1 },
    change: 0.5, reads: 0.5, stores: { diceVolume: 0.5 }, again: { saves: false, notifies: 0 },
  },
  sound: {
    empty: DEFAULT_SOUND, malformed: { stored: { sound: { musicDb: 'loud', followScenes: 'no' } }, reads: DEFAULT_SOUND },
    change: { musicDb: -3 }, reads: { ...DEFAULT_SOUND, musicDb: -3 }, stores: { sound: { ...DEFAULT_SOUND, musicDb: -3 } }, again: { saves: false, notifies: 0 }, newerField: true,
  },
  soundRoots: {
    empty: {}, malformed: { stored: { soundRoots: { music: { type: 'vault' } } }, reads: {} },
    change: { music: { type: 'vault', path: 'Music' } }, reads: { music: { type: 'vault', path: 'Music' } },
    stores: { soundRoots: { music: { type: 'vault', path: 'Music' } } }, again: { saves: true, notifies: 1 }, newerField: false,
  },
  detectGridOnNewScenes: { ...boolean('detectGridOnNewScenes', true), malformed: { stored: { detectGridOnNewScenes: 'no' }, reads: true } },
  fogEdge: {
    empty: { style: 'crackle', width: 15 }, malformed: { stored: { fogEdge: { style: 'wavy', width: -1 } }, reads: { style: 'crackle', width: 15 } },
    change: { width: 30 }, reads: { style: 'crackle', width: 30 }, stores: { fogEdge: { style: 'crackle', width: 30 } }, again: { saves: true, notifies: 1 }, newerField: false,
  },
  dragDistance: {
    empty: 'always', malformed: { stored: { dragDistance: 'sometimes' }, reads: 'always' },
    change: 'combat', reads: 'combat', stores: { dragDistance: 'combat' }, again: { saves: false, notifies: 0 },
  },
  diceLook: {
    empty: { colour: 'light', font: 'medieval' }, malformed: { stored: { diceColour: 'plaid', diceFont: 'comic' }, reads: { colour: 'light', font: 'medieval' } },
    change: { colour: 'dark' }, reads: { colour: 'dark', font: 'medieval' }, stores: { diceColour: 'dark', diceFont: 'medieval' }, again: { saves: false, notifies: 0 },
  },
  initiativeCompact: boolean('initiativeCompact', false),
  initiativeLayout: {
    empty: { fromTurn: true, dock: 'right', edges: ['right'], facesPlayers: false },
    malformed: { stored: { initiativeDock: 'middle', initiativeEdges: 'all', initiativeFacesPlayers: 'yes' }, reads: { fromTurn: true, dock: 'right', edges: ['right'], facesPlayers: false } },
    change: { dock: 'top' }, reads: { fromTurn: true, dock: 'top', edges: ['top'], facesPlayers: false },
    stores: { initiativeDock: 'top', initiativeEdges: undefined, initiativeFacesPlayers: undefined }, again: { saves: false, notifies: 0 },
  },
  initiativeTurnOptions: {
    empty: { banner: true, movesOnTurn: false },
    malformed: { stored: { initiativeBanner: 'no', initiativeMovesOnTurn: 'yes' }, reads: { banner: true, movesOnTurn: false } },
    change: { movesOnTurn: true }, reads: { banner: true, movesOnTurn: true },
    stores: { initiativeBanner: true, initiativeMovesOnTurn: true }, again: { saves: false, notifies: 0 },
  },
  experimental: {
    empty: false, malformed: { stored: { experimental: 'all' }, reads: false },
    change: true, reads: true, stores: { experimental: { onlinePlay: true } }, again: { saves: false, notifies: 0 }, newerField: true,
  },
  toolbar: {
    empty: {}, malformed: { stored: { toolbar: 'none' }, reads: {} },
    change: { hidden: ['fog'] }, reads: { hidden: ['fog'] }, stores: { toolbar: { hidden: ['fog'] } }, again: { saves: false, notifies: 0 }, newerField: false,
  },
  toolbarAutoHide: boolean('toolbarAutoHide', false),
  gmScreenKeys: {
    empty: {}, malformed: { stored: { gmScreenKeys: 'none' }, reads: {} },
    change: { watch: { columns: 2 } }, reads: { watch: { columns: 2 } }, stores: { gmScreenKeys: { watch: { columns: 2 } } }, again: { saves: false, notifies: 0 }, newerField: false,
  },
  dungeonGenerator: {
    empty: DEFAULT_DUNGEON, malformed: { stored: { dungeonGenerator: { style: 'nope', floors: 'many' } }, reads: DEFAULT_DUNGEON },
    change: { floors: 2 }, reads: { ...DEFAULT_DUNGEON, floors: 2 }, stores: { dungeonGenerator: { ...DEFAULT_DUNGEON, floors: 2 } }, again: { saves: true, notifies: 1 }, newerField: true,
  },
  localPlayerView: {
    empty: DEFAULT_PLAYER_VIEW, malformed: { stored: { localPlayerView: { showToolbar: 'yes' } }, reads: { ...DEFAULT_PLAYER_VIEW, showToolbar: 'yes' } },
    change: { showWidgets: false }, reads: { ...DEFAULT_PLAYER_VIEW, showWidgets: false }, stores: { localPlayerView: { ...DEFAULT_PLAYER_VIEW, showWidgets: false } },
    again: { saves: true, notifies: 1 }, newerField: true,
  },
  tableTv: {
    empty: { viewGlideMs: 800 }, malformed: { stored: { tableTv: { viewGlideMs: -5 } }, reads: { viewGlideMs: 800 } },
    change: { viewGlideMs: 0 }, reads: { viewGlideMs: 0 }, stores: { tableTv: { viewGlideMs: 0 } }, again: { saves: true, notifies: 1 }, newerField: true,
  },
  inputMode: {
    empty: 'mouse', malformed: { stored: { 'atlas-vtt:input-mode': 'joystick' }, reads: 'mouse' },
    change: 'trackpad', reads: 'trackpad', stores: { 'atlas-vtt:input-mode': 'trackpad' }, again: { saves: true, notifies: 1 },
  },
  graphics: {
    empty: { preset: 'high', overrides: {} }, malformed: { stored: { 'atlas-vtt:graphics': '{"preset":"ultra"}', 'atlas-vtt:lighting-quality': 'ultra' }, reads: { preset: 'high', overrides: {} } },
    change: { preset: 'saver', overrides: {} }, reads: { preset: 'saver', overrides: {} },
    stores: { 'atlas-vtt:graphics': '{"preset":"saver","overrides":{}}', 'atlas-vtt:lighting-quality': 'saver' }, again: { saves: true, notifies: 0 },
  },
  pickedLightingQuality: {
    empty: null, malformed: { stored: { 'atlas-vtt:lighting-quality-picked': 'ultra' }, reads: null },
    change: 'balanced', reads: 'balanced', stores: { 'atlas-vtt:lighting-quality-picked': 'balanced' }, again: { saves: true, notifies: 0 },
  },
  animateMaps: {
    empty: null, malformed: { stored: { 'atlas-vtt:animate-maps': 'maybe' }, reads: null },
    change: false, reads: false, stores: { 'atlas-vtt:animate-maps': 'off' }, again: { saves: false, notifies: 0 },
  },
  playerView4k: {
    empty: false, malformed: { stored: { 'atlas-vtt:player-view-4k': '8k' }, reads: false },
    change: true, reads: true, stores: { 'atlas-vtt:player-view-4k': '4k' }, again: { saves: false, notifies: 0 },
  },
  selectionBar: {
    empty: false, malformed: { stored: { 'atlas-vtt:selection-bar': 'yes' }, reads: false },
    change: true, reads: true, stores: { 'atlas-vtt:selection-bar': 'shown' }, again: { saves: false, notifies: 0 },
  },
  gmFogOpacity: {
    empty: 0.5, malformed: { stored: { 'atlas-vtt:gm-fog-opacity': 'thick' }, reads: 0.5 },
    change: 0.8, reads: 0.8, stores: { 'atlas-vtt:gm-fog-opacity': '0.8' }, again: { saves: true, notifies: 0 },
  },
  tableTvDevice: {
    empty: { trueScale: false, cellMm: 25.4, screens: {} }, malformed: { stored: { 'atlas-vtt:table-tv': '{"trueScale":"yes","cellMm":-1}' }, reads: { trueScale: false, cellMm: 25.4, screens: {} } },
    change: { trueScale: true }, reads: { trueScale: true, cellMm: 25.4, screens: {} },
    stores: { 'atlas-vtt:table-tv': '{"trueScale":true,"cellMm":25.4,"screens":{}}' }, again: { saves: true, notifies: 1 }, newerField: true,
  },
  drawTool: {
    empty: DEFAULT_DRAW_TOOL, malformed: { stored: { 'atlas-vtt:draw-tool': '{"color":"teal","size":"huge"}' }, reads: DEFAULT_DRAW_TOOL },
    change: { ...DEFAULT_DRAW_TOOL, color: '#123456' }, reads: { ...DEFAULT_DRAW_TOOL, color: '#123456' },
    stores: { 'atlas-vtt:draw-tool': JSON.stringify({ ...REMEMBERED_DRAW_TOOL, color: '#123456' }) }, again: { saves: true, notifies: 0 }, newerField: false,
  },
  penSeen: {
    empty: false, malformed: { stored: { 'atlas-vtt:pen-seen': 'yes' }, reads: false },
    change: true, reads: true, stores: { 'atlas-vtt:pen-seen': 'seen' }, again: { saves: true, notifies: 0 },
  },
  fingerUse: {
    empty: null, malformed: { stored: { 'atlas-vtt:finger-use': 'feet' }, reads: null },
    change: 'pan', reads: 'pan', stores: { 'atlas-vtt:finger-use': 'pan' }, again: { saves: true, notifies: 0 },
  },
  zoomButtons: {
    empty: false, malformed: { stored: { 'atlas-vtt:zoom-buttons': 'yes' }, reads: false },
    change: true, reads: true, stores: { 'atlas-vtt:zoom-buttons': 'shown' }, again: { saves: true, notifies: 0 },
  },
};

interface Rig extends PreferenceContext {
  data: ReturnType<typeof memoryPluginData>;
  heard: () => number;
}

/** A settings service reading `file` as its `data.json` and `device` as the device's local storage. */
async function rig(file: Record<string, unknown> | null, device: Record<string, unknown> = {}, app = new App()): Promise<Rig> {
  for (const [key, stored] of Object.entries(device)) app.saveLocalStorage(key, stored);
  const data = memoryPluginData(file);
  const settings = new SettingsService(app, undefined, data);
  await settings.initialize();
  let heard = 0;
  settings.onChange(() => { heard += 1; });
  return { settings, app, data, heard: () => heard };
}

/** What the preference's store holds under its keys. */
function storedUnder(access: PreferenceAccess, { data, app }: Rig): Record<string, unknown> {
  const file = (data.stored() ?? {}) as Record<string, unknown>;
  return Object.fromEntries(access.keys.map((key) => [key, access.store === 'synced' ? file[key] : app.loadLocalStorage(key) ?? undefined]));
}

/** A rig whose store holds `entries` under the preference's keys. */
function rigHolding(access: PreferenceAccess, entries: Record<string, unknown>): Promise<Rig> {
  const defined = Object.fromEntries(Object.entries(entries).filter(([, stored]) => stored !== undefined));
  return access.store === 'synced' ? rig(defined) : rig(null, defined);
}

const CASES = Object.entries(EXPECTED).map(([name, expected]) => ({ name, access: PREFERENCE_ACCESS[name as PreferenceName] as PreferenceAccess, expected }));

describe('every preference in its store', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it.each(CASES)('$name reads its default from a store without it', async ({ access, expected }) => {
    expect(access.read(await rig(null))).toEqual(expected.empty);
  });

  it.each(CASES)('$name reads what it reads from a value Atlas cannot use', async ({ access, expected }) => {
    expect(access.read(await rigHolding(access, expected.malformed.stored))).toEqual(expected.malformed.reads);
  });

  it.each(CASES)('$name reads a change back, stores it, and a new service reads it from there', async ({ access, expected }) => {
    const first = await rig(null);
    let readWhenHeard: unknown = 'not heard';
    first.settings.onChange(() => { readWhenHeard = access.read(first); });
    access.write(first, expected.change as never);
    expect(access.read(first)).toEqual(expected.reads);
    if (first.heard() > 0) expect(readWhenHeard).toEqual(expected.reads);
    await first.settings.saveSettingsNow();
    expect(storedUnder(access, first)).toEqual(expected.stores);

    const next = await rig(first.data.stored() as Record<string, unknown> | null, {}, first.app);
    expect(access.read(next)).toEqual(expected.reads);
  });

  it.each(CASES)('$name writing the value already stored', async ({ access, expected }) => {
    const held = await rigHolding(access, expected.stores);
    const saveLocal = vi.spyOn(held.app, 'saveLocalStorage');
    access.write(held, expected.change as never);
    await vi.advanceTimersByTimeAsync(1000);
    const saved = access.store === 'synced' ? held.data.saveData.mock.calls.length > 0 : saveLocal.mock.calls.length > 0;
    expect({ saves: saved, notifies: held.heard() }).toEqual(expected.again);
  });

  it.each(CASES.filter(({ expected }) => expected.newerField !== undefined))('$name and a field a newer Atlas stored in it', async ({ access, expected }) => {
    const [key] = access.keys;
    const newer = { fromNewer: 'kept' };
    const held = await rigHolding(access, { [key]: typeof expected.stores[key] === 'string' ? JSON.stringify(newer) : newer });
    access.write(held, expected.change as never);
    await held.settings.saveSettingsNow();
    const after = storedUnder(access, held)[key];
    const record = (typeof after === 'string' ? JSON.parse(after) : after) as Record<string, unknown>;
    expect(record.fromNewer === 'kept').toBe(expected.newerField);
  });
});
