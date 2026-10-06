// Frozen from 3c23746a6f54b67b442646ea8ff912c914c2447a src/app/vision/sight.ts. Only import paths are adapted.
import type { TokenEntity } from '../../../src/app/types';
import type { LightZone, SceneLighting } from '../../../src/app/types/lightingTypes';
import type { SenseDefinition } from '../../../src/app/types/senseTypes';
import type { Point } from '../../../src/app/types/visionTypes';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { NORMAL_SIGHT } from '../../../src/app/gameSystems/senses/generic';
import { gameUnitsToWorld, type UnitScale } from '../../../src/app/lighting/lightingUnits';
import { tokenVisionOn } from '../../../src/app/lighting/sceneLightingOptions';
import { ambientLevel } from '../../../src/app/vision/lightLevels';
import { GENERIC_SIGHT_RULES, tokenEffects, type SightRules } from '../../../src/app/vision/sightRules';
import { resolveSenses, tokenSenses } from '../../../src/app/vision/tokenSenses';
import { computeVisibility, type MapBounds, type Polygon } from '../../../src/app/vision/visibility';
import { visionCone, type VisionCone } from '../../../src/app/vision/visionCone';
import { computeTokenPixelSize } from '../../../src/app/pixi/token-renderer/tokenSizing';

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
 * What the vision tokens perceive, a region per token and sense. `all` means no token has
 * vision (or the scene has token vision off): normal sight reaches everywhere.
 */
export interface Sight {
  all: boolean;
  regions: SightRegion[];
}

/** Sight of a viewer without a vision token: line of sight hides nothing. */
export const SEES_ALL: Sight = { all: true, regions: [] };

/** The area a light illuminates, for deciding on the CPU how well a point is lit. World pixels. */
export interface LightReach {
  origin: Point;
  /** Radius of bright light; 0 for a light that is dim throughout. */
  bright: number;
  /** Radius where the light ends. */
  dim: number;
  /** What the light reaches within `dim`, clipped by walls. */
  polygon: Polygon;
  /** A source of magical darkness: nothing within `dim` is lit, by it or by a light that does not outrank it. */
  darkness?: boolean;
  /** Which of a light and a darkness that meet wins: the higher one, the darkness when equal. Unset is 0. */
  priority?: number;
  /** A light that shines one way: `polygon` is cut to it. */
  cone?: VisionCone;
}

/** What a reach is besides its radii. */
export type LightReachKind = Pick<LightReach, 'darkness' | 'priority' | 'cone'>;

/**
 * Every token with vision on, with its ranges converted to world pixels. A blinded token keeps
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
): SightSource[] {
  const unlimited = Math.hypot(bounds.width, bounds.height);
  const sources: SightSource[] = [];
  for (const token of Object.values(tokens)) {
    if (!token.vision?.enabled) continue;
    const origin = { x: token.x, y: token.y };
    const how = rules.visionOf?.(token) ?? { senses: tokenSenses(token.vision, rules.definitions), ...(token.vision.range !== undefined && { sightRange: token.vision.range }) };
    if (how.pending) {
      sources.push({ tokenId: token.id, origin, range: 0, senses: [] });
      continue;
    }
    const range = how.sightRange;
    const cone = visionCone(token.rotation, token.vision.angle, computeTokenPixelSize(scale.cellSize, token.size || 1) / 2);
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
  private readonly entries = new Map<string, CachedSight>();

  get(source: SightSource, walls: readonly WallSegment[]): SightRegion[] {
    const cached = this.entries.get(source.tokenId);
    if (cached && cached.walls === walls && sameSource(cached.source, source)) return cached.regions;
    const regions = regionsOf(source, walls);
    this.entries.set(source.tokenId, { source, walls, regions });
    return regions;
  }

  /** Drops tokens that no longer see. */
  retain(tokenIds: ReadonlySet<string>): void {
    for (const id of this.entries.keys()) if (!tokenIds.has(id)) this.entries.delete(id);
  }
}

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
 * with the same cone share one polygon.
 */
function regionsOf(source: SightSource, walls: readonly WallSegment[]): SightRegion[] {
  const { tokenId, origin, cone } = source;
  const polygons = new Map<string, Polygon>();
  const polygonOf = (radius: number, eyes: boolean): Polygon => {
    const key = `${radius}|${eyes}`;
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

/** The scene's sight: that of its vision tokens, or everything while the scene has token vision off. */
export function sceneSight(
  lighting: Pick<SceneLighting, 'tokenVision'>,
  sources: readonly SightSource[],
  walls: readonly WallSegment[],
  cache?: SightCache,
): Sight {
  return tokenVisionOn(lighting) ? computeSight(sources, walls, cache) : SEES_ALL;
}

export function computeSight(sources: readonly SightSource[], walls: readonly WallSegment[], cache: SightCache = new SightCache()): Sight {
  if (sources.length === 0) return SEES_ALL;
  cache.retain(new Set(sources.map((source) => source.tokenId)));
  return { all: false, regions: sources.flatMap((source) => cache.get(source, walls)) };
}

/**
 * Where a light at `origin` reaches: its `dim` radius clipped by the `walls` that block light and, for a light that
 * shines one way, by its cone (with its own space around it). Without `bright` it has no bright part.
 */
export function lightReach(origin: Point, dim: number, walls: readonly WallSegment[], bright = 0, kind: LightReachKind = {}): LightReach {
  return { origin, bright, dim, polygon: computeVisibility(origin, dim, walls, kind.cone, 'light'), ...kindOf(kind) };
}

/** The fields of `kind` that say something: a light without them is stored as it always was. */
export function kindOf({ darkness, priority, cone }: LightReachKind): LightReachKind {
  return { ...(darkness && { darkness }), ...(priority !== undefined && priority !== 0 && { priority }), ...(cone && { cone }) };
}

/**
 * Changes to what tokens see or what explored memory records, for which the scene is rebuilt:
 * the options, and the ambient light crossing a threshold (choosing "Day" records at once).
 */
export function sightOptionsChanged(a: SceneLighting, b: SceneLighting): boolean {
  return a.tokenVision !== b.tokenVision || a.exploredMemory !== b.exploredMemory || a.litThreshold !== b.litThreshold
    || a.brightThreshold !== b.brightThreshold || ambientLevel(a) !== ambientLevel(b);
}
