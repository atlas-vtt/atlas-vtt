import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Sprite } from 'pixi.js';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const detectGridFromSprite = vi.fn();
vi.mock('../../src/app/pixi/gridDetection/detectGrid', () => ({ detectGridFromSprite: (sprite: Sprite) => detectGridFromSprite(sprite) }));

import { createViewAtlasStore } from '../../src/app/storeFactory';
import { autoDetectGridOnFirstLoad } from '../../src/app/services/gridAutoDetect';
import type { GridState } from '../../src/app/types/gridTypes';

const SETTLED_GRID: GridState = { enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, color: '#00FFFF', opacity: 0.5 };
const NEW_GRID: GridState = { ...SETTLED_GRID, autoDetect: true };
const sprite = {} as unknown as Sprite;

function setup(grid: GridState, background: string | null = 'maps/dungeon.webp', isPlayerView = false): ReturnType<typeof createViewAtlasStore> {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'auto-detect-test', undefined, isPlayerView);
  store.setState({ grid, background, persistenceEnabled: false });
  return store;
}

describe('autoDetectGridOnFirstLoad', () => {
  beforeEach(() => {
    detectGridFromSprite.mockReset();
  });

  it('aligns the grid to the detected one and consumes the flag', () => {
    detectGridFromSprite.mockReturnValue({ gridType: 'hex-vertical', cellSize: 83.21, offsetX: 40.2, offsetY: 17.7, confidence: 0.8 });
    const store = setup(NEW_GRID);

    autoDetectGridOnFirstLoad(store, sprite);

    expect(detectGridFromSprite).toHaveBeenCalledWith(sprite);
    expect(store.getState().grid).toMatchObject({ type: 'hex-vertical', size: 83.21, offsetX: 40.2, offsetY: 17.7, visible: true, color: '#00FFFF' });
    expect(store.getState().grid).not.toHaveProperty('autoDetect');
  });

  it('hides the grid when the map has none, without throwing', () => {
    detectGridFromSprite.mockReturnValue(null);
    const store = setup(NEW_GRID);

    autoDetectGridOnFirstLoad(store, sprite);

    expect(store.getState().grid).toMatchObject({ visible: false, size: 70 });
    expect(store.getState().grid).not.toHaveProperty('autoDetect');
  });

  it('treats a detection failure as a map without a grid', () => {
    detectGridFromSprite.mockImplementation(() => { throw new Error('texture gone'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = setup(NEW_GRID);

    expect(() => autoDetectGridOnFirstLoad(store, sprite)).not.toThrow();
    expect(store.getState().grid?.visible).toBe(false);
  });

  it('keeps the default grid on a scene without a background image', () => {
    const store = setup(NEW_GRID, null);

    autoDetectGridOnFirstLoad(store, sprite);

    expect(detectGridFromSprite).not.toHaveBeenCalled();
    expect(store.getState().grid).toMatchObject({ visible: true, size: 70 });
    expect(store.getState().grid).not.toHaveProperty('autoDetect');
  });

  it('leaves the grid alone once the flag has been consumed', () => {
    const store = setup(SETTLED_GRID);

    autoDetectGridOnFirstLoad(store, sprite);

    expect(detectGridFromSprite).not.toHaveBeenCalled();
    expect(store.getState().grid?.visible).toBe(true);
  });

  it('never runs in the player view', () => {
    const store = setup(NEW_GRID, 'maps/dungeon.webp', true);

    autoDetectGridOnFirstLoad(store, sprite);

    expect(detectGridFromSprite).not.toHaveBeenCalled();
    expect(store.getState().grid?.autoDetect).toBe(true);
  });
});
