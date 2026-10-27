import type { DungeonTerrain } from '../../model';
import type { Vec } from '../geometry';
import { castShadow, type Hand } from '../art/hand';
import { valueNoise } from '../art/noise';
import { grown, polyPath, polysPath, rectPoly, type PathFn } from '../art/paths';
import { cellBox, cellRings } from './cellRings';
import { clearOfCaveWall, pieceRng } from './pieces';
import { chiselled, stoneOutline } from './stones';
import { pointsBounds } from '../geometry';

/**
 * Ground that slows a party (loose rubble, broken floor, the rubble under a hole above) and
 * mosaics: whole cells, so a cell reads plainly as one thing (Map-Fu), drawn before the shadows.
 */

/** Loose stones over whole cells (difficult ground): a faint tone over the zone and many small stones, none big enough to hide behind. */
export function drawScatter(hand: Hand, piece: DungeonTerrain, size: number, perCell: number): void {
  const rng = pieceRng(hand.scene.env, piece);
  const rings = cellRings(piece.cells).map(r => chiselled(r, piece.id * 7 + 3, 0.06));
  const bounds = pointsBounds(rings.flat());
  hand.tone((x, y) => 0.06 + 0.08 * valueNoise(x * 3, y * 3, piece.id), grown(bounds, 0.1), polysPath(rings), 'shade');
  const stones: { poly: Vec[]; c: Vec; r: number }[] = [];
  for (const c of piece.cells) {
    for (let k = 0; k < perCell; k++) {
      const at = { x: c.x + 0.06 + rng() * 0.88, y: c.y + 0.06 + rng() * 0.88 };
      const r = size * (0.45 + rng() ** 2 * 1.4);
      const st = { poly: stoneOutline(rng, at, r), c: at, r };
      if (clearOfCaveWall(hand.scene.env, at, r)) stones.push(st);
    }
  }
  const all: PathFn = path => stones.forEach(st => polyPath(st.poly)(path));
  castShadow(hand, all, 0.05, bounds, 0.55);
  if (hand.pile) {
    hand.pile(stones, () => 'fine');
    return;
  }
  hand.surface(all, 'rock');
  for (const st of stones) if (st.r > size * 0.9) hand.solid(polyPath(st.poly), st.c, st.r, 1.2);
  hand.line(stones.map(st => st.poly), 'fine', true);
}

/** Broken floor: each cell split into slabs tilted this way and that, the gaps between them dark. */
export function drawBrokenFloor(hand: Hand, piece: DungeonTerrain): void {
  const rng = pieceRng(hand.scene.env, piece);
  const box = cellBox(piece.cells);
  const all = rectPoly(box);
  hand.tone(() => 0.5, grown(pointsBounds(all), 0.05), polysPath(cellRings(piece.cells)), 'shade');
  for (const c of piece.cells) {
    const m = { x: c.x + 0.3 + rng() * 0.4, y: c.y + 0.3 + rng() * 0.4 };
    const edge = [
      { x: c.x + 0.25 + rng() * 0.5, y: c.y },
      { x: c.x + 1, y: c.y + 0.25 + rng() * 0.5 },
      { x: c.x + 0.25 + rng() * 0.5, y: c.y + 1 },
      { x: c.x, y: c.y + 0.25 + rng() * 0.5 },
    ];
    const corners = [{ x: c.x + 1, y: c.y }, { x: c.x + 1, y: c.y + 1 }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y }];
    for (let k = 0; k < 4; k++) {
      const slab = shrink([m, edge[k]!, corners[k]!, edge[(k + 1) % 4]!], 0.035);
      hand.surface(polyPath(slab), 'floor');
      // A slab tilts towards one side: the light finds it, or it falls into shade.
      const tilt = rng();
      if (tilt < 0.4) hand.tone(() => 0.35 * (1 - tilt), grown(pointsBounds(slab), 0.02), polyPath(slab), 'shade');
      hand.edges(slab, tilt > 0.5);
    }
  }
}

/** The polygon pulled towards its middle by `d`. */
function shrink(poly: readonly Vec[], d: number): Vec[] {
  const c = poly.reduce((a, p) => ({ x: a.x + p.x / poly.length, y: a.y + p.y / poly.length }), { x: 0, y: 0 });
  return poly.map(p => {
    const len = Math.hypot(p.x - c.x, p.y - c.y) || 1;
    return { x: p.x - ((p.x - c.x) / len) * d, y: p.y - ((p.y - c.y) / len) * d };
  });
}

/** A mosaic: a bordered field of the floor laid with lozenges round a rosette. */
export function drawMosaic(hand: Hand, piece: DungeonTerrain): void {
  const box = cellBox(piece.cells);
  const inset = 0.12;
  const outer = rectPoly({ x: box.x + inset, y: box.y + inset, w: box.w - inset * 2, h: box.h - inset * 2 });
  const inner = rectPoly({ x: box.x + inset + 0.08, y: box.y + inset + 0.08, w: box.w - inset * 2 - 0.16, h: box.h - inset * 2 - 0.16 });
  hand.surface(polyPath(outer), 'dressed');
  hand.surface(polyPath(inner), 'floor');
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const reach = Math.min(box.w, box.h) / 2 - inset - 0.08;
  const lozenge = (r: number, a: number, len: number, wide: number): Vec[] => {
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const t = { x: Math.cos(a), y: Math.sin(a) };
    const n = { x: -t.y, y: t.x };
    return [{ x: x - t.x * len, y: y - t.y * len }, { x: x + n.x * wide, y: y + n.y * wide }, { x: x + t.x * len, y: y + t.y * len }, { x: x - n.x * wide, y: y - n.y * wide }];
  };
  const petals: Vec[][] = [];
  const outerRing: Vec[][] = [];
  for (let k = 0; k < 8; k++) petals.push(lozenge(reach * 0.42, (k / 8) * Math.PI * 2, reach * 0.22, reach * 0.08));
  for (let k = 0; k < 16; k++) outerRing.push(lozenge(reach * 0.82, ((k + 0.5) / 16) * Math.PI * 2, reach * 0.12, reach * 0.05));
  hand.surface(polysPath(petals), 'cloth');
  hand.surface(polysPath(outerRing), 'metal');
  const hub = Array.from({ length: 16 }, (_, k) => ({ x: cx + Math.cos((k / 16) * Math.PI * 2) * reach * 0.14, y: cy + Math.sin((k / 16) * Math.PI * 2) * reach * 0.14 }));
  hand.surface(polyPath(hub), 'metal');
  hand.line([...petals, ...outerRing, hub, inner], 'fine', true);
  hand.edges(outer, false);
}
