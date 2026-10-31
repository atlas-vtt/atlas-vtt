import type { App } from 'obsidian';
import type { NavigationInputMode } from './atlasSettings';
import { isLightingQualityLevel, type LightingQualityLevel } from '../lighting/lightingQuality';
import { parseGraphicsChoice, type GraphicsChoice } from '../lighting/graphicsSettings';

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
/** Whether the initiative tracker is collapsed on this device: `collapsed` or `expanded`, never a falsy value Obsidian would drop. */
export const INITIATIVE_COLLAPSED_STORAGE_KEY = 'atlas-vtt:initiative-tracker';

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

/** Whether the GM collapsed the initiative tracker on this device; expanded until chosen. */
export function loadInitiativeCollapsed(storage: DeviceStorage): boolean {
  try {
    return storage.loadLocalStorage(INITIATIVE_COLLAPSED_STORAGE_KEY) === 'collapsed';
  } catch (error) {
    console.error('[Atlas] Could not read how this device shows the initiative tracker', error);
    return false;
  }
}

export function saveInitiativeCollapsed(storage: DeviceStorage, collapsed: boolean): void {
  try {
    storage.saveLocalStorage(INITIATIVE_COLLAPSED_STORAGE_KEY, collapsed ? 'collapsed' : 'expanded');
  } catch (error) {
    console.error('[Atlas] Could not save how this device shows the initiative tracker', error);
  }
}
