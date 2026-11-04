import type { App } from 'obsidian';

const DEVICE_ID_KEY = 'atlas-vtt-device-id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LocalStorage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;

/**
 * A random id for this device, made once and kept in the vault's local
 * storage, which Obsidian keeps per device and never syncs. Files only one
 * device writes are named by it, so two devices never write the same file.
 */
export function deviceId(app: LocalStorage): string {
  const stored: unknown = app.loadLocalStorage(DEVICE_ID_KEY);
  if (typeof stored === 'string' && UUID.test(stored)) return stored;
  const id = crypto.randomUUID();
  app.saveLocalStorage(DEVICE_ID_KEY, id);
  return id;
}
