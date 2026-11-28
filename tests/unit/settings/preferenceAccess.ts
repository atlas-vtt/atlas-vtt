import type { App } from 'obsidian';
import type { SettingsService } from '../../../src/app/services/SettingsService';
import {
  ANIMATE_MAPS_STORAGE_KEY, DRAW_TOOL_STORAGE_KEY, FINGER_USE_STORAGE_KEY, GM_FOG_OPACITY_STORAGE_KEY, GRAPHICS_STORAGE_KEY, INPUT_MODE_STORAGE_KEY,
  LIGHTING_QUALITY_STORAGE_KEY, PEN_SEEN_STORAGE_KEY, PICKED_LIGHTING_QUALITY_STORAGE_KEY, PLAYER_VIEW_4K_STORAGE_KEY, SELECTION_BAR_STORAGE_KEY,
  ZOOM_BUTTONS_STORAGE_KEY, DEVICE_PREFERENCES, readDevice, writeDevice,
} from '../../../src/app/services/deviceSettings';
import { withListed } from '../../../src/app/services/preferences/syncedPreferences';
import { TABLE_TV_STORAGE_KEY } from '../../../src/app/services/tableTvDevice';
import type { DrawToolChoices } from '../../../src/app/annotations/annotationTypes';

/** What a preference is read and written through: the settings service, or the device's local storage for facts read without it. */
export interface PreferenceContext {
  settings: SettingsService;
  app: App;
}

/**
 * How the pin reaches one preference. This is the only part of the pin that names the settings'
 * methods: when the interface changes, these lines follow it, and the expectations beside them stay.
 */
export interface PreferenceAccess {
  readonly store: 'synced' | 'device';
  /** The keys the preference is stored under: in `data.json`, or in the device's local storage. */
  readonly keys: readonly string[];
  read(context: PreferenceContext): unknown;
  write(context: PreferenceContext, value: never): void;
}

const value = <T>(write: (context: PreferenceContext, value: T) => void): PreferenceAccess['write'] => write as PreferenceAccess['write'];

/** Every preference Atlas keeps, by the name the pin knows it by. */
export const PREFERENCE_ACCESS = {
  showChangelogOnUpdate: {
    store: 'synced', keys: ['showChangelogOnUpdate'],
    read: ({ settings }) => settings.get('showChangelogOnUpdate'),
    write: value<boolean>(({ settings }, on) => settings.set('showChangelogOnUpdate', on)),
  },
  changelogMajorUpdatesOnly: {
    store: 'synced', keys: ['changelogMajorUpdatesOnly'],
    read: ({ settings }) => settings.get('changelogMajorUpdatesOnly'),
    write: value<boolean>(({ settings }, on) => settings.set('changelogMajorUpdatesOnly', on)),
  },
  checkForUpdates: {
    store: 'synced', keys: ['checkForUpdates'],
    read: ({ settings }) => settings.get('checkForUpdates'),
    write: value<boolean>(({ settings }, on) => settings.set('checkForUpdates', on)),
  },
  starterTokensAdded: {
    store: 'synced', keys: ['starterTokensAdded'],
    read: ({ settings }) => settings.get('starterTokensAdded'),
    write: value<boolean>(({ settings }, on) => settings.set('starterTokensAdded', on)),
  },
  onboarding: {
    store: 'synced', keys: ['onboarding'],
    read: ({ settings }) => settings.get('onboarding'),
    write: value<{ enabled: boolean; completed: Record<string, boolean>; tokenImported: boolean }>(({ settings }, next) => settings.set('onboarding', next)),
  },
  hotkeys: {
    store: 'synced', keys: ['hotkeys'],
    read: ({ settings }) => settings.getHotkeys().measure,
    write: value<string>(({ settings }, key) => settings.setHotkey('measure', key)),
  },
  hiddenStarterOffers: {
    store: 'synced', keys: ['hiddenStarterOffers'],
    read: ({ settings }) => settings.get('hiddenStarterOffers').includes('collection-1'),
    write: value<boolean>(({ settings }, hidden) => settings.set('hiddenStarterOffers', withListed(settings.get('hiddenStarterOffers'), 'collection-1', hidden))),
  },
  hiddenSoundOffers: {
    store: 'synced', keys: ['hiddenSoundOffers'],
    read: ({ settings }) => settings.get('hiddenSoundOffers').includes('starter-ambience'),
    write: value<boolean>(({ settings }, hidden) => settings.set('hiddenSoundOffers', withListed(settings.get('hiddenSoundOffers'), 'starter-ambience', hidden))),
  },
  laserPointer: {
    store: 'synced', keys: ['laserPointer'],
    read: ({ settings }) => settings.get('laserPointer'),
    write: value<object>(({ settings }, changes) => settings.set('laserPointer', changes)),
  },
  diceDisplay: {
    store: 'synced', keys: ['diceDisplay'],
    read: ({ settings }) => settings.get('diceDisplay'),
    write: value<'card' | 'fast' | 'full'>(({ settings }, display) => settings.set('diceDisplay', display)),
  },
  diceVolume: {
    store: 'synced', keys: ['diceVolume'],
    read: ({ settings }) => settings.get('diceVolume'),
    write: value<number>(({ settings }, volume) => settings.set('diceVolume', volume)),
  },
  sound: {
    store: 'synced', keys: ['sound'],
    read: ({ settings }) => settings.get('sound'),
    write: value<object>(({ settings }, changes) => settings.set('sound', changes)),
  },
  soundRoots: {
    store: 'synced', keys: ['soundRoots'],
    read: ({ settings }) => settings.get('soundRoots'),
    write: value<object>(({ settings }, roots) => settings.set('soundRoots', roots)),
  },
  detectGridOnNewScenes: {
    store: 'synced', keys: ['detectGridOnNewScenes'],
    read: ({ settings }) => settings.get('detectGridOnNewScenes'),
    write: value<boolean>(({ settings }, on) => settings.set('detectGridOnNewScenes', on)),
  },
  fogEdge: {
    store: 'synced', keys: ['fogEdge'],
    read: ({ settings }) => settings.get('fogEdge'),
    write: value<object>(({ settings }, changes) => settings.set('fogEdge', changes)),
  },
  dragDistance: {
    store: 'synced', keys: ['dragDistance'],
    read: ({ settings }) => settings.get('dragDistance'),
    write: value<'always' | 'combat' | 'never'>(({ settings }, choice) => settings.set('dragDistance', choice)),
  },
  diceLook: {
    store: 'synced', keys: ['diceColour', 'diceFont'],
    read: ({ settings }) => settings.get('diceLook'),
    write: value<object>(({ settings }, look) => settings.set('diceLook', look)),
  },
  initiativeCompact: {
    store: 'synced', keys: ['initiativeCompact'],
    read: ({ settings }) => settings.get('initiativeCompact'),
    write: value<boolean>(({ settings }, on) => settings.set('initiativeCompact', on)),
  },
  initiativeLayout: {
    store: 'synced', keys: ['initiativeDock', 'initiativeEdges', 'initiativeFacesPlayers'],
    read: ({ settings }) => settings.get('initiativeLayout'),
    write: value<object>(({ settings }, changes) => settings.set('initiativeLayout', changes)),
  },
  initiativeTurnOptions: {
    store: 'synced', keys: ['initiativeBanner', 'initiativeMovesOnTurn'],
    read: ({ settings }) => settings.get('initiativeTurnOptions'),
    write: value<object>(({ settings }, changes) => settings.set('initiativeTurnOptions', changes)),
  },
  experimental: {
    store: 'synced', keys: ['experimental'],
    read: ({ settings }) => settings.get('experimental').onlinePlay === true,
    write: value<boolean>(({ settings }, on) => settings.set('experimental', { onlinePlay: on })),
  },
  toolbar: {
    store: 'synced', keys: ['toolbar'],
    read: ({ settings }) => settings.get('toolbar'),
    write: value<object>(({ settings }, layout) => settings.set('toolbar', layout)),
  },
  toolbarAutoHide: {
    store: 'synced', keys: ['toolbarAutoHide'],
    read: ({ settings }) => settings.get('toolbarAutoHide'),
    write: value<boolean>(({ settings }, on) => settings.set('toolbarAutoHide', on)),
  },
  gmScreenKeys: {
    store: 'synced', keys: ['gmScreenKeys'],
    read: ({ settings }) => settings.get('gmScreenKeys'),
    write: value<object>(({ settings }, keys) => settings.set('gmScreenKeys', keys)),
  },
  dungeonGenerator: {
    store: 'synced', keys: ['dungeonGenerator'],
    read: ({ settings }) => settings.get('dungeonGenerator'),
    write: value<object>(({ settings }, changes) => settings.set('dungeonGenerator', changes)),
  },
  localPlayerView: {
    store: 'synced', keys: ['localPlayerView'],
    read: ({ settings }) => settings.get('localPlayerView'),
    write: value<object>(({ settings }, changes) => settings.set('localPlayerView', changes)),
  },
  tableTv: {
    store: 'synced', keys: ['tableTv'],
    read: ({ settings }) => settings.get('tableTv'),
    write: value<object>(({ settings }, changes) => settings.set('tableTv', changes)),
  },
  inputMode: {
    store: 'device', keys: [INPUT_MODE_STORAGE_KEY],
    read: ({ settings }) => settings.get('inputMode'),
    write: value<'mouse' | 'trackpad'>(({ settings }, inputMode) => settings.set('inputMode', inputMode)),
  },
  graphics: {
    store: 'device', keys: [GRAPHICS_STORAGE_KEY, LIGHTING_QUALITY_STORAGE_KEY],
    read: ({ settings }) => settings.getGraphics(),
    write: value<{ preset: 'high' | 'balanced' | 'saver'; overrides: object }>(({ settings }, choice) => settings.setGraphics(choice)),
  },
  pickedLightingQuality: {
    store: 'device', keys: [PICKED_LIGHTING_QUALITY_STORAGE_KEY],
    read: ({ app }) => readDevice(app, DEVICE_PREFERENCES.pickedLightingQuality),
    write: value<'high' | 'balanced' | 'saver'>(({ app }, level) => writeDevice(app, DEVICE_PREFERENCES.pickedLightingQuality, level)),
  },
  animateMaps: {
    store: 'device', keys: [ANIMATE_MAPS_STORAGE_KEY],
    read: ({ settings }) => settings.get('animateMaps'),
    write: value<boolean>(({ settings }, on) => settings.set('animateMaps', on)),
  },
  playerView4k: {
    store: 'device', keys: [PLAYER_VIEW_4K_STORAGE_KEY],
    read: ({ settings }) => settings.get('playerView4k'),
    write: value<boolean>(({ settings }, on) => settings.set('playerView4k', on)),
  },
  selectionBar: {
    store: 'device', keys: [SELECTION_BAR_STORAGE_KEY],
    read: ({ settings }) => settings.get('selectionBar'),
    write: value<boolean>(({ settings }, shown) => settings.set('selectionBar', shown)),
  },
  gmFogOpacity: {
    store: 'device', keys: [GM_FOG_OPACITY_STORAGE_KEY],
    read: ({ settings }) => settings.get('gmFogOpacity'),
    write: value<number>(({ settings }, opacity) => settings.set('gmFogOpacity', opacity)),
  },
  tableTvDevice: {
    store: 'device', keys: [TABLE_TV_STORAGE_KEY],
    read: ({ settings }) => settings.get('tableTvDevice'),
    write: value<object>(({ settings }, patch) => settings.set('tableTvDevice', patch)),
  },
  drawTool: {
    store: 'device', keys: [DRAW_TOOL_STORAGE_KEY],
    read: ({ app }) => readDevice(app, DEVICE_PREFERENCES.drawTool),
    write: value<DrawToolChoices>(({ app }, choices) => writeDevice(app, DEVICE_PREFERENCES.drawTool, choices)),
  },
  penSeen: {
    store: 'device', keys: [PEN_SEEN_STORAGE_KEY],
    read: ({ app }) => readDevice(app, DEVICE_PREFERENCES.penSeen),
    write: value<true>(({ app }) => writeDevice(app, DEVICE_PREFERENCES.penSeen, true)),
  },
  fingerUse: {
    store: 'device', keys: [FINGER_USE_STORAGE_KEY],
    read: ({ app }) => readDevice(app, DEVICE_PREFERENCES.fingerUse),
    write: value<'tool' | 'pan'>(({ app }, use) => writeDevice(app, DEVICE_PREFERENCES.fingerUse, use)),
  },
  zoomButtons: {
    store: 'device', keys: [ZOOM_BUTTONS_STORAGE_KEY],
    read: ({ app }) => readDevice(app, DEVICE_PREFERENCES.zoomButtons),
    write: value<boolean>(({ app }, shown) => writeDevice(app, DEVICE_PREFERENCES.zoomButtons, shown)),
  },
} satisfies Record<string, PreferenceAccess>;

export type PreferenceName = keyof typeof PREFERENCE_ACCESS;
