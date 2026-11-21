import type { App } from 'obsidian';
import type { NavigationInputMode } from './atlasSettings';
import { isLightingQualityLevel, type LightingQualityLevel } from '../lighting/lightingQuality';
import { parseGraphicsChoice, type GraphicsChoice } from '../lighting/graphicsSettings';
import type { DrawToolChoices } from '../annotations/annotationTypes';
import { drawToolFrom, rememberedDrawTool } from '../annotations/drawToolMemory';
import { readGmFogOpacity } from '../fog/gmFogOpacity';

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

/**
 * The vault's local storage. Obsidian stores a value only when it is truthy: `false`, `0` and `''`
 * remove the key, and read back as never chosen. Store every fact as a value that is never falsy.
 */
type DeviceStorage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;

export const isInputMode = (value: unknown): value is NavigationInputMode => value === 'mouse' || value === 'trackpad';

/** The input mode chosen on this device, or null when none was. */
export function loadInputMode(storage: DeviceStorage): NavigationInputMode | null {
  try {
    const stored: unknown = storage.loadLocalStorage(INPUT_MODE_STORAGE_KEY);
    return isInputMode(stored) ? stored : null;
  } catch (error) {
    console.error('[Atlas] Could not read the input mode of this device', error);
    return null;
  }
}

export function saveInputMode(storage: DeviceStorage, mode: NavigationInputMode): void {
  try {
    storage.saveLocalStorage(INPUT_MODE_STORAGE_KEY, mode);
  } catch (error) {
    console.error('[Atlas] Could not save the input mode of this device', error);
  }
}

/** The lighting quality chosen on this device, or null when none was. */
export function loadLightingQuality(storage: DeviceStorage): LightingQualityLevel | null {
  return loadQualityLevel(storage, LIGHTING_QUALITY_STORAGE_KEY);
}

export function saveLightingQuality(storage: DeviceStorage, level: LightingQualityLevel): void {
  saveQualityLevel(storage, LIGHTING_QUALITY_STORAGE_KEY, level);
}

/** The Graphics page's choice on this device, or null when none was made (an older stored level stands in, `loadLightingQuality`). */
export function loadGraphicsChoice(storage: DeviceStorage): GraphicsChoice | null {
  try {
    const stored: unknown = storage.loadLocalStorage(GRAPHICS_STORAGE_KEY);
    return typeof stored === 'string' ? parseGraphicsChoice(JSON.parse(stored)) : null;
  } catch (error) {
    console.error('[Atlas] Could not read the graphics choice of this device', error);
    return null;
  }
}

/** Stores the choice, its preset also under the older key for versions before the page; null forgets both, so the level Atlas picked for the device holds again. */
export function saveGraphicsChoice(storage: DeviceStorage, choice: GraphicsChoice | null): void {
  try {
    storage.saveLocalStorage(GRAPHICS_STORAGE_KEY, choice === null ? null : JSON.stringify(choice));
    storage.saveLocalStorage(LIGHTING_QUALITY_STORAGE_KEY, choice === null ? null : choice.preset);
  } catch (error) {
    console.error('[Atlas] Could not save the graphics choice of this device', error);
  }
}

/** The lighting quality Atlas picked for this device, or null before it was asked. */
export function loadPickedLightingQuality(storage: DeviceStorage): LightingQualityLevel | null {
  return loadQualityLevel(storage, PICKED_LIGHTING_QUALITY_STORAGE_KEY);
}

export function savePickedLightingQuality(storage: DeviceStorage, level: LightingQualityLevel): void {
  saveQualityLevel(storage, PICKED_LIGHTING_QUALITY_STORAGE_KEY, level);
}

function loadQualityLevel(storage: DeviceStorage, key: string): LightingQualityLevel | null {
  try {
    const stored: unknown = storage.loadLocalStorage(key);
    return isLightingQualityLevel(stored) ? stored : null;
  } catch (error) {
    console.error('[Atlas] Could not read the lighting quality of this device', error);
    return null;
  }
}

function saveQualityLevel(storage: DeviceStorage, key: string, level: LightingQualityLevel): void {
  try {
    storage.saveLocalStorage(key, level);
  } catch (error) {
    console.error('[Atlas] Could not save the lighting quality of this device', error);
  }
}

/** How the choice is stored: words, since a stored `false` would read as never chosen. */
const ANIMATE_ON = 'on';
const ANIMATE_OFF = 'off';

/** Whether animated maps play on this device, or null when it was never chosen. */
export function loadAnimateMaps(storage: DeviceStorage): boolean | null {
  try {
    const stored: unknown = storage.loadLocalStorage(ANIMATE_MAPS_STORAGE_KEY);
    // `true`: as the first builds stored it, which could store no `false`
    if (stored === ANIMATE_ON || stored === true) return true;
    return stored === ANIMATE_OFF ? false : null;
  } catch (error) {
    console.error('[Atlas] Could not read whether this device animates maps', error);
    return null;
  }
}

export function saveAnimateMaps(storage: DeviceStorage, on: boolean): void {
  try {
    storage.saveLocalStorage(ANIMATE_MAPS_STORAGE_KEY, on ? ANIMATE_ON : ANIMATE_OFF);
  } catch (error) {
    console.error('[Atlas] Could not save whether this device animates maps', error);
  }
}

/** Whether this device renders the player view with up to 4K pixels; off until chosen. */
export function loadPlayerView4k(storage: DeviceStorage): boolean {
  try {
    return storage.loadLocalStorage(PLAYER_VIEW_4K_STORAGE_KEY) === '4k';
  } catch (error) {
    console.error('[Atlas] Could not read the player view resolution of this device', error);
    return false;
  }
}

export function savePlayerView4k(storage: DeviceStorage, on: boolean): void {
  try {
    // Off removes the key: the default budget again
    storage.saveLocalStorage(PLAYER_VIEW_4K_STORAGE_KEY, on ? '4k' : null);
  } catch (error) {
    console.error('[Atlas] Could not save the player view resolution of this device', error);
  }
}

/** Whether the bar above a selection shows on this device under a mouse too: `shown`, else only under a finger. */
export const SELECTION_BAR_STORAGE_KEY = 'atlas-vtt:selection-bar';

/** Whether the bar above a selection shows on this device under a mouse too; off until chosen. */
export function loadSelectionBarShown(storage: DeviceStorage): boolean {
  try {
    return storage.loadLocalStorage(SELECTION_BAR_STORAGE_KEY) === 'shown';
  } catch (error) {
    console.error('[Atlas] Could not read whether this device shows the selection bar', error);
    return false;
  }
}

export function saveSelectionBarShown(storage: DeviceStorage, shown: boolean): void {
  try {
    // Off removes the key: under a finger only again
    storage.saveLocalStorage(SELECTION_BAR_STORAGE_KEY, shown ? 'shown' : null);
  } catch (error) {
    console.error('[Atlas] Could not save whether this device shows the selection bar', error);
  }
}

/** The Draw tool's choices as it starts on this device: the style it was last given, the defaults where none was. */
export function loadDrawTool(storage: DeviceStorage): DrawToolChoices {
  try {
    const stored: unknown = storage.loadLocalStorage(DRAW_TOOL_STORAGE_KEY);
    return drawToolFrom(typeof stored === 'string' ? JSON.parse(stored) : null);
  } catch (error) {
    console.error('[Atlas] Could not read the draw tool\'s choices of this device', error);
    return drawToolFrom(null);
  }
}

export function saveDrawTool(storage: DeviceStorage, choices: DrawToolChoices): void {
  try {
    storage.saveLocalStorage(DRAW_TOOL_STORAGE_KEY, JSON.stringify(rememberedDrawTool(choices)));
  } catch (error) {
    console.error('[Atlas] Could not save the draw tool\'s choices of this device', error);
  }
}

/** How opaque fog is in the GM's view on this device; the default until chosen, and where what is stored is no opacity. */
export function loadGmFogOpacity(storage: DeviceStorage): number {
  try {
    return readGmFogOpacity(storage.loadLocalStorage(GM_FOG_OPACITY_STORAGE_KEY));
  } catch (error) {
    console.error('[Atlas] Could not read the fog opacity of this device', error);
    return readGmFogOpacity(null);
  }
}

export function saveGmFogOpacity(storage: DeviceStorage, opacity: number): void {
  try {
    storage.saveLocalStorage(GM_FOG_OPACITY_STORAGE_KEY, String(readGmFogOpacity(opacity)));
  } catch (error) {
    console.error('[Atlas] Could not save the fog opacity of this device', error);
  }
}

/** A pen has touched a map on this device: `seen`, never a falsy value Obsidian would drop. */
export const PEN_SEEN_STORAGE_KEY = 'atlas-vtt:pen-seen';
/** What a finger does in a drawing tool on a device with a pen: `tool` or `pan`. */
export const FINGER_USE_STORAGE_KEY = 'atlas-vtt:finger-use';

/** Whether a finger in a drawing tool is the tool, as the pen is, or pans the map and leaves drawing to the pen. */
export type FingerUse = 'tool' | 'pan';

export function loadPenSeen(storage: DeviceStorage): boolean {
  try {
    return storage.loadLocalStorage(PEN_SEEN_STORAGE_KEY) === 'seen';
  } catch (error) {
    console.error('[Atlas] Could not read whether this device has a pen', error);
    return false;
  }
}

export function savePenSeen(storage: DeviceStorage): void {
  try {
    storage.saveLocalStorage(PEN_SEEN_STORAGE_KEY, 'seen');
  } catch (error) {
    console.error('[Atlas] Could not save that this device has a pen', error);
  }
}

/** What fingers do on this device, or null when it was never chosen. */
export function loadFingerUse(storage: DeviceStorage): FingerUse | null {
  try {
    const stored: unknown = storage.loadLocalStorage(FINGER_USE_STORAGE_KEY);
    return stored === 'tool' || stored === 'pan' ? stored : null;
  } catch (error) {
    console.error('[Atlas] Could not read what fingers do on this device', error);
    return null;
  }
}

export function saveFingerUse(storage: DeviceStorage, use: FingerUse): void {
  try {
    storage.saveLocalStorage(FINGER_USE_STORAGE_KEY, use);
  } catch (error) {
    console.error('[Atlas] Could not save what fingers do on this device', error);
  }
}

/** Whether the map shows its zoom buttons on this device while a mouse points: `shown`, never a falsy value Obsidian would drop. */
export const ZOOM_BUTTONS_STORAGE_KEY = 'atlas-vtt:zoom-buttons';

export function loadZoomButtons(storage: DeviceStorage): boolean {
  try {
    return storage.loadLocalStorage(ZOOM_BUTTONS_STORAGE_KEY) === 'shown';
  } catch (error) {
    console.error('[Atlas] Could not read whether this device shows the zoom buttons', error);
    return false;
  }
}

export function saveZoomButtons(storage: DeviceStorage, shown: boolean): void {
  try {
    storage.saveLocalStorage(ZOOM_BUTTONS_STORAGE_KEY, shown ? 'shown' : null);
  } catch (error) {
    console.error('[Atlas] Could not save whether this device shows the zoom buttons', error);
  }
}
