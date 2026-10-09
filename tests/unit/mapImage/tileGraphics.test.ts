import { describe, expect, it } from 'vitest';
import {
  createTileGraphics,
  TILE_QUALITY,
  type CreateBitmap,
  type TileCanvas,
  type TileContext,
} from '../../../src/app/pixi/mapImage/tileGraphics';
import { FakeBitmap } from './fakeTileGraphics';

interface Recorded {
  calls: unknown[][];
  draws: unknown[][];
  encodes: Array<ImageEncodeOptions | undefined>;
}

function primitives(blobType = 'image/webp'): { graphics: ReturnType<typeof createTileGraphics>; recorded: Recorded } {
  const recorded: Recorded = { calls: [], draws: [], encodes: [] };
  const createImageBitmap = ((...args: unknown[]) => {
    recorded.calls.push(args);
    return Promise.resolve(new FakeBitmap(1, 1, 'crop'));
  }) as CreateBitmap;
  const context: TileContext = { drawImage: (...args: unknown[]) => void recorded.draws.push(args) };
  const createCanvas = (width: number, height: number): TileCanvas => ({
    width,
    height,
    getContext: () => context,
    convertToBlob: (options) => {
      recorded.encodes.push(options);
      return Promise.resolve(new Blob(['x'], { type: blobType }));
    },
    transferToImageBitmap: () => new FakeBitmap(width, height, 'composed'),
  });
  return { graphics: createTileGraphics({ createImageBitmap, createCanvas }), recorded };
}

describe('createTileGraphics', () => {
  it('resizes with medium quality and crops by the rect', async () => {
    const { graphics, recorded } = primitives();
    const source = new FakeBitmap(100, 80, 'source');
    await graphics.resize(source, 50, 40);
    await graphics.crop(source, { x: 9, y: 3, width: 20, height: 10 });
    expect(recorded.calls).toEqual([
      [source, { resizeWidth: 50, resizeHeight: 40, resizeQuality: 'medium' }],
      [source, 9, 3, 20, 10],
    ]);
  });

  it('encodes a tile from its rect as lossy WebP', async () => {
    const { graphics, recorded } = primitives();
    const source = new FakeBitmap(1000, 1000, 'source');
    const blob = await graphics.encodeTile(source, { x: 509, y: 0, width: 512, height: 511 });
    expect(blob.type).toBe('image/webp');
    expect(recorded.draws).toEqual([[source, 509, 0, 512, 511, 0, 0, 512, 511]]);
    expect(recorded.encodes).toEqual([{ type: 'image/webp', quality: TILE_QUALITY }]);
    expect(TILE_QUALITY).toBeLessThan(1);
  });

  it('refuses a system that cannot encode WebP', async () => {
    const { graphics } = primitives('image/png');
    await expect(graphics.encodeTile(new FakeBitmap(10, 10, 'source'), { x: 0, y: 0, width: 10, height: 10 })).rejects.toThrow(/WebP/);
  });

  it('composes parts onto one canvas', () => {
    const { graphics, recorded } = primitives();
    const tile = new FakeBitmap(512, 512, 'cache');
    const whole = graphics.compose(1000, 600, [{ source: tile, from: { x: 1, y: 0, width: 510, height: 510 }, to: { x: 510, y: 0, width: 510, height: 510 } }]);
    expect([whole.width, whole.height]).toEqual([1000, 600]);
    expect(recorded.draws).toEqual([[tile, 1, 0, 510, 510, 510, 0, 510, 510]]);
  });

  it('decodes through createImageBitmap', async () => {
    const { graphics, recorded } = primitives();
    const blob = new Blob(['x']);
    await graphics.decode(blob);
    expect(recorded.calls).toEqual([[blob]]);
  });
});
