import { perceivedLevel, showsMap } from '../gameSystems/senseRules';
import type { SceneLighting } from '../types/lightingTypes';
import { exploredMemoryOn } from '../lighting/sceneLightingOptions';
import { ambientLevel } from './lightLevels';
import { litPolygons, type AmbientLight, type LightReach, type Sight, type SightRegion } from './sight';
import type { Polygon } from './visibility';
import type { TexelMask } from '../levels/stackClip';

/**
 * What explored memory records: `polygons`, drawn only inside `clip` when it is set, and without
 * the `areas` of `except` (magical darkness), which are recorded only inside `unless` (what a
 * sense that sees in magical darkness perceives).
 */
export interface ExploredShapes {
  polygons: Polygon[];
  clip: Polygon[] | null;
  except?: { areas: Polygon[]; unless: Polygon[] };
  /**
   * A scene with ambient zones: where the ambient light is lit, painted before `polygons` and
   * inside `clip` like them. `base` is the scene itself, then each zone in its order: a lit one
   * adds its polygon, a dark one takes it away.
   */
  ambient?: { base: boolean; zones: { polygon: Polygon; lit: boolean }[] };
  /**
   * The memory's texels that may record anything of these shapes (`stampClip`): what is seen of a
   * level below through openings above is recorded only where the openings showed it.
   */
  within?: TexelMask;
}

/** A region whose sense shows the map, with the area it covers. */
type MapRegion = SightRegion & { polygon: Polygon };

function isMapRegion(region: SightRegion): region is MapRegion {
  return showsMap(region.sense) && region.polygon !== null;
}

function seesByLight({ sense }: SightRegion): boolean {
  return perceivedLevel(sense, 'bright') !== null || perceivedLevel(sense, 'dim') !== null;
}

/**
 * Whether the token sees the whole region in a dark scene: the sense sees in darkness, and what
 * is lit there is seen too, by the sense itself or, for a sense of the eyes, by the token's
 * sight, which reaches at least as far.
 */
function seesInDarkness(region: SightRegion): boolean {
  return perceivedLevel(region.sense, 'dark') !== null && (seesByLight(region) || !region.sense.worksWhileBlinded);
}

/**
 * The part of the map the vision tokens actually saw, through senses that show the map (never
 * through one that only senses creatures): in ambient light, every region whose sense sees at
 * that level; in a dark scene, where light reaches inside a region that sees by light, and the
 * regions of senses that see in darkness. Null when nothing is recorded: when the scene
 * remembers nothing, and when no token has vision (then line of sight hides nothing and there
 * is nothing to remember).
 */
export function exploredShapes(
  sight: Sight,
  scene: AmbientLight & Pick<SceneLighting, 'exploredMemory'>,
  lights: readonly LightReach[],
): ExploredShapes | null {
  if (!exploredMemoryOn(scene) || sight.all) return null;
  const regions = sight.regions.filter(isMapRegion);
  const except = magicalDarkness(regions, lights);
  const level = ambientLevel(scene);
  if (scene.zones?.length) return withZones(regions, scene, lights, except);
  if (level !== 'dark') {
    const seen = regions.filter(({ sense }) => perceivedLevel(sense, level) !== null).map((region) => region.polygon);
    return seen.length > 0 ? { polygons: seen, clip: null, ...except } : null;
  }
  const byLight = regions.filter(seesByLight).map((region) => region.polygon);
  const inDarkness = regions.filter(seesInDarkness).map((region) => region.polygon);
  const shining = byLight.length > 0 ? lights.filter((light) => !light.darkness) : [];
  if (shining.length === 0 && inDarkness.length === 0) return null;
  // The light polygons count only inside a region that sees by light; a region that sees in darkness is seen whole.
  return withPolygons({ clip: [...new Set([...byLight, ...inDarkness])], ...except }, () => [...shining.flatMap(litPolygons), ...inDarkness]);
}

/**
 * `shapes` whose polygons are worked out when first read: a drag records at most every 100 ms,
 * and a light's reflection makes them cost a union of its parts (`reflectedArea`).
 */
function withPolygons(shapes: Omit<ExploredShapes, 'polygons'>, polygons: () => Polygon[]): ExploredShapes {
  let found: Polygon[] | null = null;
  return Object.defineProperty(shapes, 'polygons', { get: () => (found ??= polygons()), enumerable: true }) as ExploredShapes;
}

/**
 * What is recorded in a scene with ambient zones: the regions that see in darkness whole, and
 * for those that see by light the lights and the ambient light where it is lit, zone by zone.
 */
// ponytail: a sense that sees by light counts every lit level; one that sees bright light only would need the zones per level.
function withZones(regions: readonly MapRegion[], scene: AmbientLight, lights: readonly LightReach[], except: Pick<ExploredShapes, 'except'>): ExploredShapes | null {
  const byLight = regions.filter(seesByLight).map((region) => region.polygon);
  const inDarkness = regions.filter(seesInDarkness).map((region) => region.polygon);
  const clip = [...new Set([...byLight, ...inDarkness])];
  if (clip.length === 0) return null;
  const shining = byLight.length > 0 ? lights.filter((light) => !light.darkness) : [];
  const lit = (ambient: number): boolean => ambientLevel({ ...scene, ambient }) !== 'dark';
  const ambient = { base: lit(scene.ambient), zones: (scene.zones ?? []).map((zone) => ({ polygon: zone.polygon, lit: lit(zone.ambient) })) };
  return withPolygons({ clip, ...(byLight.length > 0 && { ambient }), ...except }, () => [...shining.flatMap(litPolygons), ...inDarkness]);
}

/**
 * The darkness sources of the scene, whose areas no sense records unless it sees in magical
 * darkness; nothing without one, so a scene without darkness records exactly as before.
 */
// ponytail: a light that outranks a darkness lights the players' picture inside it but is not recorded there; subtract the darkness per priority if a table misses it.
function magicalDarkness(regions: readonly MapRegion[], lights: readonly LightReach[]): Pick<ExploredShapes, 'except'> {
  const areas = lights.filter((light) => light.darkness).map((light) => light.polygon);
  if (areas.length === 0) return {};
  return { except: { areas, unless: regions.filter(({ sense }) => perceivedLevel(sense, 'magical-dark') !== null).map((region) => region.polygon) } };
}
