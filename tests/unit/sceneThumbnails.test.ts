import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { SceneThumbnailUpdater, type SceneThumbnailPorts } from '../../src/app/services/SceneThumbnailUpdater';
import { MapThumbnailService } from '../../src/app/services/MapThumbnailService';
import type { ViewAtlasStore } from '../../src/app/storeFactory';
import type { SceneLighting } from '../../src/app/types/lightingTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const CAVE = 'atlas-vtt/collections/default/scenes/Cave.atlasmap';
const CRYPT = 'atlas-vtt/collections/default/scenes/Crypt.atlasmap';

interface ViewState {
  mapPath: string | null;
  mapLoaded: boolean;
  isMapLoading: boolean;
  isPlayerView: boolean;
  persistenceEnabled: boolean;
  background: string | null;
  grid: { size: number };
  objects: { tokens: Record<string, unknown> };
  lighting: SceneLighting;
}

function setup(thumbnails: Record<string, boolean> = {}) {
  const store = createStore<ViewState>(() => ({
    mapPath: null, mapLoaded: false, isMapLoading: false, isPlayerView: false, persistenceEnabled: true,
    background: null, grid: { size: 70 }, objects: { tokens: {} }, lighting: { enabled: false, ambient: 0.1 },
  }));
  const ports = {
    render: vi.fn(() => new TextEncoder().encode(`pixels of ${store.getState().mapPath}`).buffer),
    save: vi.fn(async () => {}),
    hasThumbnail: vi.fn(async (mapPath: string) => thumbnails[mapPath] ?? false),
  } satisfies SceneThumbnailPorts;
  const updater = new SceneThumbnailUpdater(store as unknown as ViewAtlasStore, ports);
  /** What a scene load does: the store is filled while loading, then the loading screen goes away. */
  const open = async (mapPath: string): Promise<void> => {
    store.setState({ isMapLoading: true, mapPath });
    store.setState({ background: `${mapPath}.webp`, objects: { tokens: {} } });
    store.setState({ isMapLoading: false });
    store.setState({ mapLoaded: true });
    await vi.waitFor(() => expect(ports.hasThumbnail).toHaveBeenCalledWith(mapPath));
  };
  const edit = (): void => store.setState({ objects: { tokens: { [crypto.randomUUID()]: {} } } });
  const savedPaths = (): string[] => ports.save.mock.calls.map(([path]) => path);
  const setLighting = (changes: Partial<SceneLighting>): void => store.setState({ lighting: { ...store.getState().lighting, ...changes } });
  return { store, ports, updater, open, edit, setLighting, savedPaths };
}

describe('SceneThumbnailUpdater', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('gives a newly opened scene without a thumbnail one shortly after it opens', async () => {
    const { ports, open, savedPaths } = setup();
    await open(CAVE);
    expect(ports.render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(savedPaths()).toEqual([CAVE]);
  });

  it('leaves the thumbnail of a scene that has one until the scene changes', async () => {
    const { ports, open, edit, savedPaths } = setup({ [CAVE]: true });
    await open(CAVE);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ports.render).not.toHaveBeenCalled();

    edit();
    await vi.advanceTimersByTimeAsync(2000);
    edit();
    await vi.advanceTimersByTimeAsync(2999);
    expect(ports.render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(savedPaths()).toEqual([CAVE]);
  });

  it('waits while the grid is being aligned, whose preview and marks are on the map, and takes the thumbnail after', async () => {
    const { store, ports, open, edit, savedPaths } = setup({ [CAVE]: true });
    await open(CAVE);
    edit();
    store.setState({ isGridAlignmentOpen: true } as Partial<ReturnType<typeof store.getState>>);

    await vi.advanceTimersByTimeAsync(10000);
    expect(ports.render).not.toHaveBeenCalled();

    store.setState({ isGridAlignmentOpen: false } as Partial<ReturnType<typeof store.getState>>);
    await vi.advanceTimersByTimeAsync(3000);
    expect(savedPaths()).toEqual([CAVE]);
  });

  it('takes no thumbnail of an alignment\'s preview when the view closes on it, and stops', async () => {
    const { store, ports, updater, open, edit } = setup({ [CAVE]: true });
    await open(CAVE);
    edit();
    store.setState({ isGridAlignmentOpen: true } as Partial<ReturnType<typeof store.getState>>);

    updater.destroy();
    await vi.advanceTimersByTimeAsync(10000);

    expect(ports.render).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('writes a pending thumbnail at once when the view moves on, never from another scene', async () => {
    const { store, ports, updater, open, edit, savedPaths } = setup({ [CAVE]: true, [CRYPT]: true });
    await open(CAVE);
    edit();
    updater.flush();
    expect(savedPaths()).toEqual([CAVE]);
    expect(new TextDecoder().decode(ports.render.mock.results[0]!.value as ArrayBuffer)).toBe(`pixels of ${CAVE}`);

    edit();
    store.setState({ isMapLoading: true, mapPath: CRYPT });
    await vi.advanceTimersByTimeAsync(5000);
    expect(savedPaths()).toEqual([CAVE]);
  });

  it('refreshes the thumbnail when the view loads the same scene again, e.g. to restore a snapshot', async () => {
    const { store, ports, savedPaths } = setup({ [CAVE]: true });
    store.setState({ isMapLoading: true, mapPath: CAVE });
    store.setState({ isMapLoading: false, mapLoaded: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(ports.render).not.toHaveBeenCalled();

    store.setState({ isMapLoading: true });
    store.setState({ isMapLoading: false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(savedPaths()).toEqual([CAVE]);
  });

  it('keeps the thumbnail of a scene whose file is being rewritten, also when it cannot be loaded again', async () => {
    const { store, ports, updater, open, edit } = setup({ [CAVE]: true });
    await open(CAVE);
    edit();
    // `suspendForRewrite`: the store is out of use, and the load that follows flushes first
    store.setState({ mapLoaded: false });
    updater.flush();
    edit();
    store.setState({ isMapLoading: true });
    // The load fails before it switches the store: the scene stays unloaded
    store.setState({ isMapLoading: false, mapPath: null });
    await vi.advanceTimersByTimeAsync(5000);
    expect(ports.render).not.toHaveBeenCalled();
  });

  it('refreshes the thumbnail once a rewritten scene is loaded again', async () => {
    const { store, updater, open, edit, savedPaths } = setup({ [CAVE]: true });
    await open(CAVE);
    edit();
    store.setState({ mapLoaded: false });
    updater.flush();
    await open(CAVE);
    await vi.advanceTimersByTimeAsync(1000);
    expect(savedPaths()).toEqual([CAVE]);
  });

  it('writes the pending thumbnail when the view closes and stops afterwards', async () => {
    const { ports, updater, open, edit, savedPaths } = setup();
    await open(CAVE);
    updater.destroy();
    expect(savedPaths()).toEqual([CAVE]);
    edit();
    await vi.advanceTimersByTimeAsync(5000);
    expect(ports.render).toHaveBeenCalledTimes(1);
  });

  it('does not schedule a thumbnail whose check finishes after the view closed', async () => {
    const { store, ports, updater } = setup();
    let answer: (exists: boolean) => void = () => {};
    ports.hasThumbnail.mockImplementation(() => new Promise<boolean>((resolve) => { answer = resolve; }));
    store.setState({ isMapLoading: true, mapPath: CAVE });
    store.setState({ isMapLoading: false });
    updater.destroy();
    answer(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ports.render).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<SceneLighting>]>([
    ['switching dynamic lighting on', { enabled: true }],
    ['a new ambient light level', { ambient: 0.6 }],
    ['a new ambient light colour', { ambientColor: '#ffd9a0' }],
    ['switching token vision off', { tokenVision: false }],
  ])('follows %s, which changes what the GM sees', async (_change, lighting) => {
    const { ports, open, setLighting, savedPaths } = setup({ [CAVE]: true });
    await open(CAVE);
    setLighting(lighting);
    await vi.advanceTimersByTimeAsync(2999);
    expect(ports.render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(savedPaths()).toEqual([CAVE]);
  });

  it('follows the ambient slider once it rests, with one thumbnail', async () => {
    const { ports, open, setLighting } = setup({ [CAVE]: true });
    await open(CAVE);
    for (const ambient of [0.2, 0.3, 0.4]) {
      setLighting({ ambient });
      await vi.advanceTimersByTimeAsync(500);
    }
    await vi.advanceTimersByTimeAsync(3000);
    expect(ports.render).toHaveBeenCalledTimes(1);
  });

  it.each<[string, Partial<SceneLighting>]>([
    ['the explored colour', { exploredColor: '#334455' }],
    ['the unexplored colour', { unexploredColor: '#112233' }],
    ['explored memory', { exploredMemory: false }],
    ['the lit threshold', { litThreshold: 0.5 }],
    ['the same values again', {}],
  ])('keeps the thumbnail when only %s changes, which the GM does not see', async (_change, lighting) => {
    const { ports, open, setLighting } = setup({ [CAVE]: true });
    await open(CAVE);
    setLighting(lighting);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ports.render).not.toHaveBeenCalled();
  });

  it('never writes thumbnails from the player view', async () => {
    const { store, ports, edit } = setup();
    store.setState({ isPlayerView: true });
    store.setState({ isMapLoading: true, mapPath: CAVE });
    store.setState({ isMapLoading: false });
    edit();
    await vi.advanceTimersByTimeAsync(5000);
    expect(ports.hasThumbnail).not.toHaveBeenCalled();
    expect(ports.render).not.toHaveBeenCalled();
  });
});

describe('MapThumbnailService.saveThumbnail', () => {
  const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;

  it('writes the thumbnail next to the scene, replaces it later and tells open lists', async () => {
    const { app, files } = createInMemoryApp({ files: { [CAVE]: '{}' } });
    const service = new MapThumbnailService(app);
    expect(await service.hasThumbnail(CAVE)).toBe(false);
    await service.saveThumbnail(CAVE, bytes('first'));
    await service.saveThumbnail(CAVE, bytes('second'));
    expect(files.get('atlas-vtt/collections/default/scenes/Cave.thumb.jpg')).toBe('second');
    expect(await service.hasThumbnail(CAVE)).toBe(true);
    expect(app.workspace.trigger).toHaveBeenCalledWith('atlas-vtt:scene-thumbnail-updated', CAVE);
  });

  it('replaces the thumbnail an older scene keeps in the hidden data folder', async () => {
    const legacyScene = 'atlas-vtt/collections/default/maps/Keep.atlasmap';
    const hidden = 'atlas-vtt/.atlas-data/collections/default/maps/Keep.thumb.jpg';
    const { app, files } = createInMemoryApp({ files: { [legacyScene]: '{}', [hidden]: 'old' } });
    const service = new MapThumbnailService(app);
    expect(await service.hasThumbnail(legacyScene)).toBe(true);
    await service.saveThumbnail(legacyScene, bytes('new'));
    expect(files.get(hidden)).toBe('new');
  });

  it('writes nothing for a scene whose map file is gone', async () => {
    const { app, files } = createInMemoryApp();
    await new MapThumbnailService(app).saveThumbnail(CAVE, bytes('pixels'));
    expect([...files.keys()]).toEqual([]);
    expect(app.workspace.trigger).not.toHaveBeenCalled();
  });

  it('moves the thumbnail of a deleted scene to the trash, also from the hidden data folder', async () => {
    const legacyScene = 'atlas-vtt/collections/default/maps/Keep.atlasmap';
    const hidden = 'atlas-vtt/.atlas-data/collections/default/maps/Keep.thumb.jpg';
    const visible = 'atlas-vtt/collections/default/scenes/Cave.thumb.jpg';
    const { app, files } = createInMemoryApp({ files: { [visible]: 'cave', [hidden]: 'keep' } });
    const service = new MapThumbnailService(app);
    await service.trashThumbnail(CAVE);
    await service.trashThumbnail(legacyScene);
    expect(files.has(visible)).toBe(false);
    expect(files.has(hidden)).toBe(false);
  });
});
