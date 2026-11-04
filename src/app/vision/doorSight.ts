import { showsMap } from '../gameSystems/senseRules';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { lightLevelAt } from './lightLevels';
import { perceive } from './perception';
import type { AmbientLight, LightReach, Sight } from './sight';

/** How far beside a door's centre line its floor is looked at, in world pixels: past the line itself, well within the doorway. */
const BESIDE_DOOR = 4;

export function doorMiddle(wall: Pick<WallSegment, 'p1' | 'p2'>): Point {
  return { x: (wall.p1.x + wall.p2.x) / 2, y: (wall.p1.y + wall.p2.y) / 2 };
}

/** The floor just beside a door's middle, one point on each side of it. */
function besideDoor(wall: WallSegment): Point[] {
  const middle = doorMiddle(wall);
  const [dx, dy] = [wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y];
  const length = Math.hypot(dx, dy);
  if (length === 0) return [middle];
  const [nx, ny] = [(-dy / length) * BESIDE_DOOR, (dx / length) * BESIDE_DOOR];
  return [{ x: middle.x + nx, y: middle.y + ny }, { x: middle.x - nx, y: middle.y - ny }];
}

/**
 * The doors the players see now: ordinary doors with floor beside their middle, on either side,
 * that the players' picture shows. That is `perceive`, the rule tokens are seen by, asked of the
 * senses that show the map: in sight and in light the sense sees by. A secret door never, nor a
 * door in darkness, out of sight or only remembered. Without a vision token, or with the scene's
 * token vision off (`sight.all`), every ordinary door on lit floor.
 */
export function doorsInSight(walls: readonly WallSegment[], sight: Sight, ambient: AmbientLight, lights: readonly LightReach[]): Set<string> {
  const shows = mapShownAt(sight, ambient, lights);
  const seen = new Set<string>();
  for (const wall of walls) {
    if (wall.type !== 'door') continue;
    if (besideDoor(wall).some(shows)) seen.add(wall.id);
  }
  return seen;
}

/**
 * Whether the players' picture shows the map at a point now, by the rule door badges follow: a
 * sense that shows the map perceives it there (`perceive`), in sight and in light it sees by. Never
 * where the map is only remembered.
 */
export function mapShownAt(sight: Sight, ambient: AmbientLight, lights: readonly LightReach[]): (point: Point) => boolean {
  const picture: Sight = { all: sight.all, regions: sight.regions.filter((region) => showsMap(region.sense)) };
  return (point) => perceive(point, picture, () => lightLevelAt(point, ambient, lights)) !== 'unseen';
}
