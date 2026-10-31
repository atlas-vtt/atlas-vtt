import { cellKey, doorCells, floorCellsOf } from '../geometry';
import type { CellPoint, DungeonFloor } from '../model';
import { floorStream } from '../rng';
import { fractalNoise } from '../water/noise';
import type { ForestWater } from './forestRivers';
import { waterField } from './riverShape';

/**
 * The meadows along a Forest's rivers and round its lakes: open ground a few cells deep either
 * side of the water, wider and narrower as it goes, joining the clearings it passes, so a party can
 * walk along a river rather than the woods closing on its banks. Cells of the floor's grid that no
 * room holds, within the rooms' extent (the map keeps its size), the strip narrowing to nothing at
 * that extent's edge, where the river goes on into the woods.
 */

/** The narrowest and widest a meadow runs from the water's edge, in cells. */
const BANK = { least: 1.3, most: 3.6 } as const;
/** How far inside the rooms' extent the strip has narrowed to nothing, in cells. */
const TAPER = 4;

export function riverMeadow(floor: DungeonFloor, { rivers, lakes }: ForestWater, seed: number): CellPoint[] {
  if (!rivers.length) return [];
  const own = new Set([...floor.rooms.flatMap((room) => floorCellsOf(room)), ...floor.doors.flatMap(doorCells)].map((c) => cellKey(c.x, c.y)));
  const minX = Math.min(...floor.rooms.map((r) => r.x));
  const minY = Math.min(...floor.rooms.map((r) => r.y));
  const maxX = Math.max(...floor.rooms.map((r) => r.x + r.w));
  const maxY = Math.max(...floor.rooms.map((r) => r.y + r.h));
  const field = waterField(rivers, lakes);
  const breadth = fractalNoise(floorStream(seed, 'water', 0, 'meadow'), 2, 0.5, 11);
  const cells: CellPoint[] = [];
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      if (own.has(cellKey(x, y))) continue;
      const cx = x + 0.5;
      const cy = y + 0.5;
      const edge = Math.min(cx - minX, maxX - cx, cy - minY, maxY - cy);
      const taper = Math.max(0, Math.min(1, (edge - 1) / TAPER));
      const bank = (BANK.least + (BANK.most - BANK.least) * Math.max(0, Math.min(1, 0.5 + breadth(cx, cy)))) * taper;
      if (field.distance(cx, cy) <= bank) cells.push({ x, y });
    }
  }
  return cells;
}
