import type { TokenEntity } from '../types';
import type { LightZone, SceneLighting } from '../types/lightingTypes';
import type { SenseDefinition } from '../types/senseTypes';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { PLAYER_SIGHT_POLICY, sightPolicyFor, visionOn, type SightPolicy } from './tokenSightPolicy';
import { NORMAL_SIGHT } from '../gameSystems/senses/generic';
import { gameUnitsToWorld, type UnitScale } from '../lighting/lightingUnits';
import { tokenVisionOn } from '../lighting/sceneLightingOptions';
import { ambientLevel } from './lightLevels';
import { GENERIC_SIGHT_RULES, tokenEffects, type SightRules } from './sightRules';
import { resolveSenses, tokenSenses } from './tokenSenses';
import { computeVisibility, type MapBounds, type Polygon } from './visibility';
import { sameCone, tokenFacing, visionCone, type VisionCone } from './visionCone';
import { computeTokenPixelSize } from '../pixi/token-renderer/tokenSizing';

export { areaLightReach, kindOf, lightReach, litPolygons, reachOf, type LightReach, type LightReachKind } from './lightReach';

/**
 * The scene's light without its sources: at or above `litThreshold` (unset: 0.25) ambient light,
 * every point in sight counts as lit, so a token standing there can be seen. It is dimly lit up
 * to `brightThreshold` (unset: 0.75) and brightly from there (`lightLevelAt`).
 */
export type AmbientLight = Pick<SceneLighting, 'ambient' | 'litThreshold' | 'brightThreshold'> & {
  /** Areas with ambient light of their own, later ones over earlier ones (`LightZone`); inside a zone's polygon its level counts. */
  zones?: readonly AmbientZone[];
};

/** What the rules read of a light zone. */
export type AmbientZone = Pick<LightZone, 'polygon' | 'ambient'>;

/** One sense of a token that sees, with its reach in world pixels. */
export interface SenseSource {
  definition: SenseDefinition;
  range: number;
}

/** A token that sees, in world pixels. */
export interface SightSource {
  tokenId: string;
  origin: Point;
  /** How far its sight reaches; senses of the eyes reach no farther. */
  range: number;
  /**
   * Where the token looks; unset, it sees all around. Clips its sight and its senses of the eyes,
   * except within `cone.apex`, the token's own radius, which it always sees (walls permitting).
   */
  cone?: VisionCone;
  /** What it perceives beyond its sight; of a blinded token, only the senses that work while blinded. */
  senses: SenseSource[];
  /** The token is blinded: it has no sight, only its senses. One whose `range` is 0 has no sight either, and keeps what it senses without the eyes. */
  blinded?: true;
  /** Its eyes see invisible things: its sight and every sense of the eyes. */
  seesInvisible?: true;
}

/** Where one token perceives through one of its senses. */
export interface SightRegion {
  tokenId: string;
  /** How it perceives there: `NORMAL_SIGHT` for the token's sight. */
  sense: SenseDefinition;
  origin: Point;
  /** How far the sense reaches. */
  radius: number;
  /**
   * What the sense reaches within `radius`, as walls leave it. Null for a sense that walls do
   * not stop: the whole disc, in which it senses creatures and never shows the map (`showsMap`).
   */
  polygon: Polygon | null;
  /** Radius of the viewer's own space around a vision cone; 0 without one. */
  apex: number;
  /** The cone a disc is cut to: only for a sense of the eyes without a polygon. */
  cone?: VisionCone;
  /** The sense perceives invisible tokens, by itself or because the token's eyes do. */
  seesInvisible: boolean;
}

/**
 * What the vision tokens perceive, a region per token and sense. `all` means no token on any of
 * the scene's levels has vision (or the scene has token vision off): normal sight reaches everywhere.
 */
export interface Sight {
  all: boolean;
  regions: SightRegion[];
}

/** No source contributes a visible region. */
export const NO_SIGHT: Sight = { all: false, regions: [] };

/** Sight of a scene without a vision token: line of sight hides nothing. */
export const SEES_ALL: Sight = { all: true, regions: [] };

/**
 * The tokens `policy` lets give sight (the players' picture unless another is named), with ranges
 * converted to world pixels; never a token without vision on, whatever the policy says, nor one the rules count as
 * defeated (`sightPolicyFor`). A blinded token keeps
 * only its senses that work while blinded; a sense that lets the eyes see invisible things is
 * not a sense of its own. A token whose way of perceiving is not known yet (`TokenSight.pending`)
 * is a source that perceives nothing: it must not see, or record as explored, what its statblock
 * may be about to rule out, and the scene still has a vision token, so nothing is shown for want of one.
 */
export function sightSources(
  tokens: Record<string, TokenEntity>,
  scale: UnitScale,
  bounds: MapBounds,
  rules: SightRules = GENERIC_SIGHT_RULES,
  policy: SightPolicy = PLAYER_SIGHT_POLICY,
): SightSource[] {
  const unlimited = Math.hypot(bounds.width, bounds.height);
  const sources: SightSource[] = [];
  const { givesSight } = sightPolicyFor(policy, rules);
  for (const token of Object.values(tokens)) {
    if (!visionOn(token) || !givesSight(token)) continue;
    const origin = { x: token.x, y: token.y };
    const how = rules.visionOf?.(token) ?? { senses: tokenSenses(token.vision, rules.definitions), ...(token.vision.range !== undefined && { sightRange: token.vision.range }) };
    if (how.pending) {
      sources.push({ tokenId: token.id, origin, range: 0, senses: [] });
      continue;
    }
    const range = how.sightRange;
    const cone = visionCone(tokenFacing(token.rotation), token.vision.angle, computeTokenPixelSize(scale.cellSize, token.size || 1) / 2);
    const blinded = tokenEffects(token, rules.conditions).has('blinded');
    const resolved = resolveSenses(how.senses, rules.definitions);
    const senses = resolved
      .filter(({ definition }) => !definition.grants && (!blinded || definition.worksWhileBlinded))
      .map(({ definition, range: reach }) => ({ definition, range: reach === undefined ? unlimited : gameUnitsToWorld(reach, scale) }));
    sources.push({
      tokenId: token.id,
      origin,
      range: range === undefined ? unlimited : gameUnitsToWorld(range, scale),
      ...(cone && { cone }),
      senses,
      ...(blinded && { blinded }),
      ...(!blinded && resolved.some(({ definition }) => definition.grants === 'see-invisible') && { seesInvisible: true as const }),
    });
  }
  return sources;
}

interface CachedSight {
  source: SightSource;
  walls: readonly WallSegment[];
  regions: SightRegion[];
}

/** Keeps each token's regions until the token, its senses or the walls change, so only those recompute. */
export class SightCache {
  private entries = new Map<string, CachedSight>();
  /** The walls of the last call. */
  private walls: readonly WallSegment[] | null = null;
  /** The regions worked out with walls used before: a scene switched back to, or a wall edit undone, finds them again. */
  private readonly kept = new Map<readonly WallSegment[], Map<string, CachedSight>>();

  /** Polygons worked out elsewhere for these walls (`prime`), each token's with where it stood and looked. */
  private primed: { walls: readonly WallSegment[]; tokens: ReadonlyMap<string, PrimedSight> } | null = null;

  get(source: SightSource, walls: readonly WallSegment[]): SightRegion[] {
    if (walls !== this.walls) this.switchWalls(walls);
    const cached = this.entries.get(source.tokenId);
    if (cached && cached.walls === walls && sameSource(cached.source, source)) return cached.regions;
    const regions = regionsOf(source, walls, this.primedPolygons(source, walls));
    this.entries.set(source.tokenId, { source, walls, regions });
    return regions;
  }

  /**
   * Takes the polygons of `tokens` worked out for `walls` (a worker's, while the scene loads):
   * a token asked about later with these walls, standing and looking as it did then, takes its
   * polygons instead of sweeping them. Polygons depend on nothing else (`sightPolygons`).
   */
  prime(walls: readonly WallSegment[], tokens: ReadonlyMap<string, PrimedSight>): void {
    this.primed = { walls, tokens };
  }

  private primedPolygons(source: SightSource, walls: readonly WallSegment[]): Map<string, Polygon> | undefined {
    if (this.primed?.walls !== walls) return undefined;
    const primed = this.primed.tokens.get(source.tokenId);
    if (!primed || primed.origin.x !== source.origin.x || primed.origin.y !== source.origin.y || !sameCone(primed.cone, source.cone)) return undefined;
    return new Map(primed.polygons);
  }

  /** Whether regions worked out with `walls` are held: the walls in use, or kept from before. */
  knows(walls: readonly WallSegment[]): boolean {
    return walls === this.walls || this.kept.has(walls);
  }

  /** Drops tokens that no longer see, among the regions of the walls used last (`useWalls`). */
  retain(tokenIds: ReadonlySet<string>): void {
    for (const id of this.entries.keys()) if (!tokenIds.has(id)) this.entries.delete(id);
  }

  /** Keeps the regions of the walls used before and takes up those kept for `walls`; a build calls it before `retain`. */
  useWalls(walls: readonly WallSegment[]): void {
    if (walls !== this.walls) this.switchWalls(walls);
  }

  private switchWalls(walls: readonly WallSegment[]): void {
    if (this.walls) {
      this.kept.delete(this.walls);
      this.kept.set(this.walls, this.entries);
      if (this.kept.size > KEPT_SIGHT_WALLS) this.kept.delete(this.kept.keys().next().value!);
    }
    this.walls = walls;
    this.entries = this.kept.get(walls) ?? new Map<string, CachedSight>();
    this.kept.delete(walls);
  }
}

/** Wall arrays whose regions `SightCache` keeps besides the current ones. */
const KEPT_SIGHT_WALLS = 3;

function sameSource(a: SightSource, b: SightSource): boolean {
  return a.origin.x === b.origin.x && a.origin.y === b.origin.y && a.range === b.range
    && a.cone?.facing === b.cone?.facing && a.cone?.angle === b.cone?.angle && a.cone?.apex === b.cone?.apex
    && a.blinded === b.blinded && a.seesInvisible === b.seesInvisible
    && a.senses.length === b.senses.length
    && a.senses.every((sense, i) => sense.definition === b.senses[i]!.definition && sense.range === b.senses[i]!.range);
}

/**
 * The regions of one token: its sight unless it is blinded, then one per sense. A sense of the
 * eyes (one that does not work while blinded) reaches no farther than the token's sight and is
 * clipped by its cone; the others reach their own distance all around. Senses that reach as far
 * with the same cone share one polygon. `polygons` holds those already known, by `sightPolygonKey`,
 * and takes in those swept.
 */
function regionsOf(source: SightSource, walls: readonly WallSegment[], polygons = new Map<string, Polygon>()): SightRegion[] {
  const { tokenId, origin, cone } = source;
  const polygonOf = (radius: number, eyes: boolean): Polygon => {
    const key = sightPolygonKey(radius, eyes);
    const polygon = polygons.get(key) ?? computeVisibility(origin, radius, walls, eyes ? cone : undefined, 'sight');
    polygons.set(key, polygon);
    return polygon;
  };
  const regionOf = (sense: SenseDefinition, reach: number): SightRegion => {
    const eyes = !sense.worksWhileBlinded;
    const radius = eyes ? Math.min(reach, source.range) : reach;
    return {
      tokenId,
      sense,
      origin,
      radius,
      polygon: sense.lineOfSight ? polygonOf(radius, eyes) : null,
      apex: eyes ? cone?.apex ?? 0 : 0,
      ...(eyes && !sense.lineOfSight && cone && { cone }),
      seesInvisible: sense.seesInvisible || (eyes && !!source.seesInvisible),
    };
  };
  // A sense that reaches nowhere has no region: the sight of a token without normal sight, and its senses of the eyes.
  return [
    ...(source.blinded ? [] : [regionOf(NORMAL_SIGHT, source.range)]),
    ...source.senses.map(({ definition, range }) => regionOf(definition, range)),
  ].filter((region) => region.radius > 0);
}

/** A token's sight polygons worked out elsewhere, with where it stood and looked then (`SightCache.prime`). */
export interface PrimedSight {
  origin: Point;
  cone?: VisionCone;
  /** By `sightPolygonKey`. */
  polygons: ReadonlyMap<string, Polygon>;
}

/** Names a token's polygon by what shapes it besides where the token stands and looks: its radius, and whether its cone clips it. */
function sightPolygonKey(radius: number, eyes: boolean): string {
  return `${radius}|${eyes}`;
}

/** The polygons the regions of `source` are made of, by `sightPolygonKey`: all that a token's sight sweeps. */
export function sightPolygons(source: SightSource, walls: readonly WallSegment[]): Map<string, Polygon> {
  const polygons = new Map<string, Polygon>();
  regionsOf(source, walls, polygons);
  return polygons;
}

/** What the scene holds beyond the level its sight is worked out on. */
export interface SightScene {
  /** A token on any of the scene's levels has vision on (`sceneHasVision`); without one, sight is all. */
  sceneHasVision: boolean;
}

/**
 * The scene's sight: that of its vision tokens, or everything while the scene has token vision off. `sources` are
 * those of the level shown; a level without one shows nothing while a token elsewhere in the scene has vision.
 */
export function sceneSight(
  lighting: Pick<SceneLighting, 'tokenVision'>,
  sources: readonly SightSource[],
  walls: readonly WallSegment[],
  cache: SightCache | undefined,
  scene: SightScene,
): Sight {
  return tokenVisionOn(lighting) ? computeSight(sources, walls, cache, scene.sceneHasVision) : SEES_ALL;
}

/**
 * What `sources` perceive. Without a source, everything when the scene has no vision token at all (on a scene
 * of one level, exactly when `sources` is empty, the default), and nothing when its vision tokens are elsewhere.
 */
export function computeSight(
  sources: readonly SightSource[],
  walls: readonly WallSegment[],
  cache: SightCache = new SightCache(),
  sceneHasVision = sources.length > 0,
): Sight {
  if (sources.length === 0) return sceneHasVision ? NO_SIGHT : SEES_ALL;
  return { all: false, regions: sources.flatMap((source) => cache.get(source, walls)) };
}

/**
 * Changes to what tokens see or what explored memory records, for which the scene is rebuilt:
 * the options, and the ambient light crossing a threshold (choosing "Day" records at once).
 */
export function sightOptionsChanged(a: SceneLighting, b: SceneLighting): boolean {
  return a.tokenVision !== b.tokenVision || a.exploredMemory !== b.exploredMemory || a.litThreshold !== b.litThreshold
    || a.brightThreshold !== b.brightThreshold || ambientLevel(a) !== ambientLevel(b);
}
