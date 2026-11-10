import type { CellDir, DungeonFloor, DungeonTerrain } from '../../model';
import type { Hand } from '../art/hand';
import { smallFloorHand } from '../stone/smallFloorFields';
import { valueNoise } from '../art/noise';
import { polyPath, polysPath } from '../art/paths';
import { pointsBounds, type Vec } from '../geometry';
import { cellRings } from './cellRings';
import { raggedRing, type RaggedShape } from './scatterPatch';
import { pieceRng } from './pieces';
import { stoneOutline } from './stones';

/** The dark a choke's blocks lie in: its cells' outline rounded and held a little inside them, never a cell line. */
const CHOKE: RaggedShape = { sigma: 1.8, waves: 1.1, swell: 0.12, rag: 0.05, outwards: -0.06 };

/**
 * Fallen blocks fill a walked choke, jammed at odd angles and sizes rather than set in a grid;
 * their crevices have depth, never a cast shadow, in a patch that follows no cell line.
 */
export function drawBoulderChoke(hand: Hand, piece: DungeonTerrain): void {
  hand = smallFloorHand(hand);
  const rng = pieceRng(hand.scene.env, piece);
  const rings = cellRings(piece.cells).map(ring => raggedRing(ring, piece.id * 29 + 3, CHOKE));
  hand.tone(() => 0.24, pointsBounds(rings.flat()), polysPath(rings), 'depth');
  const stones: Block[] = [];
  for (const cell of piece.cells) {
    for (const [dx, dy] of [[0.32, 0.32], [0.68, 0.32], [0.32, 0.68], [0.68, 0.68]]) {
      const centre = { x: cell.x + dx! + (rng() - 0.5) * 0.16, y: cell.y + dy! + (rng() - 0.5) * 0.16 };
      const radius = 0.15 + rng() * 0.08;
      stones.push({ poly: stoneOutline(rng, centre, radius), centre, radius });
    }
  }
  drawBlocks(hand, stones);
}

/** A fallen block: its outline, middle and radius, in cells. */
export interface Block {
  poly: Vec[];
  centre: Vec;
  radius: number;
}

/**
 * Fallen blocks, back to front: each modelled as a solid with a single fracture, or the hand's own
 * pile where it models each stone whole. A choke's cells and a breakdown's narrows draw them alike.
 */
export function drawBlocks(hand: Hand, blocks: Block[]): void {
  const stones = [...blocks].sort((a, b) => a.centre.y - b.centre.y);
  if (hand.pile) {
    // Each block's own facets carry its fractures.
    hand.pile(stones.map(({ poly, centre, radius }) => ({ poly, c: centre, r: radius })), () => 'outline');
    return;
  }
  hand.surface(polysPath(stones.map(stone => stone.poly)), 'rock');
  for (const { poly, centre, radius } of stones) {
    const path = polyPath(poly);
    hand.solid(path, centre, radius, 0.9);
    // A single fracture, with its branch fading before the far edge.
    const a = poly[0]!;
    hand.line([[a, centre, { x: centre.x + radius * 0.3, y: centre.y - radius * 0.45 }]], 'fine');
  }
  hand.line(stones.map(stone => stone.poly), 'outline', true);
}

/** How far the water a rimstone steps down to lies at most from its middle, in cells. */
const NEAR_WATER = 4;
/** The fewest and most dams a rimstone draws, how far each bows towards the water, and how far apart along a dam its points lie, in cells. */
const DAMS = { least: 2, most: 4, bow: 0.28, step: 0.06 };
/** How much of a dam's ink is left out in its breaks. */
const BREAKS = 0.2;

/** The middle of a piece's cells. */
function middleOf(piece: DungeonTerrain): Vec {
  return piece.cells.reduce((a, c) => ({ x: a.x + (c.x + 0.5) / piece.cells.length, y: a.y + (c.y + 0.5) / piece.cells.length }), { x: 0, y: 0 });
}

/**
 * The way down a rimstone's terraces, towards the nearest water beside it (the pools behind its dams
 * are that water's, so its own cells never count), else its given descent, else down the map.
 */
function downhill(floor: DungeonFloor, piece: DungeonTerrain): CellDir {
  const own = new Set(piece.cells.map(c => `${c.x},${c.y}`));
  const water = [...floor.waterCells, ...floor.terrain.filter(p => p.kind === 'pool' || p.kind === 'shallow-water' || p.traits.hazard === 'deep-water').flatMap(p => p.cells)].filter(c => !own.has(`${c.x},${c.y}`));
  const centre = middleOf(piece);
  const near = water.reduce<Vec | undefined>((best, c) => !best || Math.hypot(c.x + 0.5 - centre.x, c.y + 0.5 - centre.y) < Math.hypot(best.x + 0.5 - centre.x, best.y + 0.5 - centre.y) ? c : best, undefined);
  if (!near || Math.hypot(near.x + 0.5 - centre.x, near.y + 0.5 - centre.y) > NEAR_WATER) return piece.facing ?? { x: 0, y: 1 };
  const x = near.x + 0.5 - centre.x;
  const y = near.y + 0.5 - centre.y;
  return Math.abs(x) > Math.abs(y) ? { x: x > 0 ? 1 : -1, y: 0 } : { x: 0, y: y >= 0 ? 1 : -1 };
}

/**
 * A rimstone's dams as drawn: two to four crescents across its cells, one behind the other stepping
 * away from the water it borders, each bowed towards that water as calcite dams bulge where they
 * spill, wavering a little, broken where the dam is worn, and only over its own cells.
 */
export function rimstoneDams(floor: DungeonFloor, piece: DungeonTerrain): Vec[][] {
  const down = downhill(floor, piece);
  const across = { x: down.y, y: -down.x };
  const at = (u: number, v: number): Vec => ({ x: u * across.x + v * down.x, y: u * across.y + v * down.y });
  const own = new Set(piece.cells.map(c => `${c.x},${c.y}`));
  const us = piece.cells.map(c => (c.x + 0.5) * across.x + (c.y + 0.5) * across.y);
  const vs = piece.cells.map(c => (c.x + 0.5) * down.x + (c.y + 0.5) * down.y);
  const [u0, u1] = [Math.min(...us) - 0.45, Math.max(...us) + 0.45];
  const [v0, v1] = [Math.min(...vs) - 0.4, Math.max(...vs) + 0.4];
  const count = Math.max(DAMS.least, Math.min(DAMS.most, Math.round(v1 - v0 + 1)));
  const seed = piece.id * 31 + 7;
  const dams: Vec[][] = [];
  for (let k = 0; k < count; k++) {
    // From the water back: the dam nearest the water lies at the downhill end.
    const v = v1 - ((k + 0.5) * (v1 - v0)) / count - DAMS.bow / 2;
    let run: Vec[] = [];
    for (let u = u0; u <= u1; u += DAMS.step) {
      const s = ((u - u0) / (u1 - u0)) * 2 - 1;
      const wave = (valueNoise(u * 2.3, v * 3.1, seed) - 0.5) * 0.08;
      const p = at(u, v + DAMS.bow * (1 - s * s) + wave);
      const kept = own.has(`${Math.floor(p.x)},${Math.floor(p.y)}`) && valueNoise(u * 3.7, v * 5.3 + k, seed + 1) > BREAKS;
      if (kept) run.push(p);
      else if (run.length) {
        if (run.length > 2) dams.push(run);
        run = [];
      }
    }
    if (run.length > 2) dams.push(run);
  }
  return dams;
}

/**
 * Rimstone: terraced calcite dams holding shallow pools, drawn as their dams alone, in the walls'
 * ink, over whatever lies there: the floor's water where the pools behind them are flooded (one
 * body with the water they step away from), the bare floor where they stand dry.
 */
export function drawRimstone(hand: Hand, piece: DungeonTerrain): void {
  hand.line(rimstoneDams(hand.scene.env.dungeon.floor, piece), 'heavy');
}
