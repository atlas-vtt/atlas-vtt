import { describe, expect, it } from 'vitest';
import { artViewBox, opaqueInset } from '../../../src/app/initiative/art/opaqueInset';

/** A `size` × `size` image whose pixels `isArt` makes opaque, the rest transparent. */
function image(size: number, isArt: (x: number, y: number) => boolean): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) rgba[(y * size + x) * 4 + 3] = isArt(x, y) ? 255 : 0;
  return rgba;
}

describe('opaqueInset', () => {
  it('leaves art that fills its image as it is', () => {
    expect(opaqueInset(image(40, () => true), 40, 40)).toBeNull();
  });

  it('finds art cropped zoomed out inside transparent margins', () => {
    const inset = opaqueInset(image(100, (x, y) => x >= 20 && x < 80 && y >= 10 && y < 90), 100, 100)!;
    expect(inset).toEqual({ top: 0.1, right: 0.2, bottom: 0.1, left: 0.2 });
    expect(artViewBox(inset)).toBe('inset(10.00% 20.00% 10.00% 20.00%)');
  });

  it('pulls in past rounded corners until every edge is art, so no corner shows through', () => {
    const radius = 12;
    const inside = (x: number, y: number): boolean => {
      const cx = Math.min(Math.max(x, 10 + radius), 89 - radius);
      const cy = Math.min(Math.max(y, 10 + radius), 89 - radius);
      return x >= 10 && x < 90 && y >= 10 && y < 90 && (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
    };
    const rgba = image(100, inside);
    const inset = opaqueInset(rgba, 100, 100)!;
    const [top, left] = [Math.round(inset.top * 100), Math.round(inset.left * 100)];
    const [bottom, right] = [99 - Math.round(inset.bottom * 100), 99 - Math.round(inset.right * 100)];
    expect(top).toBeGreaterThan(10);
    // Its corners lie on art, or the next pixel in does
    for (const [x, y] of [[left + 1, top + 1], [right - 1, top + 1], [left + 1, bottom - 1], [right - 1, bottom - 1]]) expect(inside(x!, y!)).toBe(true);
  });

  it('keeps art too sparse for a solid box, and an empty image, as drawn', () => {
    expect(opaqueInset(image(50, (x, y) => (x + y) % 3 === 0), 50, 50)).toBeNull();
    expect(opaqueInset(image(50, () => false), 50, 50)).toBeNull();
  });
});
