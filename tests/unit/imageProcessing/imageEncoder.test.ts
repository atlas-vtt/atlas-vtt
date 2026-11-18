import { describe, expect, it } from 'vitest';
import { createImageEncoder, type ProbeCanvas } from '../../../src/app/imageProcessing/imageEncoder';
import { imageMimeType } from '../../../src/app/imageProcessing/imageDimensions';
import { imageExtension } from '../../../src/app/services/assetImageFiles';

/** A canvas whose encoder answers a request for `image/webp` with `webpAs`, as WebKit answers with a PNG. */
function canvasOf(width: number, height: number, webpAs: string, asked: Array<ImageEncodeOptions | undefined>): ProbeCanvas {
  return {
    width,
    height,
    getContext: () => ({}),
    convertToBlob: (options) => {
      asked.push(options);
      const type = options?.type === 'image/webp' ? webpAs : options?.type ?? 'image/png';
      return Promise.resolve(new Blob(['x'], { type }));
    },
  };
}

describe('the encoder of derived pictures', () => {
  it('encodes WebP at the quality asked for where the platform can', async () => {
    const asked: Array<ImageEncodeOptions | undefined> = [];
    const encoder = createImageEncoder();
    const blob = await encoder.encode(canvasOf(256, 256, 'image/webp', asked), 0.8);
    expect(blob.type).toBe('image/webp');
    await encoder.encode(canvasOf(256, 256, 'image/webp', asked), 1);
    expect(asked).toEqual([{ type: 'image/webp', quality: 0.8 }, { type: 'image/webp', quality: 1 }]);
  });

  it('takes the PNG a request for WebP came back as, and asks for PNG directly afterwards', async () => {
    const asked: Array<ImageEncodeOptions | undefined> = [];
    const encoder = createImageEncoder();
    const first = await encoder.encode(canvasOf(256, 256, 'image/png', asked), 0.8);
    const second = await encoder.encode(canvasOf(512, 512, 'image/png', asked), 1);
    expect([first.type, second.type]).toEqual(['image/png', 'image/png']);
    expect(asked).toEqual([{ type: 'image/webp', quality: 0.8 }, { type: 'image/png' }]);
  });

  it('writes a picture wider than a WebP can be as PNG without forgetting that it encodes WebP', async () => {
    const asked: Array<ImageEncodeOptions | undefined> = [];
    const encoder = createImageEncoder();
    expect((await encoder.encode(canvasOf(20000, 100, 'image/webp', asked), 1)).type).toBe('image/png');
    expect((await encoder.encode(canvasOf(100, 100, 'image/webp', asked), 1)).type).toBe('image/webp');
    expect(asked).toEqual([{ type: 'image/png' }, { type: 'image/webp', quality: 1 }]);
  });

  it('never falls back to another format than PNG', async () => {
    const encoder = createImageEncoder();
    await expect(encoder.encode(canvasOf(8, 8, 'image/jpeg', []), 0.8)).rejects.toThrow(/WebP or PNG/);
  });

  it('names its format after one probe on a canvas of one pixel, and remembers it', async () => {
    const asked: Array<ImageEncodeOptions | undefined> = [];
    const sizes: Array<[number, number]> = [];
    const create = (webpAs: string) => (width: number, height: number): ProbeCanvas => {
      sizes.push([width, height]);
      return canvasOf(width, height, webpAs, asked);
    };
    const webkit = createImageEncoder();
    expect(await webkit.format(create('image/png'))).toBe('png');
    expect(await webkit.format(create('image/png'))).toBe('png');
    expect(sizes).toEqual([[1, 1]]);
    expect(await createImageEncoder().format(create('image/webp'))).toBe('webp');
  });

  it('asks nothing for the format once a picture was encoded', async () => {
    const encoder = createImageEncoder();
    await encoder.encode(canvasOf(8, 8, 'image/png', []), 0.8);
    expect(await encoder.format(() => { throw new Error('No probe is needed.'); })).toBe('png');
  });
});

describe('what a derived picture is called', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 4, 0, 0, 0, 4, 8, 6, 0, 0, 0]).buffer;
  const text = (value: string): number[] => [...value].map((c) => c.charCodeAt(0));
  const webp = new Uint8Array([...text('RIFF'), 100, 0, 0, 0, ...text('WEBP'), ...text('VP8 '), 10, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, 64, 0, 64, 0, 0]).buffer;

  it('by its bytes, not by the format that was asked for', () => {
    expect([imageExtension(png), imageMimeType(png)]).toEqual(['png', 'image/png']);
    expect([imageExtension(webp), imageMimeType(webp)]).toEqual(['webp', 'image/webp']);
  });
});
