// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { createAtlasStorage } from '../../src/app/services/MapPersistence';
import { STALLED_SAVE_MS } from '../../src/app/services/sceneFileWriter';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));

const path = 'maps/cave.atlasmap';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('map save flushing', () => {
  it.each([false, true])('waits for the file write before closing, already started: %s', async (alreadyStarted) => {
    vi.useFakeTimers();
    const { app, files } = createInMemoryApp({ files: { [path]: '{}' } });
    const started = deferred();
    const release = deferred();
    const process = vi.mocked(app.vault.process).getMockImplementation()!;
    vi.spyOn(app.vault, 'process').mockImplementation(async (file, change) => {
      started.resolve();
      await release.promise;
      return process(file, change);
    });
    const storage = createAtlasStorage(app, { getState: () => ({ mapPath: path }) });
    await storage.setItem('atlas', { state: { revision: 1 }, version: 4 });
    if (alreadyStarted) await vi.advanceTimersByTimeAsync(500);
    let finished = false;
    const flushing = storage.flush().then(() => { finished = true; });
    try {
      await started.promise;
      await Promise.resolve();
      expect(finished).toBe(false);
    } finally { release.resolve(); await flushing; }
    expect(JSON.parse(files.get(path)!)).toEqual({ state: { revision: 1 }, version: 4 });
  });

  it('serializes saves so a slow older write cannot replace a newer snapshot', async () => {
    vi.useFakeTimers();
    const { app, files } = createInMemoryApp({ files: { [path]: '{}' } });
    const started = deferred();
    const release = deferred();
    const process = vi.mocked(app.vault.process).getMockImplementation()!;
    const spy = vi.spyOn(app.vault, 'process').mockImplementationOnce(async (file, change) => {
      started.resolve();
      await release.promise;
      return process(file, change);
    });
    const storage = createAtlasStorage(app, { getState: () => ({ mapPath: path }) });
    await storage.setItem('atlas', { state: { revision: 1 }, version: 4 });
    await vi.advanceTimersByTimeAsync(500);
    await started.promise;
    await storage.setItem('atlas', { state: { revision: 2 }, version: 4 });
    const flushing = storage.flush();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally { release.resolve(); await flushing; }
    expect(JSON.parse(files.get(path)!).state.revision).toBe(2);
  });

  it('does not recreate a map under its old name when it is renamed while a save waits', async () => {
    vi.useFakeTimers();
    const renamed = 'maps/cavern.atlasmap';
    const { app, files } = createInMemoryApp({ files: { [path]: '{}' } });
    const state = { mapPath: path };
    const storage = createAtlasStorage(app, { getState: () => state });

    await storage.setItem('atlas', { state: { revision: 1 }, version: 4 });
    await app.vault.rename(app.vault.getFileByPath(path)!, renamed);
    state.mapPath = renamed;
    await vi.advanceTimersByTimeAsync(500);

    expect(files.has(path)).toBe(false);
    expect(files.has(renamed)).toBe(true);
  });

  it('never saves a store that does not hold its map as loaded', async () => {
    vi.useFakeTimers();
    const { app, files } = createInMemoryApp({ files: { [path]: '{"state":{"revision":1}}' } });
    const state = { mapPath: path, mapLoaded: false };
    const storage = createAtlasStorage(app, { getState: () => state });

    await storage.setItem('atlas', { state: { revision: 2 }, version: 4 });
    await vi.advanceTimersByTimeAsync(500);
    await storage.flush();
    expect(files.get(path)).toBe('{"state":{"revision":1}}');

    state.mapLoaded = true;
    await storage.setItem('atlas', { state: { revision: 3 }, version: 4 });
    await storage.flush();
    expect(JSON.parse(files.get(path)!).state.revision).toBe(3);
  });

  it('reports a save that cannot finish instead of waiting for it forever, and lets later saves through', async () => {
    vi.useFakeTimers();
    const { app, files } = createInMemoryApp({ files: { [path]: '{}' } });
    const process = vi.mocked(app.vault.process).getMockImplementation()!;
    vi.spyOn(app.vault, 'process').mockImplementationOnce(() => new Promise<string>(() => {}));
    const storage = createAtlasStorage(app, { getState: () => ({ mapPath: path }) });

    await storage.setItem('atlas', { state: { revision: 1 }, version: 4 });
    let flushed = false;
    void storage.flush().then(() => { flushed = true; });
    await vi.advanceTimersByTimeAsync(STALLED_SAVE_MS);

    expect(flushed).toBe(true);
    expect(Notice).toHaveBeenCalledWith('Atlas VTT could not finish saving cave. Its latest changes may be missing from its file.', 0);

    vi.mocked(app.vault.process).mockImplementation(process);
    await storage.setItem('atlas', { state: { revision: 2 }, version: 4 });
    await storage.flush();
    expect(JSON.parse(files.get(path)!).state.revision).toBe(2);
  });

  it.each([
    ['a newer save of the scene', 'save'],
    ['the scene was loaded again', 'load'],
  ])('lets a write the flush gave up on change nothing once %s', async (_label, then) => {
    vi.useFakeTimers();
    const content = JSON.stringify({ version: 4, state: { revision: 0 } });
    const { app, files } = createInMemoryApp({ files: { [path]: content } });
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    const process = vi.mocked(app.vault.process).getMockImplementation()!;
    const stuck = deferred();
    // Obsidian gets to the stuck write's file only later
    vi.spyOn(app.vault, 'process').mockImplementationOnce(async (file, change) => {
      await stuck.promise;
      return process(file, change);
    });
    const storage = createAtlasStorage(app, { getState: () => ({ mapPath: path }) });

    await storage.setItem('atlas', { state: { revision: 1 }, version: 4 });
    void storage.flush();
    await vi.advanceTimersByTimeAsync(STALLED_SAVE_MS);
    if (then === 'save') {
      await storage.setItem('atlas', { state: { revision: 2 }, version: 4 });
      await storage.flush();
    } else {
      await storage.getItem('atlas');
    }
    const afterwards = files.get(path);

    stuck.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(files.get(path)).toBe(afterwards);
    expect(JSON.parse(files.get(path)!).state.revision).toBe(then === 'save' ? 2 : 0);
  });

  it('still creates the file of a new map on its first save', async () => {
    vi.useFakeTimers();
    const { app, files } = createInMemoryApp();
    const storage = createAtlasStorage(app, { getState: () => ({ mapPath: path }) });

    await storage.setItem('atlas', { state: { revision: 1 }, version: 4 });
    await vi.advanceTimersByTimeAsync(500);

    expect(JSON.parse(files.get(path)!)).toEqual({ state: { revision: 1 }, version: 4 });
  });
});
