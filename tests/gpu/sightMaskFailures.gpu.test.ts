import { Graphics, Sprite } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_CORNER, SightMask, type SightMaskShapes } from '../../src/app/pixi/lighting/SightMask';
import type { Point } from '../../src/app/types/visionTypes';

function rect(x: number, y: number, width: number, height: number): Point[] {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

/** A map of 300 by 200 px of which a square is shown, with its middle open and its far corner black. */
const SOUND: SightMaskShapes = { width: 300, height: 200, shown: [rect(20.5, 20.5, 100, 100)], darkness: [], pierced: [] };

/**
 * What the sight mask shows when it cannot compose its black: a plain black rectangle over the
 * whole map, one error in the console, and the picture again at the next sound composition.
 */
describe('the sight mask where its black cannot be composed', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    vi.restoreAllMocks();
  });

  function newMask(): SightMask {
    const mask = new SightMask();
    cleanup.push(() => mask.destroy());
    return mask;
  }

  function spriteOf(mask: SightMask): Sprite {
    return mask.view.children.find((child): child is Sprite => child instanceof Sprite)!;
  }

  /** `picture`: the composed mask shows. `blackout`: the black rectangle over the whole map does. */
  function showing(mask: SightMask): 'picture' | 'blackout' | 'nothing' | 'both' {
    const sprite = spriteOf(mask);
    const blackout = mask.view.children.find((child): child is Graphics => child instanceof Graphics)!;
    if (blackout.visible) {
      expect(blackout.getLocalBounds()).toMatchObject({ x: 0, y: 0, width: 300, height: 200 });
      expect(blackout.context.instructions.map((instruction) => (instruction.action === 'fill' ? [instruction.data.style.color, instruction.data.style.alpha] : null))).toEqual([[0x000000, 1]]);
    }
    if (sprite.visible) return blackout.visible ? 'both' : 'picture';
    return blackout.visible ? 'blackout' : 'nothing';
  }

  /** The alpha the composed mask holds at a world point of a map of a texel to the pixel. */
  function alphaAt(mask: SightMask, x: number, y: number): number {
    const canvas = spriteOf(mask).texture.source.resource as HTMLCanvasElement;
    return canvas.getContext('2d')!.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3]!;
  }

  it('hides the whole map for a corner that is no finite number or lies too far away, and shows the picture again once the polygons are sound', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mask = newMask();
    mask.compose(SOUND);
    expect(showing(mask)).toBe('picture');

    const broken = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, MAX_CORNER * 1.001, -3e17];
    for (const value of broken) {
      for (const where of ['shown', 'darkness', 'pierced'] as const) {
        for (const corner of [{ x: value, y: 120 }, { x: 120, y: value }]) {
          mask.compose({ ...SOUND, darkness: [rect(150, 50, 60, 60)], [where]: [[{ x: 20, y: 20 }, corner, { x: 120, y: 120 }]] });
          expect(showing(mask)).toBe('blackout');
        }
      }
    }
    expect(errors).toHaveBeenCalledTimes(broken.length * 3 * 2);

    mask.compose(SOUND);
    expect(showing(mask)).toBe('picture');
    expect([alphaAt(mask, 70, 70), alphaAt(mask, 200, 150)]).toEqual([0, 255]);
  });

  it('draws the sight whose corners lie as far away as a corner may', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mask = newMask();
    // A wedge from the map out to the bound, as a sight range of 70 thousand million feet gives on 70 px cells.
    mask.compose({ ...SOUND, shown: [[{ x: 150.3, y: 100.7 }, { x: MAX_CORNER, y: -MAX_CORNER / 3 }, { x: MAX_CORNER, y: MAX_CORNER / 2 }]] });
    expect(showing(mask)).toBe('picture');
    expect([alphaAt(mask, 250, 100), alphaAt(mask, 50, 100), alphaAt(mask, 160, 20)]).toEqual([0, 255, 255]);
    expect(errors).not.toHaveBeenCalled();
  });

  it('hides the whole map when its canvas has lost its context, which draws nothing and reads back as clear', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mask = newMask();
    // Every 2D context, the mask's and its scratch canvas' alike.
    const contexts = CanvasRenderingContext2D.prototype;
    // A lost context as the browser leaves it: every drawing call does nothing and every read gives transparent black.
    const lost = [
      vi.spyOn(contexts, 'isContextLost').mockReturnValue(true),
      vi.spyOn(contexts, 'fillRect').mockImplementation(() => undefined),
      vi.spyOn(contexts, 'clearRect').mockImplementation(() => undefined),
      vi.spyOn(contexts, 'fill').mockImplementation(() => undefined),
      vi.spyOn(contexts, 'drawImage').mockImplementation(() => undefined),
      vi.spyOn(contexts, 'putImageData').mockImplementation(() => undefined),
      vi.spyOn(contexts, 'getImageData').mockImplementation((_x, _y, width, height) => new ImageData(width, height)),
    ];
    mask.compose({ ...SOUND, shown: [] });
    expect(showing(mask)).toBe('blackout');
    mask.compose({ ...SOUND, darkness: [rect(150, 50, 60, 60)] });
    expect(showing(mask)).toBe('blackout');
    expect(errors).toHaveBeenCalledTimes(2);

    lost.forEach((spy) => spy.mockRestore());
    mask.compose(SOUND);
    expect(showing(mask)).toBe('picture');
    expect([alphaAt(mask, 70, 70), alphaAt(mask, 200, 150)]).toEqual([0, 255]);
  });

  it('draws nothing for a map without a size, which has nothing to hide', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mask = newMask();
    mask.compose(SOUND);
    for (const width of [0, -300, Number.NaN, Number.POSITIVE_INFINITY]) {
      mask.compose({ ...SOUND, width });
      expect(mask.view.children.map((child) => child.visible)).toEqual([false, false]);
      mask.compose({ ...SOUND, height: width });
      expect(mask.view.children.map((child) => child.visible)).toEqual([false, false]);
    }
    expect(errors).not.toHaveBeenCalled();
  });
});
