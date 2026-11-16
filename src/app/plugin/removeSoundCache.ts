import type { App } from 'obsidian';

/** Device-local: the cache lived in this device's IndexedDB, so each device removes it once. */
const REMOVED_KEY = 'atlas-vtt:sound-cache-removed';

function deleteDatabase(factory: IDBFactory, name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = (): void => resolve(true);
    request.onerror = (): void => resolve(false);
    // Another window holds it open: leave the flag unset so the next start tries again.
    request.onblocked = (): void => resolve(false);
  });
}

/**
 * Deletes the database of converted sound copies that earlier versions kept on this device. Sound copies now
 * are Opus files in the GM's folder, so nothing reads the database any more. Never throws into startup.
 */
export async function removeSoundCache(app: App, factory: IDBFactory = indexedDB): Promise<void> {
  try {
    if (app.loadLocalStorage(REMOVED_KEY) === true) return;
    if (await deleteDatabase(factory, `atlas-vtt-sound-copies-${app.appId}`)) app.saveLocalStorage(REMOVED_KEY, true);
  } catch (error) {
    console.warn('Atlas VTT: the old sound copy cache could not be removed.', error);
  }
}
