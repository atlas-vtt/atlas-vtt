import { parseHex, paletteOf } from '../../src/app/dungeons/render/palette';
import type { DungeonStyle } from '../../src/app/dungeons/style';

/** The colours a monochrome picture may mix, and how far a colour lies from every mix of them (RGB, 0..255). */

export type Vec3 = [number, number, number];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function segmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  const d = sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
  return Math.sqrt(dot(d, d));
}

/** How far a colour lies from every mix of three colours (the triangle they span). */
function triangleDistance(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d00 = dot(ab, ab);
  const d01 = dot(ab, ac);
  const d11 = dot(ac, ac);
  const det = d00 * d11 - d01 * d01;
  if (det > 1e-6) {
    const v = (d11 * dot(ap, ab) - d01 * dot(ap, ac)) / det;
    const w = (d00 * dot(ap, ac) - d01 * dot(ap, ab)) / det;
    if (v >= 0 && w >= 0 && v + w <= 1) {
      const q = sub(ap, [ab[0] * v + ac[0] * w, ab[1] * v + ac[1] * w, ab[2] * v + ac[2] * w]);
      return Math.sqrt(dot(q, q));
    }
  }
  return Math.min(segmentDistance(p, a, b), segmentDistance(p, b, c), segmentDistance(p, a, c));
}

/** How far a colour lies from every mix of four colours (the tetrahedron they span). */
export function mixDistance(p: Vec3, corners: readonly [Vec3, Vec3, Vec3, Vec3]): number {
  const [a, b, c, d] = corners;
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ad = sub(d, a);
  const ap = sub(p, a);
  const volume = dot(cross(ab, ac), ad);
  // Inside when every barycentric weight is positive; a flat mix (a look whose paper is white or black) has no inside.
  if (Math.abs(volume) > 1) {
    const wb = dot(cross(ap, ac), ad) / volume;
    const wc = dot(cross(ab, ap), ad) / volume;
    const wd = dot(cross(ab, ac), ap) / volume;
    if (wb >= 0 && wc >= 0 && wd >= 0 && wb + wc + wd <= 1) return 0;
  }
  return Math.min(triangleDistance(p, a, b, c), triangleDistance(p, a, b, d), triangleDistance(p, a, c, d), triangleDistance(p, b, c, d));
}

/** A look's monochrome colours: its ink, its other colour (paper, or floor where the paper is ink), and the white and black Stone & shadow's lips and shade go to. */
export function monochromeCorners(style: DungeonStyle): [Vec3, Vec3, Vec3, Vec3] {
  const palette = paletteOf(style, { monochrome: true, shadow: true });
  return [parseHex(palette.ink), parseHex(palette.paper === palette.ink ? palette.floor : palette.paper), [255, 255, 255], [0, 0, 0]];
}
