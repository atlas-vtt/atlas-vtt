import { Assets, WorkerManager, type UnresolvedAsset } from 'pixi.js';

/**
 * Unloads still in flight, by URL. `Assets.unload` destroys the texture only after
 * an await, so a load of the same URL in that window would get the texture that is
 * about to be destroyed.
 */
const pendingUnloads = new Map<string, Promise<void>>();

/** Loads an asset through PIXI's `Assets`, after any unload of the same URL has finished. */
export function loadAsset<T>(asset: string | (UnresolvedAsset & { src: string })): Promise<T> {
  const url = typeof asset === 'string' ? asset : asset.src;
  const pending = pendingUnloads.get(url);
  return pending ? pending.then(() => Assets.load<T>(asset)) : Assets.load<T>(asset);
}

/** Unloads an asset loaded with `loadAsset`, destroying its texture and source. Never rejects. */
export function unloadAsset(url: string): Promise<void> {
  const unload = Assets.unload(url)
    .catch((error: unknown) => {
      console.warn(`[assetLifecycle] Failed to unload ${url}:`, error);
    })
    .finally(() => {
      if (pendingUnloads.get(url) === unload) pendingUnloads.delete(url);
    });
  pendingUnloads.set(url, unload);
  return unload;
}

/**
 * Stops the workers PIXI decodes images in. It keeps them for the page's life, and their message
 * listeners would keep this copy of Atlas in memory after it unloads.
 */
export function releaseAssetWorkers(): void {
  WorkerManager.reset();
}
