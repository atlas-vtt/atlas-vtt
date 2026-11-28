import type { App } from 'obsidian';
import type { SettingsService } from '../../../src/app/services/SettingsService';
import {
  ANIMATE_MAPS_STORAGE_KEY, DRAW_TOOL_STORAGE_KEY, FINGER_USE_STORAGE_KEY, GM_FOG_OPACITY_STORAGE_KEY, GRAPHICS_STORAGE_KEY, INPUT_MODE_STORAGE_KEY,
  LIGHTING_QUALITY_STORAGE_KEY, PEN_SEEN_STORAGE_KEY, PICKED_LIGHTING_QUALITY_STORAGE_KEY, PLAYER_VIEW_4K_STORAGE_KEY, SELECTION_BAR_STORAGE_KEY,
  ZOOM_BUTTONS_STORAGE_KEY,
  loadDrawTool, loadFingerUse, loadPenSeen, loadPickedLightingQuality, loadZoomButtons, saveDrawTool, saveFingerUse, savePenSeen, savePickedLightingQuality, saveZoomButtons,
} from '../../../src/app/services/deviceSettings';
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
    read: ({ settings }) => settings.getSetting('showChangelogOnUpdate'),
    write: value<boolean>(({ settings }, on) => settings.setSetting('showChangelogOnUpdate', on)),
  },
  changelogMajorUpdatesOnly: {
    store: 'synced', keys: ['changelogMajorUpdatesOnly'],
    read: ({ settings }) => settings.getSetting('changelogMajorUpdatesOnly'),
    write: value<boolean>(({ settings }, on) => settings.setSetting('changelogMajorUpdatesOnly', on)),
  },
  checkForUpdates: {
    store: 'synced', keys: ['checkForUpdates'],
    read: ({ settings }) => settings.getSetting('checkForUpdates'),
    write: value<boolean>(({ settings }, on) => settings.setSetting('checkForUpdates', on)),
  },
  starterTokensAdded: {
    store: 'synced', keys: ['starterTokensAdded'],
    read: ({ settings }) => settings.getSetting('starterTokensAdded'),
    write: value<boolean>(({ settings }, on) => settings.setSetting('starterTokensAdded', on)),
  },
  onboarding: {
    store: 'synced', keys: ['onboarding'],
    read: ({ settings }) => settings.getSetting('onboarding'),
    write: value<{ enabled: boolean; completed: Record<string, boolean>; tokenImported: boolean }>(({ settings }, next) => settings.setSetting('onboarding', next)),
  },
  hotkeys: {
    store: 'synced', keys: ['hotkeys'],
    read: ({ settings }) => settings.getHotkeys().measure,
    write: value<string>(({ settings }, key) => settings.setHotkey('measure', key)),
  },
  hiddenStarterOffers: {
    store: 'synced', keys: ['hiddenStarterOffers'],
    read: ({ settings }) => settings.isStarterOfferHidden('collection-1'),
    write: value<boolean>(({ settings }, hidden) => settings.setStarterOfferHidden('collection-1', hidden)),
  },
  hiddenSoundOffers: {
    store: 'synced', keys: ['hiddenSoundOffers'],
    read: ({ settings }) => settings.isSoundOfferHidden('starter-ambience'),
    write: value<boolean>(({ settings }, hidden) => settings.setSoundOfferHidden('starter-ambience', hidden)),
  },
  laserPointer: {
    store: 'synced', keys: ['laserPointer'],
    read: ({ settings }) => settings.getLaserPointerSettings(),
    write: value<object>(({ settings }, changes) => settings.setLaserPointerSettings(changes)),
  },
  diceDisplay: {
    store: 'synced', keys: ['diceDisplay'],
    read: ({ settings }) => settings.getDiceDisplay(),
    write: value<'card' | 'fast' | 'full'>(({ settings }, display) => settings.setDiceDisplay(display)),
  },
  diceVolume: {
    store: 'synced', keys: ['diceVolume'],
    read: ({ settings }) => settings.getDiceVolume(),
    write: value<number>(({ settings }, volume) => settings.setDiceVolume(volume)),
  },
  sound: {
    store: 'synced', keys: ['sound'],
    read: ({ settings }) => settings.getSoundSettings(),
    write: value<object>(({ settings }, changes) => settings.setSoundSettings(changes)),
  },
  soundRoots: {
    store: 'synced', keys: ['soundRoots'],
    read: ({ settings }) => settings.getSoundRoots(),
    write: value<object>(({ settings }, roots) => settings.setSoundRoots(roots)),
  },
  detectGridOnNewScenes: {
    store: 'synced', keys: ['detectGridOnNewScenes'],
    read: ({ settings }) => settings.detectsGridOnNewScenes(),
    write: value<boolean>(({ settings }, on) => settings.setDetectGridOnNewScenes(on)),
  },
  fogEdge: {
    store: 'synced', keys: ['fogEdge'],
    read: ({ settings }) => settings.getFogEdge(),
    write: value<object>(({ settings }, changes) => settings.setFogEdge(changes)),
  },
  dragDistance: {
    store: 'synced', keys: ['dragDistance'],
    read: ({ settings }) => settings.getDragDistance(),
    write: value<'always' | 'combat' | 'never'>(({ settings }, choice) => settings.setDragDistance(choice)),
  },
  diceLook: {
    store: 'synced', keys: ['diceColour', 'diceFont'],
    read: ({ settings }) => settings.getDiceLook(),
    write: value<object>(({ settings }, look) => settings.setDiceLook(look)),
  },
  initiativeCompact: {
    store: 'synced', keys: ['initiativeCompact'],
    read: ({ settings }) => settings.showsCompactInitiative(),
    write: value<boolean>(({ settings }, on) => settings.setCompactInitiative(on)),
  },
  initiativeLayout: {
    store: 'synced', keys: ['initiativeDock', 'initiativeEdges', 'initiativeFacesPlayers'],
    read: ({ settings }) => settings.initiativeLayout(),
    write: value<object>(({ settings }, changes) => settings.setInitiativeLayout(changes)),
  },
  initiativeTurnOptions: {
    store: 'synced', keys: ['initiativeBanner', 'initiativeMovesOnTurn'],
    read: ({ settings }) => settings.initiativeTurnOptions(),
    write: value<object>(({ settings }, changes) => settings.setInitiativeTurnOptions(changes)),
  },
  experimental: {
    store: 'synced', keys: ['experimental'],
    read: ({ settings }) => settings.isExperimentalOn('onlinePlay'),
    write: value<boolean>(({ settings }, on) => settings.setExperimental('onlinePlay', on)),
  },
  toolbar: {
    store: 'synced', keys: ['toolbar'],
    read: ({ settings }) => settings.getToolbarLayout(),
    write: value<object>(({ settings }, layout) => settings.setToolbarLayout(layout)),
  },
  toolbarAutoHide: {
    store: 'synced', keys: ['toolbarAutoHide'],
    read: ({ settings }) => settings.isToolbarAutoHide(),
    write: value<boolean>(({ settings }, on) => settings.setToolbarAutoHide(on)),
  },
  gmScreenKeys: {
    store: 'synced', keys: ['gmScreenKeys'],
    read: ({ settings }) => settings.getGmScreenKeys(),
    write: value<object>(({ settings }, keys) => settings.setGmScreenKeys(keys)),
  },
  dungeonGenerator: {
    store: 'synced', keys: ['dungeonGenerator'],
    read: ({ settings }) => settings.getDungeonGenerator(),
    write: value<object>(({ settings }, changes) => settings.setDungeonGenerator(changes)),
  },
  localPlayerView: {
    store: 'synced', keys: ['localPlayerView'],
    read: ({ settings }) => settings.getLocalPlayerViewSettings(),
    write: value<object>(({ settings }, changes) => settings.setLocalPlayerViewSettings(changes)),
  },
  tableTv: {
    store: 'synced', keys: ['tableTv'],
    read: ({ settings }) => settings.getTableTvSettings(),
    write: value<object>(({ settings }, changes) => settings.setTableTvSettings(changes)),
  },
  inputMode: {
    store: 'device', keys: [INPUT_MODE_STORAGE_KEY],
    read: ({ settings }) => settings.getNavigationSettings().inputMode,
    write: value<'mouse' | 'trackpad'>(({ settings }, inputMode) => settings.setNavigationSettings({ inputMode })),
  },
  graphics: {
    store: 'device', keys: [GRAPHICS_STORAGE_KEY, LIGHTING_QUALITY_STORAGE_KEY],
    read: ({ settings }) => settings.getGraphics(),
    write: value<{ preset: 'high' | 'balanced' | 'saver'; overrides: object }>(({ settings }, choice) => settings.setGraphics(choice)),
  },
  pickedLightingQuality: {
    store: 'device', keys: [PICKED_LIGHTING_QUALITY_STORAGE_KEY],
    read: ({ app }) => loadPickedLightingQuality(app),
    write: value<'high' | 'balanced' | 'saver'>(({ app }, level) => savePickedLightingQuality(app, level)),
  },
  animateMaps: {
    store: 'device', keys: [ANIMATE_MAPS_STORAGE_KEY],
    read: ({ settings }) => settings.getAnimateMaps(),
    write: value<boolean>(({ settings }, on) => settings.setAnimateMaps(on)),
  },
  playerView4k: {
    store: 'device', keys: [PLAYER_VIEW_4K_STORAGE_KEY],
    read: ({ settings }) => settings.isPlayerView4k(),
    write: value<boolean>(({ settings }, on) => settings.setPlayerView4k(on)),
  },
  selectionBar: {
    store: 'device', keys: [SELECTION_BAR_STORAGE_KEY],
    read: ({ settings }) => settings.isSelectionBarShown(),
    write: value<boolean>(({ settings }, shown) => settings.setSelectionBarShown(shown)),
  },
  gmFogOpacity: {
    store: 'device', keys: [GM_FOG_OPACITY_STORAGE_KEY],
    read: ({ settings }) => settings.getGmFogOpacity(),
    write: value<number>(({ settings }, opacity) => settings.setGmFogOpacity(opacity)),
  },
  tableTvDevice: {
    store: 'device', keys: [TABLE_TV_STORAGE_KEY],
    read: ({ settings }) => settings.getTableTvDevice(),
    write: value<object>(({ settings }, patch) => settings.setTableTvDevice(patch)),
  },
  drawTool: {
    store: 'device', keys: [DRAW_TOOL_STORAGE_KEY],
    read: ({ app }) => loadDrawTool(app),
    write: value<DrawToolChoices>(({ app }, choices) => saveDrawTool(app, choices)),
  },
  penSeen: {
    store: 'device', keys: [PEN_SEEN_STORAGE_KEY],
    read: ({ app }) => loadPenSeen(app),
    write: value<true>(({ app }) => savePenSeen(app)),
  },
  fingerUse: {
    store: 'device', keys: [FINGER_USE_STORAGE_KEY],
    read: ({ app }) => loadFingerUse(app),
    write: value<'tool' | 'pan'>(({ app }, use) => saveFingerUse(app, use)),
  },
  zoomButtons: {
    store: 'device', keys: [ZOOM_BUTTONS_STORAGE_KEY],
    read: ({ app }) => loadZoomButtons(app),
    write: value<boolean>(({ app }, shown) => saveZoomButtons(app, shown)),
  },
} satisfies Record<string, PreferenceAccess>;

export type PreferenceName = keyof typeof PREFERENCE_ACCESS;
