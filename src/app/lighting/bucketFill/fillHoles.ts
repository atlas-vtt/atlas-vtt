import type { QShape } from '../../types/shapeTypes';
import type { Point } from '../../types/visionTypes';
import { strokePolygons } from '../exploredEdits';
import { normalizePolygon, subtractShapes, unionShapes } from '../polygonClip';
import { areaOf, outlinesWithHoles, type RoomArea } from '../rooms';

/**
 * `area` with the holes filled that it leaves in the floor, together with the rooms already carved
 * (`floor`): the rock a bucket's flood, its trail and the rooms around enclose. Only a hole wholly
 * within `reach` of the bucket's `path` is filled, so a pillar stays one unless the bucket is
 * dragged close by it, and none is filled in part.
 */
export function withHolesFilled(area: RoomArea, floor: readonly RoomArea[], path: readonly Point[], reach: number): RoomArea {
  if (area.length === 0 || path.length === 0 || !(reach > 0)) return area;
  const trail = areaOf(strokePolygons({ type: 'brush', points: [...path], brushRadius: reach }));
  const all = unionShapes([...floor.flat(), ...area], []);
  const holes: QShape = outlinesWithHoles(all)
    .flatMap(({ holes: inside }) => inside)
    .map((hole) => normalizePolygon(hole))
    .filter((hole) => subtractShapes(hole, trail).length === 0)
    .flat();
  return holes.length === 0 ? area : (unionShapes(area, holes) as RoomArea);
}
