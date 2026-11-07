/**
 * A scene's objects as they lie once the map under them is drawn another way (`movedWithMap`):
 * every point follows its place on the image. Sizes stay as they are (a token's follows the grid,
 * a brush's width is a few percent off at most).
 */

import type { ViewState } from '../types/viewState';
import type { FogOperation } from '../types/fogTypes';
import type { Point } from './hexGeometry';
import type { MapMove } from './mapStretch';
import { isOffMap, sceneTokens } from '../tokens/offMap';
import { liquidMovedWithMap } from '../liquids/liquids';

type SceneObjects = ViewState['objects'];

/** Which objects move with the map; without one, all of them. */
export type MovesWithMap = (object: object) => boolean;

/** A record a scene from an older version lacks stays missing; an entry `moves` leaves out (or that is no object) stays as it is. */
function mapRecord<T>(record: Record<string, T>, change: (value: T) => T, moves?: MovesWithMap): Record<string, T> {
  if (!record) return record;
  const moved = (value: T): T => (!moves || (typeof value === 'object' && value !== null && moves(value)) ? change(value) : value);
  return Object.fromEntries(Object.entries(record).map(([id, value]) => [id, moved(value)]));
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

/**
 * `objects` as they lie once the map under them is drawn another way. With `moves`, only the
 * objects it names follow the map: in a scene with levels, those on the level whose image changed.
 */
export function objectsMovedWithMap(objects: SceneObjects, move: MapMove, moves?: MovesWithMap): SceneObjects {
  return {
    ...objects,
    // A combatant kept beside the map has no place on its image and stays where it waits
    tokens: mapRecord(sceneTokens(objects), (token) => (isOffMap(token) ? token : placed<typeof token>(move)(token)), moves),
    pins: mapRecord(objects.pins, placed(move), moves),
    texts: mapRecord(objects.texts, placed(move), moves),
    // An area light's area follows the map with its middle.
    lights: mapRecord(objects.lights, (light) => ({ ...placed<typeof light>(move)(light), ...(Array.isArray(light.area) && { area: light.area.map(move) }) }), moves),
    audios: mapRecord(objects.audios, placed(move), moves),
    drawings: mapRecord(objects.drawings, (drawing) => ({ ...drawing, points: drawing.points.map(move) }), moves),
    walls: mapRecord(objects.walls, (wall) => ({ ...wall, p1: move(wall.p1), p2: move(wall.p2) }), moves),
    fog: mapRecord(objects.fog, (operation) => movedFog(operation, move), moves),
    ...(objects.lightZones ? { lightZones: mapRecord(objects.lightZones, (zone) => ({ ...zone, polygon: zone.polygon.map(move) }), moves) } : {}),
    ...(objects.levelLinks ? { levelLinks: mapRecord(objects.levelLinks, (link) => (Array.isArray(link.polygon) ? { ...link, polygon: link.polygon.map(move) } : link), moves) } : {}),
    ...(objects.levelSurfaces ? { levelSurfaces: mapRecord(objects.levelSurfaces, (surface) => (Array.isArray(surface.polygon) ? { ...surface, polygon: surface.polygon.map(move) } : surface), moves) } : {}),
    ...(objects.mapFeatures ? { mapFeatures: mapRecord(objects.mapFeatures, (feature) => (Array.isArray(feature.polygon) ? { ...feature, polygon: feature.polygon.map(move) } : feature), moves) } : {}),
    ...(objects.liquids ? { liquids: mapRecord(objects.liquids, (surface) => liquidMovedWithMap(surface, move), moves) } : {}),
  };
}
