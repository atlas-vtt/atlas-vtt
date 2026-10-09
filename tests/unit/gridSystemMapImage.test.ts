import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, type Graphics } from 'pixi.js';

const contrastColorForPixels = vi.fn<(pixels: unknown) => Promise<number | null>>();
vi.mock('../../src/app/grid/gridContrastColor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/grid/gridContrastColor')>()),
  contrastColorForPixels: (pixels: unknown) => contrastColorForPixels(pixels),
}));

import { GridSystem, type GridOptions } from '../../src/app/grid/GridSystem';
import { fakeMapImageView, settleGridColor, type FakeMapImageView } from '../helpers/fakeMapImageView';

const grids: GridSystem[] = [];

afterEach(() => {
  grids.splice(0).forEach((grid) => grid.destroy());
  contrastColorForPixels.mockReset();
});

function gridOver(map: FakeMapImageView, options: Partial<GridOptions> = {}): { grid: GridSystem; viewport: Container } {
  const viewport = new Container();
  viewport.addChild(new Container({ label: 'below' }), map.layer, new Container({ label: 'tokens' }));
  const grid = new GridSystem({ renderer: { resolution: 1 } } as never, viewport as never, map, { size: 50, ...options });
  grid.setMarking(true);
  grids.push(grid);
  return { grid, viewport };
}

/** The rect the grid is clipped to, in world units. */
function clip(grid: GridSystem): { x: number; y: number; width: number; height: number } {
  const sprite = grid.getGridSprite()!;
  const mask = sprite.mask as Graphics;
  const bounds = mask.getLocalBounds();
  return { x: sprite.x + mask.x + bounds.x, y: sprite.y + mask.y + bounds.y, width: bounds.width, height: bounds.height };
}

describe('the grid over a map image', () => {
  it('clips to the world rect and lies just above the image layer', () => {
    const map = fakeMapImageView(400, 300);
    const { grid, viewport } = gridOver(map, { color: 0xff0000 });

    expect(clip(grid)).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    expect(viewport.children.indexOf(grid.getGridSprite()!)).toBe(viewport.children.indexOf(map.layer) + 1);
  });

  it('follows the image to another size, takes itself off without one and comes back with the next', () => {
    const map = fakeMapImageView(400, 300);
    const { grid } = gridOver(map, { color: 0xff0000 });

    map.show({ x: 0, y: 0, width: 900, height: 600 });
    expect(clip(grid)).toEqual({ x: 0, y: 0, width: 900, height: 600 });

    map.show(null);
    expect(grid.getGridSprite()).toBeNull();
    expect(() => grid.setEnabled(true)).not.toThrow();
    expect(grid.getGridSprite()).toBeNull();

    map.show({ x: 0, y: 0, width: 200, height: 100 });
    expect(clip(grid)).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it('waits for the automatic colour read from the image, then draws in it', async () => {
    contrastColorForPixels.mockResolvedValue(0x000000);
    const map = fakeMapImageView(400, 300);
    const { grid } = gridOver(map);

    expect(grid.getGridSprite()).toBeNull();
    await settleGridColor();

    expect(contrastColorForPixels).toHaveBeenCalledWith(map);
    expect(grid.markColor()).toEqual({ color: 0x000000, contrasting: true });
  });

  it('reads the colour again for another image, and drops a reading of the one before', async () => {
    let answer: (color: number) => void = () => undefined;
    contrastColorForPixels.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    contrastColorForPixels.mockResolvedValueOnce(0xffffff);
    const map = fakeMapImageView(400, 300);
    const { grid } = gridOver(map);

    map.show({ x: 0, y: 0, width: 800, height: 600 });
    await settleGridColor();
    answer(0x000000);
    await settleGridColor();

    expect(contrastColorForPixels).toHaveBeenCalledTimes(2);
    expect(grid.markColor()).toEqual({ color: 0xffffff, contrasting: true });
    expect(clip(grid)).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('draws white where the image has no pixels to read, without asking again on every redraw', async () => {
    contrastColorForPixels.mockResolvedValue(null);
    const { grid } = gridOver(fakeMapImageView(400, 300));
    await settleGridColor();

    grid.setEnabled(true);

    expect(grid.markColor()).toEqual({ color: 0xffffff, contrasting: true });
    expect(contrastColorForPixels).toHaveBeenCalledTimes(1);
  });

  it('draws over a map image that replaces the first, and no longer follows the first', () => {
    const first = fakeMapImageView(400, 300);
    const { grid, viewport } = gridOver(first, { color: 0xff0000 });
    const second = fakeMapImageView(100, 100);
    viewport.addChildAt(second.layer, 0);

    grid.setMapImage(second);
    first.show({ x: 0, y: 0, width: 999, height: 999 });

    expect(clip(grid)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(viewport.children.indexOf(grid.getGridSprite()!)).toBe(1);
  });

  it('stops following the image once destroyed', () => {
    const map = fakeMapImageView(400, 300);
    const { grid } = gridOver(map, { color: 0xff0000 });
    grid.destroy();

    expect(() => map.show({ x: 0, y: 0, width: 10, height: 10 })).not.toThrow();
    expect(grid.getGridSprite()).toBeNull();
  });
});
