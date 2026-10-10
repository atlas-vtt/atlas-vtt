import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import type { DetectableMap } from '../../src/app/pixi/gridDetection/detectGrid';

const detectGridFromMapImage = vi.fn();
vi.mock('../../src/app/pixi/gridDetection/detectGrid', () => ({ detectGridFromMapImage: (map: DetectableMap) => detectGridFromMapImage(map) }));

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
});
