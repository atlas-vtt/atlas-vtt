import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import type { DetectableMap } from '../../src/app/pixi/spectralEngine/detectGrid';

const detectGridFromMapImage = vi.fn();
vi.mock('../../src/app/pixi/spectralEngine/spectralEngineService', () => ({
  detectGridOfMap: async (map: DetectableMap) => ({ result: (await detectGridFromMapImage(map)) as unknown, hits: null }),
}));

import { createViewAtlasStore } from '../../src/app/storeFactory';
import { autoDetectGridOnFirstLoad } from '../../src/app/services/gridAutoDetect';
import type { GridState } from '../../src/app/types/gridTypes';

const SETTLED_GRID: GridState = { enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, color: '#00FFFF', opacity: 0.5 };
const NEW_GRID: GridState = { ...SETTLED_GRID, autoDetect: true };
const mapImage: DetectableMap = {
  worldRect: { x: 0, y: 0, width: 2000, height: 1500 },
  imageSize: { width: 2000, height: 1500 },
  overview: () => Promise.resolve(null),
};

function setup(grid: GridState, background: string | null = 'maps/dungeon.webp', isPlayerView = false): ReturnType<typeof createViewAtlasStore> {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'auto-detect-test', undefined, isPlayerView);
  store.setState({ grid, background, persistenceEnabled: false });
  return store;
}

describe('autoDetectGridOnFirstLoad', () => {
  beforeEach(() => {
    detectGridFromMapImage.mockReset();
  });

  it('aligns the grid to the detected one and consumes the flag', async () => {
    detectGridFromMapImage.mockResolvedValue({ gridType: 'hex-vertical', cellSize: 83.21, offsetX: 40.2, offsetY: 17.7, confidence: 0.8 });
    const store = setup(NEW_GRID);

    await expect(autoDetectGridOnFirstLoad(store, mapImage)).resolves.toBe('found');

    expect(detectGridFromMapImage).toHaveBeenCalledWith(mapImage);
    expect(store.getState().grid).toMatchObject({ type: 'hex-vertical', size: 83.21, offsetX: 40.2, offsetY: 17.7, visible: true, color: '#00FFFF' });
    expect(store.getState().grid).not.toHaveProperty('autoDetect');
  });

  it('snaps to a grid it found and to nothing where the map has none', async () => {
    detectGridFromMapImage.mockResolvedValue({ gridType: 'square', cellSize: 64, offsetX: 0, offsetY: 0, confidence: 0.8 });
    const found = setup({ ...NEW_GRID, snapToGrid: false });
    await autoDetectGridOnFirstLoad(found, mapImage);
    expect(found.getState().grid?.snapToGrid).toBe(true);

    detectGridFromMapImage.mockResolvedValue(null);
    const none = setup({ ...NEW_GRID, snapToGrid: true });
    await autoDetectGridOnFirstLoad(none, mapImage);
    expect(none.getState().grid).toMatchObject({ visible: false, snapToGrid: false });
  });

  it('writes the stretch a map with cells that are not regular needs, and none for a regular one', async () => {
    detectGridFromMapImage.mockResolvedValue({ gridType: 'hex-vertical', cellSize: 35.3, offsetX: 4, offsetY: 9, confidence: 0.5, mapStretch: { x: 1.048, y: 1 } });
    const stretched = setup(NEW_GRID);
    await autoDetectGridOnFirstLoad(stretched, mapImage);
    expect(stretched.getState().grid).toMatchObject({ type: 'hex-vertical', size: 35.3, mapStretch: { x: 1.048, y: 1 } });

    detectGridFromMapImage.mockResolvedValue({ gridType: 'square', cellSize: 70, offsetX: 0, offsetY: 0, confidence: 0.9 });
    const regular = setup({ ...NEW_GRID, mapStretch: { x: 1.048, y: 1 } });
    await autoDetectGridOnFirstLoad(regular, mapImage);
    expect(regular.getState().grid).not.toHaveProperty('mapStretch');
  });

  it('hides the grid when the map has none, without throwing', async () => {
    detectGridFromMapImage.mockResolvedValue(null);
    const store = setup(NEW_GRID);

    // The caller offers the alignment for a map that showed no grid.
    await expect(autoDetectGridOnFirstLoad(store, mapImage)).resolves.toBe('none');

    expect(store.getState().grid).toMatchObject({ visible: false, size: 70 });
    expect(store.getState().grid).not.toHaveProperty('autoDetect');
  });

  it('treats a detection failure as a map without a grid', async () => {
    detectGridFromMapImage.mockRejectedValue(new Error('overview gone'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = setup(NEW_GRID);

    await expect(autoDetectGridOnFirstLoad(store, mapImage)).resolves.toBe('none');
    expect(store.getState().grid?.visible).toBe(false);
  });

  it('keeps the default grid on a scene without a background image', async () => {
    const store = setup(NEW_GRID, null);

    await autoDetectGridOnFirstLoad(store, mapImage);

    expect(detectGridFromMapImage).not.toHaveBeenCalled();
    expect(store.getState().grid).toMatchObject({ visible: true, size: 70 });
    expect(store.getState().grid).not.toHaveProperty('autoDetect');
  });

  it('leaves the grid alone once the flag has been consumed', async () => {
    const store = setup(SETTLED_GRID);

    await autoDetectGridOnFirstLoad(store, mapImage);

    expect(detectGridFromMapImage).not.toHaveBeenCalled();
    expect(store.getState().grid?.visible).toBe(true);
  });

  it('writes nothing once the load it belongs to was overtaken while the map was read', async () => {
    detectGridFromMapImage.mockResolvedValue({ gridType: 'square', cellSize: 50, offsetX: 1, offsetY: 2, confidence: 0.9 });
    const store = setup(NEW_GRID);

    await autoDetectGridOnFirstLoad(store, mapImage, () => false);

    expect(store.getState().grid).toEqual(NEW_GRID);
  });

  it('never runs in the player view', async () => {
    const store = setup(NEW_GRID, 'maps/dungeon.webp', true);

    await autoDetectGridOnFirstLoad(store, mapImage);

    expect(detectGridFromMapImage).not.toHaveBeenCalled();
    expect(store.getState().grid?.autoDetect).toBe(true);
  });

  it('shows the answer before it writes it, and writes nothing an undo could take back', async () => {
    const found = { gridType: 'square' as const, cellSize: 64, offsetX: 3, offsetY: 5, confidence: 0.9 };
    detectGridFromMapImage.mockResolvedValue(found);
    const store = setup(NEW_GRID);
    const steps = store.temporal.getState().pastStates.length;
    let shown: (() => void) | null = null;
    const events: string[] = [];

    const detection = autoDetectGridOnFirstLoad(store, mapImage, () => true, {
      found: (outcome) => new Promise((resolve) => {
        events.push(`found ${outcome.result?.cellSize}`);
        shown = resolve;
      }),
      none: () => events.push('none'),
    });
    await vi.waitFor(() => expect(shown).not.toBeNull());

    // The scan has the answer; the scene's grid waits for it to be revealed.
    expect(store.getState().grid).toHaveProperty('autoDetect', true);
    shown!();
    await expect(detection).resolves.toBe('found');
    expect(events).toEqual(['found 64']);
    expect(store.getState().grid).toMatchObject({ size: 64, offsetX: 3, offsetY: 5, visible: true });
    expect(store.temporal.getState().pastStates).toHaveLength(steps);
  });

  it('tells the show where the map has no grid, and writes nothing once the scene was left while the answer showed', async () => {
    detectGridFromMapImage.mockResolvedValue(null);
    const none = vi.fn();
    await expect(autoDetectGridOnFirstLoad(setup(NEW_GRID), mapImage, () => true, { none })).resolves.toBe('none');
    expect(none).toHaveBeenCalledOnce();

    detectGridFromMapImage.mockResolvedValue({ gridType: 'square', cellSize: 64, offsetX: 3, offsetY: 5, confidence: 0.9 });
    const store = setup(NEW_GRID);
    let current = true;
    const left = autoDetectGridOnFirstLoad(store, mapImage, () => current, { found: () => { current = false; return Promise.resolve(); } });
    await expect(left).resolves.toBe('skipped');
    expect(store.getState().grid).toHaveProperty('autoDetect', true);
  });
});
