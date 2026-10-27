import { glyphTone } from '../../art/glyphLight';
import { polyPath, polysPath, type PathFn } from '../../art/paths';
import { valueNoise } from '../../art/noise';
import type { Vec } from '../../geometry';
import { circlePath, type GlyphPen } from '../../glyphPen';
import { mixColours } from '../../palette';
import { stoneOutline } from '../../terrain/stones';
import { rngFrom } from '../../../rng';
import { fireGlow } from '../fire/burning';
import { openFire } from '../fire/flame';
import { colours, darkFloorLine, fine, isPainted, lips, onDarkFloor, ring, stick, surface } from './parts';

/**
 * A campfire: a ring of fieldstones round a bed of ash, the charred ends of the last sticks pushed
 * in towards its middle, cold, or with flames burning in that middle where someone lives (`lit`).
 */

/** Where flames burn: the clear middle of the ash bed, in the piece's own cells. */
export const FIRE_AREA = { x: 0, y: 0, r: 0.11 } as const;

const random = rngFrom(0x6a11);
/**
 * Eight fieldstones laid round the ash, each longer along the ring than across it: a split stone's
 * few flat faces (`stoneOutline`), its sharpest corners worn round, as stones carried from a stream are.
 */
export const RING_STONES: readonly Vec[][] = Array.from({ length: 8 }, (_, k) => {
  const a = (k / 8) * Math.PI * 2 + 0.3 + (random() - 0.5) * 0.2;
  const d = 0.315 + (random() - 0.5) * 0.02;
  const c = { x: Math.cos(a) * d, y: Math.sin(a) * d };
  const raw = stoneOutline(random, { x: 0, y: 0 }, 0.1);
  const r = Math.max(...raw.map(p => Math.hypot(p.x, p.y)));
  // Rounded towards a pebble, stretched along the ring and turned to lie along it.
  const along = 0.115 + random() * 0.015;
  const across = 0.08 + random() * 0.01;
  return raw.map(p => {
    const t = Math.atan2(p.y, p.x);
    const m = 0.55 + 0.45 * Math.hypot(p.x, p.y) / r;
    const x = Math.cos(t) * across * m;
    const y = Math.sin(t) * along * m;
    return { x: c.x + x * Math.cos(a) - y * Math.sin(a), y: c.y + x * Math.sin(a) + y * Math.cos(a) };
  });
});

const ASH: readonly Vec[] = ring(0, 0, 28, a => 0.27 + (valueNoise(Math.cos(a) * 2 + 3, Math.sin(a) * 2 + 3, 41) - 0.5) * 0.05);
const ashPath = polyPath(ASH);

/** The sticks: from where each lay on the ash to its burnt end, short of the fire's clear middle. */
const STICKS: readonly { from: Vec; to: Vec; w: number }[] = [
  [0.0, 0.39, 0.075], [1.35, 0.36, 0.065], [2.6, 0.4, 0.08], [3.85, 0.35, 0.06], [5.1, 0.38, 0.07],
].map(([a, len, w]) => {
  const from = { x: Math.cos(a!) * len!, y: Math.sin(a!) * len! };
  const inner = FIRE_AREA.r + 0.015;
  // Each stick points a little past the middle, as burnt sticks fall, never straight at it.
  const b = a! + Math.PI + 0.28;
  return { from, to: { x: Math.cos(a!) * inner + Math.cos(b) * 0.02, y: Math.sin(a!) * inner + Math.sin(b) * 0.02 }, w: w! };
});
const STICK_POLYS = STICKS.map(s => stick(s.from, s.to, s.w, s.w * 0.7, 0.006));
/** The burnt inner half of every stick. */
const CHAR_POLYS = STICKS.map(s => {
  const mid = { x: s.from.x + (s.to.x - s.from.x) * 0.55, y: s.from.y + (s.to.y - s.from.y) * 0.55 };
  return stick(mid, s.to, s.w * 0.86 + 0.004, s.w * 0.7 + 0.004, 0.004);
});

/** Charcoal crumbs on the ash, and the grain along each stick's unburnt half. */
const CRUMBS: readonly [number, number, number][] = [
  [0.05, -0.16, 0.013], [-0.17, 0.05, 0.011], [0.16, 0.12, 0.012], [-0.06, 0.19, 0.009], [0.2, -0.05, 0.008], [-0.13, -0.14, 0.01],
];
const crumbsPath: PathFn = path => { for (const [x, y, r] of CRUMBS) circlePath(path, r, x, y); };
const grainPath: PathFn = path => {
  for (const s of STICKS) {
    const at = (t: number, side: number): Vec => {
      const dx = s.to.x - s.from.x;
      const dy = s.to.y - s.from.y;
      const len = Math.hypot(dx, dy);
      return { x: s.from.x + dx * t - (dy / len) * side, y: s.from.y + dy * t + (dx / len) * side };
    };
    const a = at(0.08, s.w * 0.12);
    const b = at(0.44, -s.w * 0.08);
    path.moveTo(a.x, a.y);
    path.lineTo(b.x, b.y);
  }
};
/** Fine cracks across the ash: where it has settled and split. */
const ashCracks: PathFn = path => {
  for (const [a, r0, r1] of [[0.9, 0.15, 0.24], [2.55, 0.13, 0.23], [3.7, 0.16, 0.25], [5.9, 0.14, 0.22]] as const) {
    path.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    path.quadraticCurveTo(Math.cos(a + 0.25) * (r0 + r1) / 2, Math.sin(a + 0.25) * (r0 + r1) / 2, Math.cos(a + 0.1) * r1, Math.sin(a + 0.1) * r1);
  }
};

export const campfireSilhouette: PathFn = polysPath(RING_STONES);

const FIRE_MIDDLE = { x: FIRE_AREA.x, y: FIRE_AREA.y };

export function campfire(pen: GlyphPen, lit = false): void {
  const painted = isPainted(pen);
  const { ctx } = pen;
  // The ash: pale where it is thin by the stones, sooted towards the middle the fire burnt in.
  surface(pen, ashPath, 'stone', false, false, painted ? undefined : colours(pen, 'floor').fill);
  if (painted && pen.hand.scene.raster) {
    const soot = ctx.createRadialGradient(0, 0, 0.02, 0, 0, 0.27);
    soot.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
    soot.addColorStop(0.45, 'rgba(0, 0, 0, 0.4)');
    soot.addColorStop(1, 'rgba(0, 0, 0, 0.05)');
    ctx.beginPath();
    ashPath(ctx);
    ctx.fillStyle = soot;
    ctx.fill();
  } else if (!painted) {
    glyphTone(pen, (x, y) => Math.max(0, 0.75 - Math.hypot(x, y) / 0.3), { minX: -0.28, minY: -0.28, maxX: 0.28, maxY: 0.28 }, ashPath, 'depth');
  }
  // The sticks: unburnt wood outside, charcoal where the fire reached them, crumbs fallen from them.
  surface(pen, polysPath(STICK_POLYS), 'wood', !painted);
  // Charcoal: the wood's own ink taken almost to black.
  surface(pen, path => { polysPath(CHAR_POLYS)(path); crumbsPath(path); }, 'wood', false, false, mixColours(colours(pen, 'wood').ink, '#000000', 0.55));
  // The ash's cracks lie between the sticks, so they share the sticks' grain pass.
  fine(pen, path => { ashCracks(path); grainPath(path); }, 'wood');
  if (lit) {
    // The bed glows from the flames out to the sticks' burning ends, and the flames stand over them.
    fireGlow(pen, ashPath, FIRE_MIDDLE, 0.24, 0.24);
    openFire(pen, FIRE_MIDDLE, 0.2);
  }
  // The ring of stones over the ash's edge, each lit on the side towards the light; on a dark floor outlined in the look's light line.
  surface(pen, campfireSilhouette, 'rock', false, true, undefined, painted && onDarkFloor(pen) ? darkFloorLine(pen) : undefined);
  lips(pen, RING_STONES);
}
