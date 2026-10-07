import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasSource, Sprite, Texture } from 'pixi.js';
import { contrastColorForSprite } from '../../src/app/grid/gridContrastColor';

/** A 2D context whose image reads as one grey level; `drawImage` behaves like the browser's for what it is given. */
function stubContext(luminance: number, drawImage: (source: unknown) => void = () => {}): ReturnType<typeof vi.fn> {
  const draw = vi.fn(drawImage);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const data = new Uint8ClampedArray(this.width * this.height * 4).fill(luminance);
    return { drawImage: draw, getImageData: () => ({ data }) } as never;
  });
  return draw;
}

function canvasSprite(): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  return new Sprite(new Texture({ source: new CanvasSource({ resource: canvas }) }));
}

describe('contrastColorForSprite on any background sprite', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('reads a placeholder whose pixels are a byte array as not readable, without drawing it', () => {
    const draw = stubContext(255, () => { throw new TypeError("Failed to execute 'drawImage'"); });
    expect(contrastColorForSprite(new Sprite(Texture.WHITE))).toBeNull();
    expect(draw).not.toHaveBeenCalled();
  });

  it('samples an image it can draw, as before', () => {
    stubContext(230);
    expect(contrastColorForSprite(canvasSprite())).toBe(0x000000);
  });

  it('reads a source that cannot be drawn (a closed bitmap) as not readable', () => {
    stubContext(230, () => { throw new DOMException('The image source is detached', 'InvalidStateError'); });
    expect(contrastColorForSprite(canvasSprite())).toBeNull();
  });
});
