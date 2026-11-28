import type { App } from 'obsidian';
import { Platform } from 'obsidian';
import { isLightingQualityLevel, type LightingQualityLevel } from '../lighting/lightingQuality';
import { parseGraphicsChoice, type GraphicsChoice } from '../lighting/graphicsSettings';
import { drawToolFrom, rememberedDrawTool } from '../annotations/drawToolMemory';
import type { DrawToolChoices } from '../annotations/annotationTypes';
import { readGmFogOpacity } from '../fog/gmFogOpacity';
import { readTableTvDevice, TABLE_TV_STORAGE_KEY } from './tableTvDevice';
import { applyChange, fields, whole, type PreferenceRow, type PreferenceStorage } from './preferences/preferenceRow';

/**
 * Facts about this device, which Atlas keeps in the vault's local storage: they never sync,
 * so a laptop with a trackpad and a desktop with a mouse each keep their own.
 */
export const INPUT_MODE_STORAGE_KEY = 'atlas-vtt:input-mode';
/** The lighting quality level as versions before the Graphics page stored the GM's choice; read where no `GRAPHICS_STORAGE_KEY` is stored. */
export const LIGHTING_QUALITY_STORAGE_KEY = 'atlas-vtt:lighting-quality';
/** The Graphics page's choice (`GraphicsChoice` as JSON): a preset and the knobs set away from it. */
export const GRAPHICS_STORAGE_KEY = 'atlas-vtt:graphics';
/** The lighting quality Atlas picked for this device the first time it was asked (`pickLightingQuality`), kept apart from the GM's choice. */
export const PICKED_LIGHTING_QUALITY_STORAGE_KEY = 'atlas-vtt:lighting-quality-picked';
/** Whether animated maps play on this device; unset follows the system's reduced motion (`animateMapsOn`). */
export const ANIMATE_MAPS_STORAGE_KEY = 'atlas-vtt:animate-maps';
/** Whether this device renders the player view with up to 4K pixels: `4k`, else the default budget. */
export const PLAYER_VIEW_4K_STORAGE_KEY = 'atlas-vtt:player-view-4k';
/** The Draw tool's last style on this device (`RememberedDrawTool` as JSON). */
export const DRAW_TOOL_STORAGE_KEY = 'atlas-vtt:draw-tool';
/** How opaque fog is in the GM's view on this device: a number from 0 to 1 as text, never a falsy value Obsidian would drop. */
export const GM_FOG_OPACITY_STORAGE_KEY = 'atlas-vtt:gm-fog-opacity';
/** Whether the bar above a selection shows on this device under a mouse too: `shown`, else only under a finger. */
export const SELECTION_BAR_STORAGE_KEY = 'atlas-vtt:selection-bar';
/** A pen has touched a map on this device: `seen`, never a falsy value Obsidian would drop. */
export const PEN_SEEN_STORAGE_KEY = 'atlas-vtt:pen-seen';
/** What a finger does in a drawing tool on a device with a pen: `tool` or `pan`. */
export const FINGER_USE_STORAGE_KEY = 'atlas-vtt:finger-use';
/** Whether the map shows its zoom buttons on this device while a mouse points: `shown`, never a falsy value Obsidian would drop. */
export const ZOOM_BUTTONS_STORAGE_KEY = 'atlas-vtt:zoom-buttons';

/**
 * How wheel events drive the map viewport.
 * - `mouse`: the wheel always zooms; right-drag pans.
 * - `trackpad`: two-finger scroll pans; pinch (Ctrl/Cmd + wheel) zooms.
 */
export type NavigationInputMode = 'mouse' | 'trackpad';

/** Whether a finger in a drawing tool is the tool, as the pen is, or pans the map and leaves drawing to the pen. */
export type FingerUse = 'tool' | 'pan';

/**
 * The vault's local storage. Obsidian stores a value only when it is truthy: `false`, `0` and `''`
 * remove the key, and read back as never chosen. Every row stores a value that is never falsy, or null to clear.
 */
export type DeviceStorage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;

export const isInputMode = (value: unknown): value is NavigationInputMode => value === 'mouse' || value === 'trackpad';

/** The input mode a device starts with: Macs mostly have a trackpad, other computers a mouse. */
export const defaultInputMode = (): NavigationInputMode => (Platform.isMacOS ? 'trackpad' : 'mouse');

const json = (stored: unknown): unknown => {
  if (typeof stored !== 'string') return stored;
  try {
    return JSON.parse(stored);
  } catch (error) {
    console.error('[Atlas] A setting of this device is no JSON; it reads as its default', error);
    return undefined;
  }
};
const asJson = { decode: json, encode: (value: unknown): unknown => JSON.stringify(value) };
const qualityLevel = (stored: unknown): LightingQualityLevel | null => (isLightingQualityLevel(stored) ? stored : null);
/** A switch stored as `word` while on, and as no key while off. */
const shownAs = (key: string, word: string): PreferenceRow<boolean> =>
  whole('device', key, (stored) => stored === word, { encode: (on) => (on ? word : null) });

/** The Graphics page's choice, its preset also under the older key for versions before the page; null forgets both. */
const graphics: PreferenceRow<GraphicsChoice | null> = {
  store: 'device',
  keys: [GRAPHICS_STORAGE_KEY, LIGHTING_QUALITY_STORAGE_KEY],
  read: (stored) => {
    const choice = parseGraphicsChoice(json(stored(GRAPHICS_STORAGE_KEY)));
    const level = qualityLevel(stored(LIGHTING_QUALITY_STORAGE_KEY));
    return choice ?? (level ? { preset: level, overrides: {} } : null);
  },
  write: (choice) => ({
    [GRAPHICS_STORAGE_KEY]: choice === null ? null : JSON.stringify(choice),
    [LIGHTING_QUALITY_STORAGE_KEY]: choice === null ? null : choice.preset,
  }),
};

/** What this device keeps of itself, each under its key in the vault's local storage. */
export const DEVICE_PREFERENCES = {
  /** Unset is this platform's default (`defaultInputMode`). */
  inputMode: whole('device', INPUT_MODE_STORAGE_KEY, (stored) => (isInputMode(stored) ? stored : defaultInputMode())),
  /** Null until the GM chose, at the page or with an older version's level. */
  graphics,
  /** Null before Atlas was first asked to pick (`pickLightingQuality`). */
  pickedLightingQuality: whole('device', PICKED_LIGHTING_QUALITY_STORAGE_KEY, qualityLevel),
  /** Null when never chosen (`animateMapsOn` decides then). Words, since a stored `false` would read as never chosen; `true` as the first builds stored it. */
  animateMaps: whole('device', ANIMATE_MAPS_STORAGE_KEY, (stored): boolean | null => (stored === 'on' || stored === true ? true : stored === 'off' ? false : null), {
    encode: (on) => (on ? 'on' : 'off'),
  }),
  playerView4k: shownAs(PLAYER_VIEW_4K_STORAGE_KEY, '4k'),
  selectionBar: shownAs(SELECTION_BAR_STORAGE_KEY, 'shown'),
  /** 0 to 1 (`readGmFogOpacity`), stored as text. */
  gmFogOpacity: whole('device', GM_FOG_OPACITY_STORAGE_KEY, readGmFogOpacity, { encode: (opacity) => String(readGmFogOpacity(opacity)) }),
  /** TrueScale's facts about the TVs this device shows the player view on (`tableTvDevice.ts`). */
  tableTvDevice: fields('device', TABLE_TV_STORAGE_KEY, readTableTvDevice, asJson),
  /** The Draw tool's choices as it starts: the style it was last given. */
  drawTool: whole<DrawToolChoices>('device', DRAW_TOOL_STORAGE_KEY, drawToolFrom, { decode: json, encode: (choices) => JSON.stringify(rememberedDrawTool(choices as DrawToolChoices)) }),
  penSeen: shownAs(PEN_SEEN_STORAGE_KEY, 'seen'),
  /** Null when never chosen. */
  fingerUse: whole('device', FINGER_USE_STORAGE_KEY, (stored): FingerUse | null => (stored === 'tool' || stored === 'pan' ? stored : null)),
  zoomButtons: shownAs(ZOOM_BUTTONS_STORAGE_KEY, 'shown'),
};

/** The device's local storage as a store rows read and write; what cannot be read or written is logged and left. */
export function deviceStorage(storage: DeviceStorage): PreferenceStorage {
  return {
    entry: (key) => {
      try {
        const stored: unknown = storage.loadLocalStorage(key);
        return stored ?? undefined;
      } catch (error) {
        console.error(`[Atlas] Could not read ${key} on this device`, error);
        return undefined;
      }
    },
    put: (change) => {
      for (const [key, stored] of Object.entries(change)) {
        try {
          storage.saveLocalStorage(key, stored ?? null);
        } catch (error) {
          console.error(`[Atlas] Could not save ${key} on this device`, error);
        }
      }
    },
  };
}

/** A device preference as this device keeps it. */
export function readDevice<T>(storage: DeviceStorage, row: PreferenceRow<T, never>): T {
  return row.read(deviceStorage(storage).entry);
}

/** Stores a change of a device preference; returns whether what reads back changed. */
export function writeDevice<T, C>(storage: DeviceStorage, row: PreferenceRow<T, C>, change: C): boolean {
  return applyChange(row, change, deviceStorage(storage));
}
