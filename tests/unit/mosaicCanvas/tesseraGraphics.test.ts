import { describe, expect, it } from 'vitest';
import {
  createTesseraGraphics,
  TESSERA_QUALITY,
  type CreateBitmap,
  type TesseraCanvas,
  type TesseraContext,
} from '../../../src/app/pixi/mosaicCanvas/tesseraGraphics';
import { FakeBitmap } from './fakeTesseraGraphics';

interface Recorded {
  calls: unknown[][];
  draws: unknown[][];
  encodes: Array<ImageEncodeOptions | undefined>;
  canvases: Array<[number, number]>;
  /** The `ImageData` sizes bitmaps were made of. */
  pixels: Array<[number, number, number]>;
}

interface Options {
  /** What a request for WebP comes back as: WebKit answers with a PNG. */
  webpAs?: string;
  /** The longest side a whole picture's canvas draws at; larger ones are refused, as `drawingCanvas` refuses them. */
  maxPictureSide?: number;
}

function primitives({ webpAs = 'image/webp', maxPictureSide = Infinity }: Options = {}): { graphics: ReturnType<typeof createTesseraGraphics>; recorded: Recorded } {
  const recorded: Recorded = { calls: [], draws: [], encodes: [], canvases: [], pixels: [] };
  const createImageBitmap = ((...args: unknown[]) => {
    recorded.calls.push(args);
    return Promise.resolve(new FakeBitmap(1, 1, 'crop'));
  }) as CreateBitmap;
  const context: TesseraContext = {
    drawImage: (...args: unknown[]) => void recorded.draws.push(args),
    getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4).fill(7) }),
  };
  const createCanvas = (width: number, height: number): TesseraCanvas => {
    recorded.canvases.push([width, height]);
    return {
      width,
      height,
      getContext: () => context,
      convertToBlob: (options) => {
        recorded.encodes.push(options);
        return Promise.resolve(new Blob(['x'], { type: options?.type === 'image/webp' ? webpAs : options?.type ?? 'image/png' }));
      },
      transferToImageBitmap: () => new FakeBitmap(width, height, 'composed'),
    };
  };
  const createPictureCanvas = (width: number, height: number): TesseraCanvas | null => (Math.max(width, height) > maxPictureSide ? null : createCanvas(width, height));
  const createImageData = (data: Uint8ClampedArray, width: number, height: number): ImageData => {
    recorded.pixels.push([width, height, data.length]);
    return { data, width, height, colorSpace: 'srgb' } as ImageData;
  };
  return { graphics: createTesseraGraphics({ createImageBitmap, createCanvas, createPictureCanvas, createImageData }), recorded };
}

describe('createTesseraGraphics', () => {
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

  it('encodes a tessera from its rect as lossless WebP', async () => {
    const { graphics, recorded } = primitives();
    const source = new FakeBitmap(1000, 1000, 'source');
    const blob = await graphics.encodeTessera(source, { x: 509, y: 0, width: 512, height: 511 });
    expect(blob.type).toBe('image/webp');
    expect(recorded.draws).toEqual([[source, 509, 0, 512, 511, 0, 0, 512, 511]]);
    expect(recorded.encodes).toEqual([{ type: 'image/webp', quality: TESSERA_QUALITY }]);
    expect(TESSERA_QUALITY).toBe(1);
  });

  it('writes PNG tesserae where a request for WebP comes back as PNG, and asks for PNG from then on', async () => {
    const { graphics, recorded } = primitives({ webpAs: 'image/png' });
    const source = new FakeBitmap(10, 10, 'source');
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect((await graphics.encodeTessera(source, rect)).type).toBe('image/png');
    expect((await graphics.encodeTessera(source, rect)).type).toBe('image/png');
    expect(recorded.encodes).toEqual([{ type: 'image/webp', quality: TESSERA_QUALITY }, { type: 'image/png' }]);
    expect(await graphics.tesseraFormat()).toBe('png');
  });

  it('names the format of its tesserae before it has encoded one', async () => {
    expect(await primitives().graphics.tesseraFormat()).toBe('webp');
    const webkit = primitives({ webpAs: 'image/png' });
    expect(await webkit.graphics.tesseraFormat()).toBe('png');
    expect(webkit.recorded.canvases).toEqual([[1, 1]]);
  });

  it('composes parts onto one canvas', async () => {
    const { graphics, recorded } = primitives();
    const tessera = new FakeBitmap(512, 512, 'cache');
    const whole = await graphics.compose(1000, 600, [{ source: tessera, from: { x: 1, y: 0, width: 510, height: 510 }, to: { x: 510, y: 0, width: 510, height: 510 } }]);
    expect([whole.width, whole.height]).toEqual([1000, 600]);
    expect(recorded.draws).toEqual([[tessera, 1, 0, 510, 510, 510, 0, 510, 510]]);
  });

  it('composes a picture no canvas of the device holds from pieces, none larger than 2048 px', async () => {
    const { graphics, recorded } = primitives({ maxPictureSide: 4096 });
    const level = new FakeBitmap(5000, 3000, 'source');
    const whole = { x: 0, y: 0, width: 5000, height: 3000 };
    await graphics.compose(5000, 3000, [{ source: level, from: whole, to: whole }]);
    expect(recorded.canvases).toEqual([[2048, 2048], [2048, 2048], [904, 2048], [2048, 952], [2048, 952], [904, 952]]);
    // Each piece draws the part shifted to its own corner; the pixels read back make one bitmap of the whole size.
    expect(recorded.draws[1]).toEqual([level, 0, 0, 5000, 3000, -2048, 0, 5000, 3000]);
    expect(recorded.draws[5]).toEqual([level, 0, 0, 5000, 3000, -4096, -2048, 5000, 3000]);
    expect(recorded.pixels).toEqual([[5000, 3000, 5000 * 3000 * 4]]);
  });

  it('decodes through createImageBitmap', async () => {
    const { graphics, recorded } = primitives();
    const blob = new Blob(['x']);
    await graphics.decode(blob);
    expect(recorded.calls).toEqual([[blob]]);
  });
});
