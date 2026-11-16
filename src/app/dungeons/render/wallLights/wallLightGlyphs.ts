import { polyPath, polysPath } from '../art/paths';
import type { Vec } from '../geometry';
import { circlePath, inkDot, type GlyphPen } from '../glyphPen';
import type { PropGlyph } from '../propShapes';
import { charredFuel, fireGlow } from '../props/fire/burning';
import { openFire } from '../props/fire/flame';
import { colours, fine, isPainted, lips, ring, stick, surface } from '../props/livedIn/parts';
import { rngFrom } from '../../rng';
import { stoneOutline } from '../terrain/stones';
import { brass, candleFlame, floorGlow, torchFlame, torchHead, torchShaft } from './wallLightParts';
import { BRAZIER_RADIUS, FLAME, type WallLightKind } from './wallLightShapes';

/**
 * The wall lights seen from above, each in its drawing's own cells (wall along `y = 0.1`, the room
 * towards −y; a brazier round its centre): iron, brass and wood in the painter's materials, the
 * flame in the fires' own language (`burning.ts`), and in Stone a soft glow on the floor before it.
 * Their flames stand where `FLAME` says, which is where the scene's light stands.
 */

const OUT: Vec = { x: 0, y: -1 };

/** A Fortress torch: an iron plate riveted to the wall, scrolled at its ends, an arm out to a ring, and in the ring a torch leaning out from the wall, burning. */
function bracket(pen: GlyphPen): void {
  const { ctx } = pen;
  const flame = FLAME.bracket;
  floorGlow(pen, flame, 0.48, 1.25);
  const plate = [{ x: -0.1, y: 0.048 }, { x: 0.1, y: 0.048 }, { x: 0.1, y: 0.1 }, { x: -0.1, y: 0.1 }];
  const scrolls = [-0.11, 0.11].map(x => ring(x, 0.074, 10, () => 0.024));
  const arm = stick({ x: 0, y: 0.06 }, { x: 0, y: -0.075 }, 0.034, 0.026);
  surface(pen, polysPath([plate, ...scrolls, arm]), 'metal', !isPainted(pen));
  lips(pen, [plate, ...scrolls]);
  for (const x of [-0.055, 0.055]) inkDot(pen, x, 0.074, 0.011);
  torchShaft(pen, { x: 0, y: 0.035 }, { x: 0, y: -0.13 }, 0.05);
  // The ring the torch stands in, round its shaft, a pair of prongs under it.
  const ink = ctx.strokeStyle;
  const width = ctx.lineWidth;
  ctx.beginPath();
  circlePath(ctx, 0.042, 0, -0.075);
  ctx.moveTo(-0.042, -0.075);
  ctx.lineTo(-0.06, -0.05);
  ctx.moveTo(0.042, -0.075);
  ctx.lineTo(0.06, -0.05);
  ctx.strokeStyle = colours(pen, 'metal').ink;
  ctx.lineWidth = 0.018 / pen.scale;
  ctx.stroke();
  ctx.strokeStyle = ink;
  ctx.lineWidth = width;
  torchHead(pen, { x: flame.x, y: flame.y + 0.012 }, 0.055, OUT);
  torchFlame(pen, flame, 0.05, 0.14, OUT);
}

/** A sconce's back plate: half an oval on the wall, scalloped where it meets the room. */
const SCONCE_PLATE: readonly Vec[] = Array.from({ length: 25 }, (_, k) => {
  const a = (Math.PI * k) / 24;
  const r = 1 + 0.1 * Math.cos(a * 6);
  return { x: Math.cos(a) * 0.13 * r, y: 0.1 - Math.sin(a) * 0.075 * r };
});

/** A Haunted Mansion's sconce: a scalloped brass plate on the wall, two curved arms out to drip pans, a candle burning in each. */
function sconce(pen: GlyphPen): void {
  const { ctx } = pen;
  const metal = brass(pen);
  const flame = FLAME.sconce;
  floorGlow(pen, flame, 0.4, 1.15);
  const pans = [{ x: -0.12, y: flame.y }, { x: 0.12, y: flame.y }];
  // The arms first, the plate and pans over their ends.
  const ink = ctx.strokeStyle;
  const width = ctx.lineWidth;
  ctx.beginPath();
  for (const p of pans) {
    ctx.moveTo(p.x * 0.15, 0.07);
    ctx.bezierCurveTo(p.x * 0.9, 0.08, p.x * 1.25, 0.0, p.x, p.y);
  }
  ctx.strokeStyle = metal.ink;
  ctx.lineWidth = 0.04 / pen.scale;
  ctx.stroke();
  ctx.strokeStyle = metal.fill;
  ctx.lineWidth = 0.024 / pen.scale;
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = ink;
  const plate = SCONCE_PLATE;
  const panRings = pans.map(p => ring(p.x, p.y, 18, () => 0.056));
  const boss = ring(0, 0.05, 12, () => 0.026);
  surface(pen, polysPath([plate, boss, ...panRings]), 'metal', false, true, metal.fill, metal.ink);
  lips(pen, [plate, boss, ...panRings]);
  // Each candle's top: a disc of wax, the wick in it and its flame.
  const wax = isPainted(pen) && !pen.hand.scene.env.view.monochrome ? '#eee4c8' : colours(pen, 'floor').fill;
  surface(pen, path => { for (const p of pans) circlePath(path, 0.035, p.x, p.y); }, 'cloth', false, true, wax, colours(pen, 'cloth').ink);
  for (const p of pans) inkDot(pen, p.x, p.y, 0.008);
  pans.forEach((p, k) => candleFlame(pen, { x: p.x, y: p.y - 0.006 }, 0.019, OUT, k ? 0.4 : -0.3));
}

const caveRandom = rngFrom(0x70c4);
/** The shards of rock driven into the crack beside the torch to hold it. */
const WEDGES: readonly Vec[][] = [{ x: -0.065, y: 0.068 }, { x: 0.065, y: 0.072 }, { x: 0.0, y: 0.09 }].map(c => stoneOutline(caveRandom, c, 0.055));

/** A torch wedged into a crack in a cave's rock with a few shards, leaning out and a little aside, burning. */
function caveTorch(pen: GlyphPen): void {
  const flame = FLAME['cave-torch'];
  floorGlow(pen, flame, 0.48, 1.25);
  const base = { x: -0.01, y: 0.075 };
  const along = { x: flame.x - base.x, y: flame.y - base.y };
  const len = Math.hypot(along.x, along.y);
  const out = { x: along.x / len, y: along.y / len };
  // The crack the torch is driven into, a dark split in the rock's face.
  fine(pen, path => {
    path.moveTo(-0.13, 0.1);
    path.lineTo(-0.03, 0.07);
    path.lineTo(0.04, 0.085);
    path.lineTo(0.12, 0.1);
  }, 'rock');
  torchShaft(pen, base, { x: flame.x - out.x * 0.03, y: flame.y - out.y * 0.03 }, 0.05);
  surface(pen, polysPath(WEDGES), 'rock', !isPainted(pen));
  lips(pen, WEDGES);
  torchHead(pen, { x: flame.x - out.x * 0.012, y: flame.y - out.y * 0.012 }, 0.055, out);
  torchFlame(pen, flame, 0.05, 0.14, out);
}

const BOWL = ring(0, 0, 28, () => BRAZIER_RADIUS);
const BOWL_INSIDE = ring(0, 0, 28, () => BRAZIER_RADIUS * 0.78);
const FEET = [Math.PI / 2, (Math.PI * 7) / 6, (Math.PI * 11) / 6].map(a => ring(Math.cos(a) * (BRAZIER_RADIUS + 0.03), Math.sin(a) * (BRAZIER_RADIUS + 0.03), 8, () => 0.04));
const coalRandom = rngFrom(0xb7a2);
/** Coals heaped in the bowl, and the embers in their cracks. */
const COALS: readonly Vec[][] = Array.from({ length: 10 }, (_, k) => {
  const a = k * 2.4 + coalRandom() * 0.5;
  const d = k === 0 ? 0 : 0.07 + coalRandom() * 0.07;
  return stoneOutline(coalRandom, { x: Math.cos(a) * d, y: Math.sin(a) * d }, 0.046);
});
const COAL_CRACKS = COALS.flatMap(c => [c[0]!.x * 0.4 + c[3]!.x * 0.6, c[0]!.y * 0.4 + c[3]!.y * 0.6, c[1]!.x * 0.5 + c[5]!.x * 0.5, c[1]!.y * 0.5 + c[5]!.y * 0.5]);
const SPARKS: readonly (readonly [number, number, number])[] = [[0.15, -0.05, 0.012], [-0.13, 0.1, 0.011], [0.04, 0.16, 0.01]];

/** A brazier on a cave's floor: an iron bowl on three feet, heaped with coals glowing in its middle, flames standing over them. */
function brazierGlyph(pen: GlyphPen): void {
  floorGlow(pen, { x: 0, y: 0 }, 0.6, 1.25, path => path.rect(-0.9, -0.9, 1.8, 1.8));
  surface(pen, polysPath(FEET), 'metal', false);
  surface(pen, polyPath(BOWL), 'metal', !isPainted(pen));
  lips(pen, [BOWL]);
  // Its hollow: dark iron in Stone, paper in Engraved, where the coals are cut in ink.
  surface(pen, polyPath(BOWL_INSIDE), 'metal', false, true, isPainted(pen) ? colours(pen, 'metal').ink : colours(pen, 'floor').fill);
  fireGlow(pen, polyPath(BOWL_INSIDE), { x: 0, y: 0 }, BRAZIER_RADIUS * 0.8, BRAZIER_RADIUS * 0.8, 0.9);
  charredFuel(pen, polysPath(COALS), COAL_CRACKS, SPARKS);
  openFire(pen, { x: 0, y: 0 }, 0.2);
}

const flat = { material: 'metal', radius: 0.15, lift: 0 } as const;
const both = (draw: (pen: GlyphPen) => void): Pick<PropGlyph, 'stone' | 'engraved'> => ({ stone: draw, engraved: draw });

/** Each wall light's drawing, in both painters: their parts branch on the painter where they must. */
export const WALL_LIGHT_GLYPHS: Readonly<Record<WallLightKind, PropGlyph>> = {
  bracket: { ...flat, ...both(bracket) },
  sconce: { ...flat, ...both(sconce) },
  'cave-torch': { ...flat, ...both(caveTorch) },
  brazier: { ...flat, radius: BRAZIER_RADIUS, ...both(brazierGlyph) },
};
