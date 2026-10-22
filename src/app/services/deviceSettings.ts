import type { App } from 'obsidian';
import type { NavigationInputMode } from './atlasSettings';
import { isLightingQualityLevel, type LightingQualityLevel } from '../lighting/lightingQuality';

/**
 * Facts about this device, which Atlas keeps in the vault's local storage: they never sync,
 * so a laptop with a trackpad and a desktop with a mouse each keep their own.
 */
export const INPUT_MODE_STORAGE_KEY = 'atlas-vtt:input-mode';
/** How much the lighting may ask of this device's graphics (`LightingQualityLevel`). */
export const LIGHTING_QUALITY_STORAGE_KEY = 'atlas-vtt:lighting-quality';
/** Whether the initiative tracker is collapsed on this device: `collapsed` or `expanded`, never a falsy value Obsidian would drop. */
export const INITIATIVE_COLLAPSED_STORAGE_KEY = 'atlas-vtt:initiative-tracker';

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
  try {
    const stored: unknown = storage.loadLocalStorage(LIGHTING_QUALITY_STORAGE_KEY);
    return isLightingQualityLevel(stored) ? stored : null;
  } catch (error) {
    console.error('[Atlas] Could not read the lighting quality of this device', error);
    return null;
  }
}

export function saveLightingQuality(storage: DeviceStorage, level: LightingQualityLevel): void {
  try {
    storage.saveLocalStorage(LIGHTING_QUALITY_STORAGE_KEY, level);
  } catch (error) {
    console.error('[Atlas] Could not save the lighting quality of this device', error);
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
