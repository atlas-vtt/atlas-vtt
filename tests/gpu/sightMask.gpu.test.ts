import { Sprite } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { MASK_MAX_SIDE, SightMask, maskTexel, type SightMaskShapes } from '../../src/app/pixi/lighting/SightMask';
import type { Point } from '../../src/app/types/visionTypes';
import { maskCovers } from '../helpers/sightMaskWatch';

function rect(x: number, y: number, width: number, height: number): Point[] {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

/** A polygon turned about its first corner, so that none of its edges runs along the texels. */
function turned(polygon: readonly Point[], degrees: number): Point[] {
  const [pivot] = polygon;
  const [cos, sin] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
  return polygon.map(({ x, y }) => ({ x: pivot!.x + (x - pivot!.x) * cos - (y - pivot!.y) * sin, y: pivot!.y + (x - pivot!.x) * sin + (y - pivot!.y) * cos }));
}

/** The texels of a composed mask, and where each lies on the map. */
interface Texels {
  width: number;
  height: number;
  /** The longer side of a texel in world pixels. */
  texel: number;
  /** The texel's alpha, 0 to 255. */
  alpha: (column: number, row: number) => number;
  /** The world corner of a texel at its top left. */
  corner: (column: number, row: number) => Point;
  /** Texels that are anything but clear or opaque black. */
  blended: number;
}

function texelsOf(mask: SightMask): Texels {
  const sprite = mask.view.children.find((child): child is Sprite => child instanceof Sprite)!;
  const canvas = sprite.texture.source.resource as HTMLCanvasElement;
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  let blended = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0 || (data[i + 3] !== 0 && data[i + 3] !== 255)) blended++;
  }
  return {
    width: canvas.width,
    height: canvas.height,
    texel: Math.max(sprite.scale.x, sprite.scale.y),
    alpha: (column, row) => data[(row * canvas.width + column) * 4 + 3]!,
    corner: (column, row) => ({ x: sprite.position.x + column * sprite.scale.x, y: sprite.position.y + row * sprite.scale.y }),
    blended,
  };
}

/** Points over a square of world pixels: its corners, edges and inside, every `step`. */
function probes(x: number, y: number, size: number, step: number): Point[] {
  const points: Point[] = [];
  for (let dy = 0; dy <= size + 1e-9; dy += step) {
    for (let dx = 0; dx <= size + 1e-9; dx += step) points.push({ x: x + dx, y: y + dy });
  }
  return points;
}

/**
 * How far around an open texel nothing is hidden in the shapes of these tests, in texels. It is
 * more than the mask promises (nothing shows where what is hidden has a texel to spare), and
 * holds here because none of these shapes is a thin strip lying flat: see the last test.
 */
const CLEAR = 0.75;
/** How far the black may reach into what is shown, in texels: the one an edge passes through and the one beside it. */
const BAND = 2;

/**
 * How a composed mask stands to the polygons it was composed from. `leaking` counts open texels
 * with anything meant to be black in them or within `CLEAR` texels around them; `overreach`
 * counts black texels on the map with nothing meant to be black within `BAND` texels around them.
 */
function judge(mask: SightMask, shapes: SightMaskShapes): { leaking: number; overreach: number; open: number; black: number; blended: number } {
  const texels = texelsOf(mask);
  const { texel, width, height } = texels;
  const tally = { leaking: 0, overreach: 0, open: 0, black: 0, blended: texels.blended };
  const onMap = (point: Point): boolean => point.x > 0 && point.y > 0 && point.x < shapes.width && point.y < shapes.height;
  const isHidden = (point: Point): boolean => onMap(point) && maskCovers(shapes, point.x, point.y);
  /** Whether a texel of the other kind lies within three texels: only there can an edge be. */
  const nearOther = (column: number, row: number, open: boolean): boolean => {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const [c, r] = [column + dx, row + dy];
        if (c >= 0 && r >= 0 && c < width && r < height && (texels.alpha(c, r) === 0) !== open) return true;
      }
    }
    return false;
  };
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const { x, y } = texels.corner(column, row);
      const open = texels.alpha(column, row) === 0;
      const edge = nearOther(column, row, open);
      if (open) {
        tally.open++;
        // Deep inside the open, its middle answers for it; near black, every eighth of a texel of it and of its margin.
        const points = edge ? probes(x - CLEAR * texel, y - CLEAR * texel, (1 + 2 * CLEAR) * texel, texel / 8) : [{ x: x + texel / 2, y: y + texel / 2 }];
        if (points.some(isHidden)) tally.leaking++;
      } else {
        tally.black++;
        const points = probes(x - BAND * texel, y - BAND * texel, (1 + 2 * BAND) * texel, edge ? texel / 4 : (1 + 2 * BAND) * texel);
        if (points.every((point) => onMap(point) && !maskCovers(shapes, point.x, point.y))) tally.overreach++;
      }
    }
  }
  return tally;
}

describe('the sight mask: black composed on a canvas, never open where a polygon does not reach', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  function compose(shapes: SightMaskShapes): SightMask {
    const mask = new SightMask();
    cleanup.push(() => mask.destroy());
    mask.compose(shapes);
    return mask;
  }

  // Sight that overlaps in twos and threes, a sliver, a spike, a polygon that reaches past the map, and a pocket between them.
  const shown = (scale: number): Point[][] => [
    turned(rect(20.3, 30.7, 90, 70), 7),
    turned(rect(60.6, 50.2, 80, 90), -11),
    turned(rect(75.1, 20.9, 40, 120), 23),
    [{ x: 150.2, y: 150.4 }, { x: 290.7, y: 151.1 }, { x: 150.9, y: 152.3 }],
    turned(rect(200.4, 40.6, 150, 60), 31),
    [{ x: 10.5, y: 160.5 }, { x: 60.5, y: 160.5 }, { x: 60.5, y: 190.5 }, { x: 45.5, y: 190.5 }, { x: 35.2, y: 170.1 }, { x: 25.5, y: 190.5 }, { x: 10.5, y: 190.5 }],
  ].map((polygon) => polygon.map(({ x, y }) => ({ x: x * scale, y: y * scale })));

  it.each([
    { name: 'a map of a texel to the pixel', scale: 1 },
    { name: 'a map of 8,192 px, four pixels to the texel', scale: 8192 / 300 },
  ])('opens no texel with anything hidden in it or within three quarters of a texel, and hides no more than two texels into what is shown: $name', ({ scale }) => {
    const shapes: SightMaskShapes = { width: 300 * scale, height: 200 * scale, shown: shown(scale), darkness: [], pierced: [] };
    expect(maskTexel(shapes.width, shapes.height)).toBe(Math.max(1, (300 * scale) / MASK_MAX_SIDE));
    const tally = judge(compose(shapes), shapes);
    expect({ leaking: tally.leaking, overreach: tally.overreach, blended: tally.blended }).toEqual({ leaking: 0, overreach: 0, blended: 0 });
    expect(tally.open).toBeGreaterThan(5_000);
    expect(tally.black).toBeGreaterThan(5_000);
  });

  it('leaves no black between two polygons that end on one line from either side, as two rooms seen through one wall', () => {
    const wall = { from: { x: 90.37, y: 10.2 }, to: { x: 131.81, y: 180.6 } };
    const shapes: SightMaskShapes = {
      width: 300, height: 200, darkness: [], pierced: [],
      shown: [[{ x: 20, y: 20 }, wall.from, wall.to, { x: 20, y: 170 }], [wall.from, { x: 260, y: 20 }, { x: 260, y: 170 }, wall.to]],
    };
    const mask = compose(shapes);
    const texels = texelsOf(mask);
    // Along the wall, well inside both polygons' other edges.
    let black = 0;
    for (let step = 0.2; step <= 0.8; step += 0.01) {
      const [x, y] = [wall.from.x + (wall.to.x - wall.from.x) * step, wall.from.y + (wall.to.y - wall.from.y) * step];
      if (texels.alpha(Math.floor(x), Math.floor(y)) !== 0) black++;
    }
    expect(black).toBe(0);
    expect(judge(mask, shapes)).toMatchObject({ leaking: 0, overreach: 0, blended: 0 });
  });

  it('keeps a magical darkness black over what is shown, open only where a sense sees into it', () => {
    const shapes: SightMaskShapes = {
      width: 300, height: 200,
      shown: [turned(rect(10.4, 10.6, 270, 170), 2)],
      darkness: [turned(rect(100.3, 60.7, 90, 80), 14), turned(rect(160.2, 40.1, 70, 60), -9)],
      pierced: [turned(rect(120.8, 20.3, 40, 160), 5)],
    };
    const tally = judge(compose(shapes), shapes);
    expect({ leaking: tally.leaking, overreach: tally.overreach, blended: tally.blended }).toEqual({ leaking: 0, overreach: 0, blended: 0 });
    expect(maskCovers(shapes, 180, 100)).toBe(true);
    expect(maskCovers(shapes, 140, 100)).toBe(false);
  });

  it('is clear all over while the players see all of the map, but for a magical darkness', () => {
    const shapes: SightMaskShapes = { width: 300, height: 200, shown: null, darkness: [], pierced: [] };
    expect(judge(compose(shapes), shapes)).toMatchObject({ black: 0, blended: 0 });
    const dark: SightMaskShapes = { ...shapes, darkness: [turned(rect(100.3, 60.7, 90, 80), 14)] };
    const tally = judge(compose(dark), dark);
    expect({ leaking: tally.leaking, overreach: tally.overreach }).toEqual({ leaking: 0, overreach: 0 });
    expect(tally.black).toBeGreaterThan(5_000);
  });

  it('draws the sight of a token that sees for millions of pixels as far as the map goes', () => {
    // A wedge from a token on the map out to 2.1 million px, as a sight range of 150,000 ft gives.
    const far = 2_100_000;
    const shapes: SightMaskShapes = { width: 300, height: 200, shown: [[{ x: 150.3, y: 100.7 }, { x: far, y: -far / 3 }, { x: far, y: far / 2 }]], darkness: [], pierced: [] };
    const tally = judge(compose(shapes), shapes);
    expect({ leaking: tally.leaking, overreach: tally.overreach }).toEqual({ leaking: 0, overreach: 0 });
    expect(tally.open).toBeGreaterThan(3_000);
  });

  it('follows the map to another size with a canvas of that size, and shows nothing once cleared', () => {
    const mask = compose({ width: 300, height: 200, shown: [], darkness: [], pierced: [] });
    expect(texelsOf(mask)).toMatchObject({ width: 300, height: 200, texel: 1 });
    const larger: SightMaskShapes = { width: 4096, height: 1000, shown: [rect(500.5, 100.5, 900, 600)], darkness: [], pierced: [] };
    mask.compose(larger);
    expect(texelsOf(mask)).toMatchObject({ width: 2048, height: 500, texel: 2 });
    expect(judge(mask, larger)).toMatchObject({ leaking: 0, overreach: 0 });
    mask.clear();
    expect(mask.view.children.map((child) => child.visible)).toEqual([false, false]);
  });

  it('covers the map and nothing beyond it, in whole texels, and is clear to the edge where all of the map is shown', () => {
    // A side the texel does not divide: 1,366 rows of a little under four pixels.
    const shapes: SightMaskShapes = { width: 8192, height: 5461.3, shown: [rect(0, 0, 8192, 5461.3)], darkness: [], pierced: [] };
    const mask = compose(shapes);
    const texels = texelsOf(mask);
    expect(texels).toMatchObject({ width: 2048, height: 1366, texel: 4 });
    expect(texels.corner(0, 0)).toEqual({ x: 0, y: 0 });
    expect(texels.corner(texels.width, texels.height).x).toBeCloseTo(8192, 6);
    expect(texels.corner(texels.width, texels.height).y).toBeCloseTo(5461.3, 6);
    expect(judge(mask, shapes)).toMatchObject({ black: 0, blended: 0 });
    // Nothing shown: black to the map's edge, and the picture is as large as the map.
    mask.compose({ ...shapes, shown: [] });
    expect(judge(mask, { ...shapes, shown: [] })).toMatchObject({ open: 0, blended: 0 });
    expect(mask.view.getLocalBounds()).toMatchObject({ x: 0, y: 0 });
    expect(mask.view.getLocalBounds().width).toBeCloseTo(8192, 6);
    expect(mask.view.getLocalBounds().height).toBeCloseTo(5461.3, 6);
  });

  it.each([
    { name: 'a texel to the pixel', scale: 1 },
    { name: 'a map of 8,192 px', scale: 8192 / 300 },
  ])('keeps black what has a texel to spare, and may lose a hidden strip thinner than a quarter texel: $name', ({ scale }) => {
    // The limit of the mask, written down and not hidden. A canvas does not fill a path exactly
    // where it lies: measured in Chromium, it moves corners up or down by up to an eighth of a
    // texel, so two shown areas with a flat strip of 0.2 texel between them can come out as one
    // and the strip is erased whole. No texel then holds any black for the hardening to keep.
    // The mask promises only what has a texel to spare around it, which such a strip has not.
    const width = 300 * scale, height = 200 * scale;
    const texel = maskTexel(width, height);
    const strips = (thickness: number): SightMaskShapes => ({
      width, height, darkness: [], pierced: [],
      shown: [rect(0, 0, width, 100.4 * texel), rect(0, (100.4 + thickness) * texel, width, height)],
    });

    const thin = strips(0.2);
    const mask = compose(thin);
    const lost = judge(mask, thin);
    // Nothing is asked of the strip itself: black over it and floor over it both pass.
    expect({ overreach: lost.overreach, blended: lost.blended }).toEqual({ overreach: 0, blended: 0 });
    expect(lost.black).toBeLessThanOrEqual(3 * texelsOf(mask).width);

    // A strip three texels thick has a texel to spare around its middle, and stays black from end to end.
    const thick = strips(3);
    mask.compose(thick);
    const texels = texelsOf(mask);
    const middle = Math.floor(101.9);
    expect(Array.from({ length: texels.width }, (_, column) => texels.alpha(column, middle)).every((alpha) => alpha === 255)).toBe(true);
    expect(judge(mask, thick)).toMatchObject({ leaking: 0, overreach: 0, blended: 0 });
  });
});
