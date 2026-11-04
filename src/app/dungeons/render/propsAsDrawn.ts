import type { DungeonProp } from '../model';
import { PROP_SPECS } from '../props/catalogue';
import type { FloorField, VisibleDungeon } from './visibleDungeon';

/** How far off its wall a wall piece hangs (`hangPiece`): its drawing's wall line, in cells. */
export const OFF_WALL = 0.1;
/** How far either way of its cell's wall the drawn wall of a cave is looked for, in cells. */
const WALL_SEARCH = 0.7;
const WALL_STEP = 0.05;

/** Where a piece stands: its centre in cells and its turn (radians, 0 with its wall at +y). */
export interface WallPlace {
  x: number;
  y: number;
  rotation: number;
}

/**
 * A wall piece hung on the wall as drawn: moved along its facing until it hangs `OFF_WALL` off the
 * first drawn wall within `WALL_SEARCH` of its own wall line, turned to that wall's own line. Null
 * where no wall is found near.
 */
export function drawnWallPlace(place: WallPlace, field: FloorField): WallPlace | null {
  const out = { x: -Math.sin(place.rotation), y: Math.cos(place.rotation) };
  const wall = { x: place.x + out.x * OFF_WALL, y: place.y + out.y * OFF_WALL };
  const at = (t: number): { x: number; y: number } => ({ x: wall.x + out.x * t, y: wall.y + out.y * t });
  let previous = field.distance(at(-WALL_SEARCH).x, at(-WALL_SEARCH).y);
  for (let t = -WALL_SEARCH + WALL_STEP; t <= WALL_SEARCH + 1e-9; t += WALL_STEP) {
    const p = at(t);
    const d = field.distance(p.x, p.y);
    if (previous < 0 && d >= 0) {
      const hit = at(t - WALL_STEP * (d / (d - previous)));
      const n = field.gradient(hit.x, hit.y);
      const len = Math.hypot(n.x, n.y);
      const into = len > 1e-9 ? { x: n.x / len, y: n.y / len } : out;
      return { x: hit.x - into.x * OFF_WALL, y: hit.y - into.y * OFF_WALL, rotation: Math.atan2(-into.x, into.y) };
    }
    previous = d;
  }
  return null;
}

/**
 * A wall piece of a cave hung on the wall as drawn, not on its cell's edge: the outline wanders off
 * the cell grid (`drawnWallPlace`). Where no wall is found near, it stays where it was placed.
 */
function onDrawnWall(prop: DungeonProp, field: FloorField): DungeonProp {
  const place = drawnWallPlace(prop, field);
  return place ? { ...prop, ...place } : prop;
}

/** Each floor's props as drawn, worked out once per floor shown. */
const drawn = new WeakMap<VisibleDungeon, readonly DungeonProp[]>();

/**
 * A floor's props where the map draws them: in a cave its wall pieces hang on the drawn wall
 * (`onDrawnWall`), every other piece where it was placed. The picture and the scene's map features
 * both read them, so a piece's hover outline lies on its drawing.
 */
export function propsAsDrawn(dungeon: VisibleDungeon): readonly DungeonProp[] {
  let props = drawn.get(dungeon);
  if (!props) {
    const cave = dungeon.floor.cave !== undefined;
    props = dungeon.floor.props.map((prop) => (cave && PROP_SPECS[prop.kind].wallPiece ? onDrawnWall(prop, dungeon.field) : prop));
    drawn.set(dungeon, props);
  }
  return props;
}
