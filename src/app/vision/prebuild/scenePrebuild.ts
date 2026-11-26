import type { EngineLight } from '../../pixi/lighting/engine/types';
import type { Point } from '../../types/visionTypes';
import type { AreaSampling, LightReachPart } from '../areaReach';
import { LightReaches, withReflection } from '../lightReaches';
import { knownReflectedArea, reflectedArea, type ReflectionPart, type ReflectionSampling } from '../reflectedLight';
import { reachOf, sightPolygons, type LightReach, type PrimedSight, type SightSource } from '../sight';
import type { VisionCone } from '../visionCone';
import { withWallsHeld } from '../wallGrid';
import { PolygonPacker, unpackPolygon, type PackedPolygons } from './polygonCodec';
import { unpackWalls, type PackedWalls } from './wallCodec';

/**
 * What part of a scene's light reaches and sight is traced from (`SceneModelBuilder.prepare`):
 * the walls sealed as the builder seals them, lights of the scene, how area lights and
 * reflections are sampled, and sight sources as `sightSources` gives them, before magical
 * darkness takes their eyes (a superset of what the build sweeps for them: `sourcesInDarkness`
 * only takes senses away).
 */
export interface PrebuildRequest {
  walls: PackedWalls;
  lights: EngineLight[];
  sampling: AreaSampling;
  reflection: ReflectionSampling | null;
  sources: SightSource[];
  /** Explored memory records what the tokens see: the areas the lights' reflections light are worked out too (`reflectedArea`). */
  explored: boolean;
}

/** What one token's sight sweeps, with where it stood and looked. */
interface PackedSight {
  tokenId: string;
  origin: Point;
  cone?: VisionCone;
  keys: string[];
  polygons: number[];
}

/**
 * The traced polygons of every light and token, packed (`PackedPolygons`). `reaches` holds four
 * numbers per light: its polygon (-1 for an area light, whose polygon is its area), how many
 * parts, how many reflection parts and how many outlines of its reflected area it has (-1 where
 * that was not worked out); `parts` holds `x, y, polygon` and `reflections`
 * `x, y, reach, strength, polygon` of each part, and `areas` the polygons of the outlines, light after light.
 */
export interface PrebuildReply {
  polygons: PackedPolygons;
  reaches: Int32Array;
  parts: Float64Array;
  reflections: Float64Array;
  areas: Int32Array;
  sight: PackedSight[];
}

/**
 * Traces what `SceneModelBuilder.build` traces, with the same code: the reach of every light and
 * the polygons of every token's sight in `request`. Runs in a worker while the scene loads.
 */
export function prebuildScene(request: PrebuildRequest): PrebuildReply {
  const walls = unpackWalls(request.walls);
  return withWallsHeld(() => {
    const packer = new PolygonPacker();
    const reply = packReaches(new LightReaches().sync(request.lights, walls, request.sampling, request.reflection), packer, request.explored);
    const sight = request.sources.map((source): PackedSight => {
      const { tokenId, origin, cone } = source;
      const polygons = sightPolygons(source, walls);
      return { tokenId, origin, ...(cone && { cone }), keys: [...polygons.keys()], polygons: [...polygons.values()].map((polygon) => packer.add(polygon)) };
    });
    return { ...reply, sight, polygons: packer.pack() };
  });
}

function packReaches(reaches: readonly LightReach[], packer: PolygonPacker, explored: boolean): Pick<PrebuildReply, 'reaches' | 'parts' | 'reflections' | 'areas'> {
  const header = new Int32Array(HEADER * reaches.length);
  const parts: number[] = [];
  const reflections: number[] = [];
  const areas: number[] = [];
  reaches.forEach((reach, i) => {
    header[HEADER * i] = reach.parts ? -1 : packer.add(reach.polygon);
    header[HEADER * i + 1] = reach.parts?.length ?? 0;
    header[HEADER * i + 2] = reach.reflection?.length ?? 0;
    for (const part of reach.parts ?? []) parts.push(part.origin.x, part.origin.y, packer.add(part.polygon));
    for (const part of reach.reflection ?? []) reflections.push(part.origin.x, part.origin.y, part.reach, part.strength, packer.add(part.polygon));
    const area = explored && reach.reflection?.length ? reflectedArea(reach.reflection) : null;
    header[HEADER * i + 3] = area ? area.length : -1;
    for (const outline of area ?? []) areas.push(packer.add(outline));
  });
  return { reaches: header, parts: Float64Array.from(parts), reflections: Float64Array.from(reflections), areas: Int32Array.from(areas) };
}

/** Numbers per light in `PrebuildReply.reaches`. */
const HEADER = 4;

/**
 * The reaches of `lights` from `reply`, made as `LightReaches` makes them (`traceReach`): each
 * with its light's own place, radii and kind. Null where the reply does not answer for these lights.
 */
export function unpackReaches(reply: PrebuildReply, lights: readonly EngineLight[], reflection: ReflectionSampling | null): LightReach[] | null {
  if (reply.reaches.length !== HEADER * lights.length) return null;
  let part = 0;
  let reflected = 0;
  let outline = 0;
  const reaches = lights.map((light, i) => {
    const { x, y, bright, dim, surface } = light;
    const polygon = reply.reaches[HEADER * i]!;
    if ((polygon < 0) !== !!surface) return null;
    const parts: LightReachPart[] = [];
    for (let k = reply.reaches[HEADER * i + 1]!; k > 0; k--, part++) {
      parts.push({ origin: { x: reply.parts[3 * part]!, y: reply.parts[3 * part + 1]! }, polygon: unpackPolygon(reply.polygons, reply.parts[3 * part + 2]!) });
    }
    const reflections: ReflectionPart[] = [];
    for (let k = reply.reaches[HEADER * i + 2]!; k > 0; k--, reflected++) {
      const at = 5 * reflected;
      const r = reply.reflections;
      reflections.push({ origin: { x: r[at]!, y: r[at + 1]! }, reach: r[at + 2]!, strength: r[at + 3]!, polygon: unpackPolygon(reply.polygons, r[at + 4]!) });
    }
    const outlines = reply.reaches[HEADER * i + 3]!;
    if (outlines >= 0) knownReflectedArea(reflections, Array.from({ length: outlines }, () => unpackPolygon(reply.polygons, reply.areas[outline++]!)));
    const reach = surface ? reachOf({ x, y }, bright, dim, surface as Point[], light, parts) : reachOf({ x, y }, bright, dim, unpackPolygon(reply.polygons, polygon), light);
    return reflection && !light.darkness ? withReflection(reach, reflections) : reach;
  });
  return reaches.every((reach) => reach !== null) ? reaches : null;
}

/** The polygons of each token's sight from `reply` (`SightCache.prime`). */
export function unpackSight(reply: PrebuildReply): Map<string, PrimedSight> {
  return new Map(reply.sight.map(({ tokenId, origin, cone, keys, polygons }) => [
    tokenId,
    { origin, ...(cone && { cone }), polygons: new Map(keys.map((key, i) => [key, unpackPolygon(reply.polygons, polygons[i]!)])) },
  ]));
}
