import type { App } from 'obsidian';

const STORAGE_KEY = 'atlas-vtt:recent-token-sounds';
/** How many recent picks the sound picker lists first. */
const MAX_RECENT_SOUNDS = 5;

type DeviceStorage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;

/**
 * The sound files the GM picked for tokens last, the latest first. Which sounds this GM reaches
 * for is a fact about this device, so it is kept in the vault's local storage and never synced.
 */
export function recentSounds(storage: DeviceStorage): string[] {
  // Trust boundary: local storage may hold another version's value, or nothing.
  const stored: unknown = storage.loadLocalStorage(STORAGE_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.filter((path): path is string => typeof path === 'string' && path !== '').slice(0, MAX_RECENT_SOUNDS);
}

/** Records that the GM picked `path`, making it the latest pick. */
export function rememberSound(storage: DeviceStorage, path: string): void {
  const recent = [path, ...recentSounds(storage).filter((other) => other !== path)];
  storage.saveLocalStorage(STORAGE_KEY, recent.slice(0, MAX_RECENT_SOUNDS));
}
