/**
 * A scene's objects as they lie once the map under them is drawn another way (`movedWithMap`):
 * every point follows its place on the image. Sizes stay as they are (a token's follows the grid,
 * a brush's width is a few percent off at most).
 */

import type { ViewState } from '../types/viewState';
import type { FogOperation } from '../types/fogTypes';
import type { Point } from './hexGeometry';
import type { MapMove } from './mapStretch';

type SceneObjects = ViewState['objects'];

/** A record a scene from an older version lacks stays missing. */
function mapRecord<T>(record: Record<string, T>, change: (value: T) => T): Record<string, T> {
  if (!record) return record;
  return Object.fromEntries(Object.entries(record).map(([id, value]) => [id, change(value)]));
}

function placed<T extends Point>(move: MapMove): (value: T) => T {
  return (value) => ({ ...value, ...move({ x: value.x, y: value.y }) });
}

/** A fog operation's shape lies at its points plus its drag offset, so the points are moved as they lie and the offset is spent. */
function movedFog(operation: FogOperation, move: MapMove): FogOperation {
  const dx = operation.offsetX ?? 0;
  const dy = operation.offsetY ?? 0;
  const { offsetX: _offsetX, offsetY: _offsetY, ...rest } = operation;
  const at = (point: Point): Point => move({ x: point.x + dx, y: point.y + dy });
  if (rest.type !== 'rectangle') return { ...rest, points: rest.points.map(at) };
  // A rectangle stays upright: its centre follows the map and its sides the map's stretch.
  const centre = at({ x: rest.x + rest.width / 2, y: rest.y + rest.height / 2 });
  const right = at({ x: rest.x + rest.width, y: rest.y + rest.height / 2 });
  const bottom = at({ x: rest.x + rest.width / 2, y: rest.y + rest.height });
  const width = 2 * Math.hypot(right.x - centre.x, right.y - centre.y);
  const height = 2 * Math.hypot(bottom.x - centre.x, bottom.y - centre.y);
  return { ...rest, x: centre.x - width / 2, y: centre.y - height / 2, width, height };
}

export function objectsMovedWithMap(objects: SceneObjects, move: MapMove): SceneObjects {
  return {
    ...objects,
    tokens: mapRecord(objects.tokens, placed(move)),
    pins: mapRecord(objects.pins, placed(move)),
    texts: mapRecord(objects.texts, placed(move)),
    lights: mapRecord(objects.lights, placed(move)),
    audios: mapRecord(objects.audios, placed(move)),
    drawings: mapRecord(objects.drawings, (drawing) => ({ ...drawing, points: drawing.points.map(move) })),
    walls: mapRecord(objects.walls, (wall) => ({ ...wall, p1: move(wall.p1), p2: move(wall.p2) })),
    fog: mapRecord(objects.fog, (operation) => movedFog(operation, move)),
    ...(objects.lightZones ? { lightZones: mapRecord(objects.lightZones, (zone) => ({ ...zone, polygon: zone.polygon.map(move) })) } : {}),
  };
}
