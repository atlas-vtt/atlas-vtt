import { hash2 } from '../art/noise';
import { waterField } from '../../forest/riverShape';
import { roadField } from '../../forest/forestRoads';
import { stairsAndAround } from '../../floors/stairSpots';
import { cellKey } from '../../geometry';
import type { VisibleDungeon } from '../visibleDungeon';

/** A tree standing on its own in a clearing, near its edge: its crown and how thick its trunk is. */
export interface LoneTree {
  x: number;
  y: number;
  /** The crown's radius, in cells. */
  radius: number;
  /** A thick trunk covers three quarters of whoever stands behind it, a narrow one half. */
  thick: boolean;
}

/** The share of cells that may hold one, before the rules below; the band inside a clearing's edge they stand in (cells from it). */
const CHANCE = 0.035;
const BAND = { near: 0.6, far: 1.6 } as const;
/** A lone tree's crown keeps this far from a river's water, and from a road's edge, in cells. */
const RIVER_CLEAR = 0.3;
const ROAD_CLEAR = 0.4;
/** Two lone trees keep this far apart, in crowns' radii together. */
const APART = 1.6;

/**
 * The lone trees of a Forest's entry floor, as Watabou's edge trees: rare single trees just inside a
 * clearing's edge, cover for a fight in the open. Worked out from the floor's shape and seed alone,
 * so the drawing (`drawForest`) and the scene (their trunks' walls and cover) find the same trees.
 * None stands on a way down, the row it is entered from or beside them (`stairsAndAround`): its
 * trunk is a wall, and with the rock beside it would close the way to the stairs.
 */
export function loneTrees(dungeon: VisibleDungeon): LoneTree[] {
  if (!dungeon.floor.forest) return [];
  const { bounds, field, model } = dungeon;
  const seed = model.seed + dungeon.index * 7919;
  const river = waterField(dungeon.floor.rivers, dungeon.floor.lakes);
  // Off the roads and the bridges on them.
  const road = roadField(dungeon.floor.roads);
  const stairs = new Set(stairsAndAround(dungeon.floor.stairs));
  const trees: LoneTree[] = [];
  for (let j = Math.floor(bounds.minY); j < bounds.maxY; j++) {
    for (let i = Math.floor(bounds.minX); i < bounds.maxX; i++) {
      if (hash2(i, j, seed + 977) > CHANCE) continue;
      const x = i + hash2(i, j, seed + 978);
      const y = j + hash2(i, j, seed + 979);
      const inside = -field.distance(x, y);
      const radius = 0.42 + 0.25 * hash2(i, j, seed + 980);
      if (inside < BAND.near || inside > BAND.far) continue;
      if (river.distance(x, y) < radius + RIVER_CLEAR) continue;
      if (road.distance(x, y) < radius + ROAD_CLEAR) continue;
      if (stairs.has(cellKey(Math.floor(x), Math.floor(y)))) continue;
      if (trees.some((tree) => Math.hypot(tree.x - x, tree.y - y) < APART * (tree.radius + radius))) continue;
      trees.push({ x, y, radius, thick: radius > 0.6 });
    }
  }
  return trees;
}
