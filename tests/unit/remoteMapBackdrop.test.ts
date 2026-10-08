import { describe, expect, it, vi } from 'vitest';
import type { Sprite } from 'pixi.js';
import { toGridOptions } from '../../src/app/grid/gridStateOptions';
import { RemoteMapBackdrop, type BackdropRenderer } from '../../src/app/remote-view/RemoteMapBackdrop';
import type { GridState } from '../../src/app/types/gridTypes';

const GRID: GridState = { enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 };
const MAP = { url: null, width: 1000, height: 800 };

function setup() {
  let grid: unknown = null;
  const renderer: BackdropRenderer = {
    setBackgroundSprite: vi.fn(),
    initGrid: vi.fn(() => { grid = {}; }),
    getGridSystem: () => grid,
  };
  const sprites: Array<{ width: number; height: number; destroyed: boolean }> = [];
  const createSprite = (width: number, height: number): Sprite => {
    const sprite = { width, height, destroyed: false };
    sprites.push(sprite);
    return sprite as unknown as Sprite;
  };
  return { renderer, sprites, backdrop: new RemoteMapBackdrop(renderer, createSprite) };
}

describe('RemoteMapBackdrop', () => {
  it('puts a placeholder of the map size under a scene without its image URL, and starts the grid once', () => {
    const { renderer, sprites, backdrop } = setup();
    backdrop.show(MAP, GRID);
    expect(sprites).toEqual([{ width: 1000, height: 800, destroyed: false }]);
    expect(renderer.setBackgroundSprite).toHaveBeenCalledWith(sprites[0]);
    expect(renderer.initGrid).toHaveBeenCalledWith(toGridOptions(GRID), sprites[0]);
    backdrop.show(MAP, GRID);
    expect(sprites).toHaveLength(1);
    expect(renderer.initGrid).toHaveBeenCalledOnce();
  });

  it('leaves the background to the map image once it has a URL, and puts a placeholder back when it goes', () => {
    const { renderer, sprites, backdrop } = setup();
    backdrop.show(MAP, GRID);
    backdrop.show({ ...MAP, url: 'blob:app://obsidian.md/map' }, GRID);
    expect(renderer.setBackgroundSprite).toHaveBeenCalledOnce();
    backdrop.show(MAP, GRID);
    expect(sprites).toHaveLength(2);
  });

  it('sizes a scene without a map size, or no scene, to twenty cells', () => {
    const { sprites, backdrop } = setup();
    backdrop.show({ url: null, width: 0, height: 0 }, { ...GRID, size: 50 });
    backdrop.show(null, GRID);
    expect(sprites.map(({ width, height }) => [width, height])).toEqual([[1000, 1000], [1400, 1400]]);
  });
});
