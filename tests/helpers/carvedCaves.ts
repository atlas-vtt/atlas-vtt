import { strokePolygons } from '../../src/app/lighting/exploredEdits';
import { areaOf, type RoomArea } from '../../src/app/lighting/rooms';
import type { CarvedWalls } from '../../src/app/lighting/wallCarving';
import type { WallSegment } from '../../src/app/types/wallTypes';

/** Maps carved as the rooms mode carves them, for tests: brush strokes that wander like a cave's passages, and rectangles. */

export type Random = () => number;
export const seeded = (seed: number): Random => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

/** A carve or fill as `wallCarving` offers it, and the floor it is told of. */
export type Carve = (area: RoomArea, walls: readonly WallSegment[], floors: readonly RoomArea[], chainId: string) => CarvedWalls;
export type Floor = (walls: readonly WallSegment[]) => RoomArea[];

/** The area of a brush stroke of `steps` stretches wandering from a place on a map of `size`, as the brush of `radius` leaves it. */
export function brushStroke(random: Random, size: number, radius = 50, steps = 25): RoomArea {
  let at = { x: radius + random() * (size - 2 * radius), y: radius + random() * (size - 2 * radius) };
  let heading = random() * 2 * Math.PI;
  const points = [at];
  for (let step = 0; step < steps; step++) {
    heading += (random() - 0.5) * 1.2;
    const next = { x: at.x + Math.cos(heading) * radius * 0.9, y: at.y + Math.sin(heading) * radius * 0.9 };
    // A stroke that reaches the map's edge turns back.
    if (next.x < radius || next.y < radius || next.x > size - radius || next.y > size - radius) heading += Math.PI;
    else points.push(at = next);
  }
  return areaOf(strokePolygons({ type: 'brush', points, brushRadius: radius }));
}

/** A rectangle somewhere on a map of `size`, its sides between `least` and `most` long. */
export function rectangle(random: Random, size: number, least = 60, most = 400): RoomArea {
  const [width, height] = [least + random() * (most - least), least + random() * (most - least)];
  const [x, y] = [random() * (size - width), random() * (size - height)];
  return areaOf([[{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]]);
}

/** `walls` after an edit: the removed ones gone, the added ones given ids that say in which edit they came. */
export function withEdit(walls: readonly WallSegment[], { remove, add }: CarvedWalls, edit: number): WallSegment[] {
  const gone = new Set(remove);
  return [...walls.filter((wall) => !gone.has(wall.id)), ...add.map((wall, index) => ({ ...wall, id: `w${edit}_${index}`, kind: 'wall' as const }))];
}

/** A cave of brush strokes carved one after another until it has `least` walls. */
export function cave(seed: number, least: number, size: number, carve: Carve, floor: Floor): WallSegment[] {
  const random = seeded(seed);
  let walls: WallSegment[] = [];
  for (let edit = 0; walls.length < least && edit < 400; edit++) {
    walls = withEdit(walls, carve(brushStroke(random, size), walls, floor(walls), `c${edit}`), edit);
  }
  return walls;
}
