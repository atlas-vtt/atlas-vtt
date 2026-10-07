import { Platform } from 'obsidian';
import { keptHotkeys, readHotkeyOverrides, type HotkeyOverrides } from '../keyboard/hotkeyOverrides';
import { DEFAULT_LASER_POINTER_SETTINGS, type LaserPointerSettings } from '../tools/laserPointerSettings';
import type { DiceDisplay } from '../dice3d/diceDisplay';
import type { ExperimentalFeatureId } from '../experimental/experimentalFeatures';
import { DEFAULT_DICE_LOOK, type DiceColour, type DiceFont } from '../dice3d/diceLook';
import { readToolbarLayout, type StoredToolbarLayout } from '../toolbar/toolbarLayout';
import type { TVCalibrationSettings } from '../types/viewportTypes';
import { CM_PER_INCH } from '../utils/viewportPhysicalScale';

/**
 * How wheel events drive the map viewport.
 * - `mouse`: the wheel always zooms; right-drag pans.
 * - `trackpad`: two-finger scroll pans; pinch (Ctrl/Cmd + wheel) zooms.
 */
export type NavigationInputMode = 'mouse' | 'trackpad';

export interface NavigationSettings {
  inputMode: NavigationInputMode;
}

/** Every tutorial Atlas has; the settings list those the user finished or skipped. */
export const TUTORIAL_IDS = ['assets', 'palette', 'tokenStatblocks', 'lootSettings', 'lootRoller', 'lootResults'] as const;
export type TutorialId = typeof TUTORIAL_IDS[number];

export interface AtlasSettings {
  showChangelogOnUpdate: boolean;
  changelogMajorUpdatesOnly: boolean;
  /** Only the bindings the user changed; read the effective ones with `getHotkeys`. */
  hotkeys: HotkeyOverrides;
  onboarding: { enabled: boolean; completed: Partial<Record<TutorialId, boolean>>; tokenImported: boolean };
  /** The starter tokens were added to the default collection once; deleted ones stay deleted. */
  starterTokensAdded: boolean;
  /** A fact about this device, kept in its local storage and never in the plugin's data (`deviceSettings.ts`). */
  navigation: NavigationSettings;
  laserPointer: LaserPointerSettings;
  /** How rolls show: a result card, or 3D dice at double or normal speed. Read with `getDiceDisplay`. */
  diceDisplay: DiceDisplay;
  /** Colour of the dice: card stock, dark or the accent colour. Read with `getDiceLook`. */
  diceColour: DiceColour;
  /** Face of the dice numerals and roll totals. Read with `getDiceLook`. */
  diceFont: DiceFont;
  /** Experimental features the GM switched on. Read with `isExperimentalOn`. */
  experimental: Partial<Record<ExperimentalFeatureId, boolean>>;
  /** The statblock beside its note: whether its first-visit hint was dismissed. */
  statblockPane: { hintDismissed: boolean };
  /** The GM's toolbar layout, only what differs from the default; read with `getToolbarLayout`. */
  toolbar: StoredToolbarLayout;
  localPlayerView: {
    // UI element visibility toggles
    showToolbar: boolean;
    showTokenNameplates: boolean;
    showNotePreviews: boolean;
    showWidgets: boolean;
    showInitiative: boolean;
    /** Show the DM's dice rolls to players as toasts in the player window. */
    showDiceRolls: boolean;
    showCommandPalette: boolean;
  };
  /**
   * The physical TV the player window is shown on, so grid squares can match real miniatures.
   * It describes the device, not a scene, so it lives here and not in the map file.
   */
  tvCalibration: TVCalibrationSettings;
}

/** The input mode a device starts with: Macs mostly have a trackpad, other computers a mouse. */
export const defaultInputMode = (): NavigationInputMode => (Platform.isMacOS ? 'trackpad' : 'mouse');

export const DEFAULT_SETTINGS: AtlasSettings = {
  showChangelogOnUpdate: true,
  changelogMajorUpdatesOnly: false,
  hotkeys: {},
  onboarding: { enabled: true, completed: {}, tokenImported: false },
  starterTokensAdded: false,
  navigation: { inputMode: defaultInputMode() },
  laserPointer: DEFAULT_LASER_POINTER_SETTINGS,
  diceDisplay: 'full',
  diceColour: DEFAULT_DICE_LOOK.colour,
  diceFont: DEFAULT_DICE_LOOK.font,
  experimental: {},
  statblockPane: { hintDismissed: false },
  toolbar: {},
  localPlayerView: {
    // UI element visibility defaults
    showToolbar: false, // Hide toolbar by default in player view
    showTokenNameplates: false, // Hide nameplates
    showNotePreviews: false, // Hide note previews
    showWidgets: true,
    showInitiative: true,
    showDiceRolls: false,
    showCommandPalette: false // Hide command palette
  },
  tvCalibration: {
    diagonalInches: 55,
    resolutionWidth: 3840,
    resolutionHeight: 2160,
    targetSquareCm: CM_PER_INCH,
    squareUnit: 'in',
  },
};

/**
 * Keys that are not the GM's preferences and so never go into the plugin's data: the input mode
 * is the device's (local storage), the user's game system presets are vault files.
 */
const NOT_PREFERENCES = ['navigation', 'systemPresets'] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** `target` with `source`'s values on top, records merged key by key; keys only `source` has are kept. */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = (target as Record<string, unknown>)[key];
    if (isRecord(sourceValue) && isRecord(targetValue)) result[key] = deepMerge(targetValue, sourceValue);
    else if (sourceValue !== undefined) result[key] = sourceValue;
  }
  return result as T;
}

/** What Atlas reads from stored settings. */
export interface ReadSettings {
  settings: AtlasSettings;
  /** Bindings this Atlas does not apply (another version's actions or defaults), written back as they were. */
  foreignHotkeys: Record<string, string>;
}

/**
 * The settings as stored, over the defaults. Every key Atlas does not know, at any depth, is kept,
 * so settings a newer Atlas wrote survive a save by this one.
 */
export function readStoredSettings(stored: unknown, inputMode: NavigationInputMode): ReadSettings {
  const record: Partial<AtlasSettings> = isRecord(stored) ? stored : {};
  const merged = deepMerge(DEFAULT_SETTINGS, record);
  const hotkeys = readHotkeyOverrides(record.hotkeys);
  return {
    settings: {
      ...merged,
      hotkeys,
      navigation: { inputMode },
      experimental: isRecord(record.experimental) ? merged.experimental : {},
      toolbar: readToolbarLayout(record.toolbar),
    },
    // Never rewritten on reading: the settings are shared with devices that may run another version.
    foreignHotkeys: keptHotkeys(record.hotkeys),
  };
}

/** What goes into the plugin's data: the preferences, with the bindings of a newer Atlas kept. */
export function storedSettings(settings: AtlasSettings, foreign: Record<string, string>): Record<string, unknown> {
  const stored: Record<string, unknown> = { ...settings, hotkeys: { ...foreign, ...settings.hotkeys } };
  for (const key of NOT_PREFERENCES) delete stored[key];
  return stored;
}
