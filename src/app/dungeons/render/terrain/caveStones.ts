import type { CellDir, DungeonFloor, DungeonTerrain } from '../../model';
import type { Hand } from '../art/hand';
import { isSubmergedRimstone } from '../art/pools';
import { smallFloorHand, smallShallowPools } from '../stone/smallFloorFields';
import { valueNoise } from '../art/noise';
import { polyPath, polysPath } from '../art/paths';
import { pointsBounds, type Vec } from '../geometry';
import { coverRings } from './caveStains';
import { pieceRng } from './pieces';
import { stoneOutline } from './stones';

/** Fallen blocks fill a walked choke; their small crevices have depth, never a cast shadow. */
export function drawBoulderChoke(hand: Hand, piece: DungeonTerrain): void {
  hand = smallFloorHand(hand);
  const rng = pieceRng(hand.scene.env, piece);
  const rings = coverRings(piece);
  hand.tone(() => 0.24, pointsBounds(rings.flat()), polysPath(rings), 'depth');
  const stones: { poly: Vec[]; centre: Vec; radius: number }[] = [];
  for (const cell of piece.cells) {
    for (const [dx, dy] of [[0.32, 0.32], [0.68, 0.32], [0.32, 0.68], [0.68, 0.68]]) {
      const centre = { x: cell.x + dx! + (rng() - 0.5) * 0.04, y: cell.y + dy! + (rng() - 0.5) * 0.04 };
      const radius = 0.20 + rng() * 0.015;
      stones.push({ poly: stoneOutline(rng, centre, radius), centre, radius });
    }
  }
  stones.sort((a, b) => a.centre.y - b.centre.y);
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

/** Face the nearest water, or the piece's given descent; everything stays in map coordinates. */
function downhill(floor: DungeonFloor, piece: DungeonTerrain): CellDir {
  if (piece.facing) return piece.facing;
  const water = [...floor.waterCells, ...floor.terrain.filter(p => p.kind === 'pool' || p.kind === 'shallow-water' || p.traits.hazard === 'deep-water').flatMap(p => p.cells)];
  const centre = piece.cells.reduce((a, c) => ({ x: a.x + (c.x + 0.5) / piece.cells.length, y: a.y + (c.y + 0.5) / piece.cells.length }), { x: 0, y: 0 });
  const near = water.reduce<Vec | undefined>((best, c) => !best || Math.hypot(c.x + 0.5 - centre.x, c.y + 0.5 - centre.y) < Math.hypot(best.x + 0.5 - centre.x, best.y + 0.5 - centre.y) ? c : best, undefined);
  if (!near) return { x: 0, y: 1 };
  const x = near.x + 0.5 - centre.x;
  const y = near.y + 0.5 - centre.y;
  return Math.abs(x) > Math.abs(y) ? { x: x > 0 ? 1 : -1, y: 0 } : { x: 0, y: y >= 0 ? 1 : -1 };
}

/** A rimstone's dams as drawn: each dam's outline (`rims`), the gour inside it (`pools`) and its lip (`lips`). */
export function rimstoneShelves(floor: DungeonFloor, piece: DungeonTerrain): { rims: Vec[][]; pools: Vec[][]; lips: Vec[][] } {
  const down = downhill(floor, piece);
  const across = { x: down.y, y: -down.x };
  const local = (p: Vec): Vec => ({ x: p.x * across.x + p.y * across.y, y: p.x * down.x + p.y * down.y });
  const world = (u: number, v: number): Vec => ({ x: u * across.x + v * down.x, y: u * across.y + v * down.y });
  const rows = new Map<number, number[]>();
  for (const c of piece.cells) {
    const at = local({ x: c.x + 0.5, y: c.y + 0.5 });
    const v = Math.floor(at.y);
    let columns = rows.get(v);
    if (!columns) rows.set(v, columns = []);
    columns.push(Math.floor(at.x));
  }
  const rims: Vec[][] = [];
  const pools: Vec[][] = [];
  const lips: Vec[][] = [];
  for (const [v, columns] of rows) {
    columns.sort((a, b) => a - b);
    for (let start = 0; start < columns.length;) {
      let end = start;
      while (columns[end + 1] === columns[end]! + 1) end++;
      const left = columns[start]! + 0.12;
      const right = columns[end]! + 0.88;
      const top = v + 0.1;
      const n = Math.ceil((right - left) / 0.08);
      const shelf = (inset: number): Vec[] => {
        const edge = (lower: boolean): Vec[] => Array.from({ length: n + 1 }, (_, k) => {
          const t = k / n;
          const u = left + inset + (right - left - inset * 2) * t;
          const noise = valueNoise(u * 2.1, v * 3, piece.id + 17);
          const scallop = 0.018 * Math.sin(u * 19 + noise * 7);
          // Taper the ends; broad lobes vary each dam, with open water behind its lip.
          const belly = Math.sin(Math.PI * t) ** 0.5;
          const depth = 0.10 + belly * (0.48 + noise * 0.12);
          return world(u, top + noise * 0.04 + scallop + (lower ? depth - inset : inset));
        });
        if (inset === 0) lips.push(edge(true));
        return [...edge(false), ...edge(true).reverse()];
      };
      rims.push(shelf(0));
      pools.push(shelf(0.035));
      start = end + 1;
    }
  }
  return { rims, pools, lips };
}

/** Shallow gours behind scalloped calcite lips, in terraces spanning contiguous cells. */
export function drawRimstone(hand: Hand, piece: DungeonTerrain): void {
  const { floor } = hand.scene.env.dungeon;
  const { rims, pools, lips } = rimstoneShelves(floor, piece);
  if (hand.scene.env.view.water && isSubmergedRimstone(floor, piece)) {
    // Under a lake's shallows only the dams' lips show, stepping down through the water: no shelf or pool of its own.
    hand.line(lips, 'fine');
    return;
  }
  hand.surface(polysPath(rims), 'stone');
  smallShallowPools(hand, pools, 0.12);
  for (const rim of rims) hand.edges(rim, true);
}
