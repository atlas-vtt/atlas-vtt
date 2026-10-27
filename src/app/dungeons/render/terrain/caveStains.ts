import type { DungeonTerrain } from '../../model';
import type { Hand } from '../art/hand';
import { smallFloorHand } from '../stone/smallFloorFields';
import { valueNoise } from '../art/noise';
import { polysPath, type Field } from '../art/paths';
import { pointsBounds, type Vec } from '../geometry';
import { cellRings, insetRing } from './cellRings';
import { cellSet, pieceRng } from './pieces';
import { chiselled } from './stones';

/** A floor coating stays off walls, with no ink along the internal cell seams. */
export function coverRings(piece: DungeonTerrain): Vec[][] {
  return cellRings(piece.cells).map(ring => chiselled(insetRing(ring, 0.1), piece.id + 31, 0.035));
}

/** Soft falloff at exposed cell sides, continuous across the cells inside the patch. */
function stainField(piece: DungeonTerrain): Field {
  const cells = cellSet(piece.cells);
  const exposed = new Map<number, Map<number, boolean[]>>();
  for (const { x, y } of piece.cells) {
    const row = exposed.get(y) ?? new Map<number, boolean[]>();
    row.set(x, [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => !cells.has(`${x + dx!},${y + dy!}`)));
    exposed.set(y, row);
  }
  return (x, y) => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const sides = exposed.get(cy)?.get(cx);
    if (!sides) return 0;
    const edge = Math.min(
      sides[0] ? x - cx : 1,
      sides[1] ? cx + 1 - x : 1,
      sides[2] ? y - cy : 1,
      sides[3] ? cy + 1 - y : 1,
    );
    const noise = valueNoise(x * 2.8, y * 2.8, piece.id + 73);
    return Math.min(1, Math.max(0, (edge - 0.13 - noise * 0.12) / 0.27)) * Math.max(0, noise - 0.16) * 0.85;
  };
}

/** Guano is a stain, never a raised heap: soft tone with uneven fine peppering. */
export function drawGuano(hand: Hand, piece: DungeonTerrain): void {
  hand = smallFloorHand(hand);
  const rings = coverRings(piece);
  const field = stainField(piece);
  hand.tone(field, pointsBounds(rings.flat()), polysPath(rings), 'shade');
  const rng = pieceRng(hand.scene.env, piece);
  const specks: Vec[][] = [];
  for (const cell of piece.cells) for (let i = 0; i < 65; i++) {
    const x = cell.x + 0.12 + rng() * 0.76;
    const y = cell.y + 0.12 + rng() * 0.76;
    if (rng() > field(x, y) * 2.2) continue;
    const length = 0.008 + rng() * 0.014;
    specks.push([{ x, y }, { x: x + length, y: y + length * 0.4 }]);
  }
  // These paths keep the stain legible in SVG, where Stone's soft tone is absent.
  hand.line(specks, 'fine');
}

/** Broken shafts and slivers lying loose: no skulls, joints, ribcages or complete bones. */
export function drawBoneLitter(hand: Hand, piece: DungeonTerrain): void {
  const rng = pieceRng(hand.scene.env, piece);
  const fragments: Vec[][] = [];
  const splits: Vec[][] = [];
  for (const cell of piece.cells) for (let i = 0; i < 7; i++) {
    const x = cell.x + 0.22 + rng() * 0.56;
    const y = cell.y + 0.22 + rng() * 0.56;
    const angle = rng() * Math.PI * 2;
    const length = 0.055 + rng() * 0.075;
    const width = 0.012 + rng() * 0.009;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const at = (u: number, v: number): Vec => ({ x: x + u * cos - v * sin, y: y + u * sin + v * cos });
    fragments.push([
      at(-length, -width), at(-length * 0.4, -width * 0.7), at(length * 0.82, -width * 1.3),
      at(length * 0.66, 0), at(length, width), at(-length * 0.4, width * 0.6), at(-length * 0.8, width),
    ]);
    if (i % 3 === 0) splits.push([at(-length * 0.6, 0), at(length * 0.45, 0)]);
  }
  hand.surface(polysPath(fragments), 'stone');
  hand.line(fragments, 'outline', true);
  hand.line(splits, 'fine');
}

/** A pale mineral skin: scalloped edges and small, three-way craze fractures, not rubble. */
export function drawSulphurCrust(hand: Hand, piece: DungeonTerrain): void {
  const rings = cellRings(piece.cells).map(ring => {
    const inset = insetRing(ring, 0.12);
    return inset.flatMap((a, i) => {
      const b = inset[(i + 1) % inset.length]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(length / 0.035));
      return Array.from({ length: steps }, (_, k) => {
        const t = k / steps;
        const bulge = Math.sin(Math.PI * t) * (0.02 + 0.025 * Math.cos(t * length * 32));
        return { x: a.x + (b.x - a.x) * t - (b.y - a.y) / length * bulge, y: a.y + (b.y - a.y) * t + (b.x - a.x) / length * bulge };
      });
    });
  });
  hand.surface(polysPath(rings), 'stone');
  hand.line(rings, 'fine', true);
  const rng = pieceRng(hand.scene.env, piece);
  const cracks: Vec[][] = [];
  for (const cell of piece.cells) for (let i = 0; i < 9; i++) {
    const x = cell.x + 0.25 + (i % 3) * 0.25 + (rng() - 0.5) * 0.08;
    const y = cell.y + 0.25 + Math.floor(i / 3) * 0.25 + (rng() - 0.5) * 0.08;
    const angle = rng() * Math.PI * 2;
    for (let branch = 0; branch < 3; branch++) {
      const a = angle + branch * Math.PI * 2 / 3;
      const r = 0.065 + rng() * 0.045;
      cracks.push([{ x, y }, { x: x + Math.cos(a + 0.18) * r * 0.55, y: y + Math.sin(a + 0.18) * r * 0.55 }, { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r }]);
    }
  }
  hand.line(cracks, 'fine');
}
