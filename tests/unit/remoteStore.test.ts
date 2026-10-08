import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';

/** Every file and folder of the in-memory vault, in a stable order. */
function vaultSnapshot(files: Map<string, string>, folders: Set<string>): string {
  return JSON.stringify([[...files].sort(), [...folders].sort()]);
}

describe('remote view store', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts without saving, without history and as a player view without a map file', () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, 'remote-1', undefined, false, { remote: true });
    const state = store.getState();
    expect(state.persistenceEnabled).toBe(false);
    expect(state.isPlayerView).toBe(true);
    expect(state.isGMView).toBe(false);
    expect(state.mapPath).toBeNull();
    expect(state.remoteView).toMatchObject({ movableTokenIds: [], conditions: [], diceLog: [], ownRoll: null });
    expect(state.remoteView?.status).toEqual({ title: '', connection: '', tone: 'pending', message: null });
    expect(getHistoryStore(store)?.getState().isTracking).toBe(false);
  });

  it('never reads or writes the vault and records no undo step, even with saving switched on and a map path set', async () => {
    const { app, files, folders } = createInMemoryApp({ files: { 'maps/mine.atlasmap': '{"mine":true}' } });
    const before = vaultSnapshot(files, folders);
    const store = createViewAtlasStore(app, 'remote-2', undefined, false, { remote: true });
    store.getState().setPersistenceEnabled(true);
    store.getState().setMapPath('maps/mine.atlasmap');
    const id = store.getState().addToken({ x: 10, y: 10, imagePath: 'blob:app://obsidian.md/abc' });
    store.getState().moveToken(id, 70, 70);
    await store.flushStorage();
    // Past every save debounce Atlas has.
    await vi.advanceTimersByTimeAsync(5000);
    expect(vaultSnapshot(files, folders)).toBe(before);
    expect(app.vault.create).not.toHaveBeenCalled();
    expect(app.vault.process).not.toHaveBeenCalled();
    expect(app.vault.read).not.toHaveBeenCalled();
    expect(app.vault.adapter.write).not.toHaveBeenCalled();
    expect(app.vault.adapter.read).not.toHaveBeenCalled();
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(0);
  });

  it('leaves normal stores as they were: saved, tracked, without a remote part', () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, 'map-1');
    expect(store.getState().remoteView).toBeNull();
    expect(store.getState().persistenceEnabled).toBe(true);
    expect(store.getState().isPlayerView).toBe(false);
    expect(store.getState().isGMView).toBe(true);
    expect(getHistoryStore(store)?.getState().isTracking).toBe(true);
    const saved = store.persist.getOptions().partialize?.(store.getState()) ?? {};
    expect(Object.keys(saved)).not.toContain('remoteView');
    store.getState().addToken({ x: 1, y: 1, imagePath: 'art/a.png' });
    expect(getHistoryStore(store)?.getState().pastStates.length).toBeGreaterThan(0);
  });

  it('ignores a remote part in a map file: only the remote view has one', () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, 'map-2');
    const merge = store.persist.getOptions().merge;
    const merged = merge?.({ remoteView: { status: {} }, isPlayerView: false }, store.getState());
    expect(merged?.remoteView).toBeNull();
  });

  it('keeps a player view store a player view, without a remote part', () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, 'player-1', undefined, true);
    expect(store.getState().isPlayerView).toBe(true);
    expect(store.getState().remoteView).toBeNull();
  });
});
