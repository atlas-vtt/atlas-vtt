import { afterEach, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';
import { GridSystem } from '../../src/app/grid/GridSystem';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let restoreGraphics: (() => void) | undefined;

afterEach(() => {
  restoreGraphics?.();
  restoreGraphics = undefined;
  vi.restoreAllMocks();
});

it('falls back to the default grid colour when the map texture cannot be drawn', () => {
  restoreGraphics = stubJsdomGraphics();
  const viewport = new Container();
  const background = new Sprite(Texture.WHITE); background.width = 200; background.height = 200;
  viewport.addChild(background);
  const grid = new GridSystem({ renderer: { resolution: 1 } } as any, viewport as any, background, { type: 'square', size: 100 });
  try {
    // A texture whose pixels cannot be drawn onto a canvas (a byte array, a closed bitmap) makes drawImage throw.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => { throw new TypeError("Failed to execute 'drawImage'"); },
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    } as never);
    // The colour is cached once sampled, so start from an unsampled grid.
    (grid as any).autoColor = null;
    const sprite = new Sprite(Texture.WHITE);
    expect(() => (grid as any).getAutoColor(sprite)).not.toThrow();
    expect((grid as any).getAutoColor(sprite)).toBe(0xffffff);
  } finally { grid.destroy(); }
});
