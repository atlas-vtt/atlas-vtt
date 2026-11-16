import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { removeSoundCache } from '../../../src/app/plugin/removeSoundCache';

type Outcome = 'success' | 'blocked' | 'error';

function rig(outcome: Outcome): { app: App; factory: IDBFactory; deleted: string[]; stored: Map<string, unknown> } {
  const stored = new Map<string, unknown>();
  const deleted: string[] = [];
  const app = {
    appId: 'vault-1',
    loadLocalStorage: (key: string): unknown => stored.get(key) ?? null,
    saveLocalStorage: (key: string, value: unknown): void => { stored.set(key, value); },
  } as unknown as App;
  const factory = {
    deleteDatabase: (name: string): IDBOpenDBRequest => {
      deleted.push(name);
      const request = {} as IDBOpenDBRequest;
      queueMicrotask(() => {
        if (outcome === 'success') request.onsuccess?.(new Event('success'));
        else if (outcome === 'blocked') request.onblocked?.(new Event('blocked') as IDBVersionChangeEvent);
        else request.onerror?.(new Event('error'));
      });
      return request;
    },
  } as unknown as IDBFactory;
  return { app, factory, deleted, stored };
}

describe('removing the old sound copy cache', () => {
  it('deletes the database once', async () => {
    const { app, factory, deleted, stored } = rig('success');
    await removeSoundCache(app, factory);
    await removeSoundCache(app, factory);
    expect(deleted).toEqual(['atlas-vtt-sound-copies-vault-1']);
    expect(stored.get('atlas-vtt:sound-cache-removed')).toBe(true);
  });

  it('tries again after a blocked delete', async () => {
    const { app, factory, deleted, stored } = rig('blocked');
    await removeSoundCache(app, factory);
    expect(stored.has('atlas-vtt:sound-cache-removed')).toBe(false);
    await removeSoundCache(app, factory);
    expect(deleted).toHaveLength(2);
  });

  it('never throws, and tries again after an error', async () => {
    const { app, factory, stored } = rig('error');
    await expect(removeSoundCache(app, factory)).resolves.toBeUndefined();
    expect(stored.has('atlas-vtt:sound-cache-removed')).toBe(false);
    const throwing = { deleteDatabase: (): never => { throw new Error('no'); } } as unknown as IDBFactory;
    await expect(removeSoundCache(app, throwing)).resolves.toBeUndefined();
  });
});
