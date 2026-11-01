import { roadField } from '../../forest/forestRoads';
import { waterField } from '../../forest/riverShape';
import { forestLookOf } from '../../forestLooks';
import type { DungeonModel } from '../../model';
import type { DungeonStyle } from '../../style';
import type { Bounds } from '../geometry';
import type { VisibleDungeon } from '../visibleDungeon';
import { woodsMass, type WoodsClump } from './woodsMass';

/** How far the mass keeps off a river's water, in cells: the trees stand on its banks and lean over it a little. */
const RIVER_BANK = 0.3;
/** How far the mass keeps off a road's edge, in cells: a verge either side. */
const ROAD_VERGE = 0.35;

type FloorDistance = (x: number, y: number) => number;

/** A dungeon's last mass: a scene's map job draws it and then walls it, and working it out is a good part of a forest's cost. */
const lastMass = new WeakMap<DungeonModel, { key: string; mass: WoodsClump[] }>();

/**
 * How far a point lies outside everything the woods keep off, in cells (negative inside): the
 * clearings, the rivers and lakes, the roads. `floor` answers for the clearings. Asked a few million
 * times: no allocation in what it returns.
 */
export function woodsOutside(dungeon: VisibleDungeon, floor: FloorDistance = (x, y) => dungeon.field.distance(x, y)): FloorDistance {
  const water = waterField(dungeon.floor.rivers, dungeon.floor.lakes);
  const road = roadField(dungeon.floor.roads);
  return (x, y) => Math.min(floor(x, y), water.distance(x, y) - RIVER_BANK, road.distance(x, y) - ROAD_VERGE);
}

/**
 * The woods' mass of a Forest's floor, the one thing its drawing and its walls are made from, so
 * the walls lie on the trees the map shows. `bounds` is what a whole map's frame gives (`viewBounds`
 * with a margin of 1), on which the mass depends through the order clumps are tried in. It reads
 * the floors' exact distance and not a raster of it, so no map's size changes a tree.
 */
export function forestMass(dungeon: VisibleDungeon, style: DungeonStyle, bounds: Bounds): WoodsClump[] {
  const look = forestLookOf(style);
  const key = `${dungeon.index}:${dungeon.rooms.length}:${look.conifers}:${look.bare}:${bounds.minX}:${bounds.minY}:${bounds.maxX}:${bounds.maxY}`;
  const last = lastMass.get(dungeon.model);
  if (last?.key === key) return last.mass;
  const outside = woodsOutside(dungeon);
  const mass = woodsMass(bounds, (p) => outside(p.x, p.y), dungeon.model.seed, look);
  lastMass.set(dungeon.model, { key, mass });
  return mass;
}
