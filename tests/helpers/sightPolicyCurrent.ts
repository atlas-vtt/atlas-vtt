import type { UnitScale } from '../../src/app/lighting/lightingUnits';
import { SceneModelBuilder, SceneSpots } from '../../src/app/pixi/lighting/sceneModel';
import type { TokenEntity } from '../../src/app/types';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { seenSpots, type PerceptionOptions, type SeenSpot } from '../../src/app/vision/perception';
import { NO_SIGHT, SEES_ALL, SightCache, sightSources, type AmbientLight, type LightReach, type Sight, type SightSource } from '../../src/app/vision/sight';
import type { SightRules } from '../../src/app/vision/sightRules';
import { selectSight } from '../../src/app/vision/selectSight';
import { GM_SIGHT_POLICY, PLAYER_SIGHT_POLICY, type SightPolicy } from '../../src/app/vision/tokenSightPolicy';
import { PerceptionMemo, tokenPerception, type TokenPerception } from '../../src/app/vision/tokenPerception';
import type { MapBounds } from '../../src/app/vision/visibility';

export type Picture = 'players' | 'GM';

const POLICIES: Record<Picture, SightPolicy> = { players: PLAYER_SIGHT_POLICY, GM: GM_SIGHT_POLICY };

/**
 * The sight rules under test, called the way each picture calls them. The comparison and the
 * controls reach the code only through here, so a module swapped in by a control is the one called.
 */
export const current = {
  none: NO_SIGHT,
  all: SEES_ALL,
  SightCache,
  builder: (): SceneModelBuilder => new SceneModelBuilder(),
  /** The players' picture calls with the default. */
  sources: (tokens: Record<string, TokenEntity>, scale: UnitScale, bounds: MapBounds, rules: SightRules, picture: Picture): SightSource[] =>
    sightSources(tokens, scale, bounds, rules, picture === 'GM' ? GM_SIGHT_POLICY : undefined),
  select: (sight: Sight, tokens: Record<string, TokenEntity>): Sight => selectSight(sight, tokens, PLAYER_SIGHT_POLICY),
  /** The players' footprints are made with the default, the GM's as the lighting renderer makes them. */
  spots: (picture: Picture): SceneSpots => (picture === 'GM' ? new SceneSpots(GM_SIGHT_POLICY) : new SceneSpots()),
  seenSpots: (sight: Sight, ambient: AmbientLight, lights: readonly LightReach[], tokens: Record<string, TokenEntity>, cellSize: number, walls: readonly WallSegment[], options: PerceptionOptions, picture: Picture): SeenSpot[] =>
    seenSpots(sight, ambient, lights, tokens, cellSize, walls, { ...options, policy: POLICIES[picture] }),
  /** Without a picture the options are passed as the caller gave them. */
  perception: (sight: Sight, ambient: AmbientLight, lights: readonly LightReach[], tokens: Record<string, TokenEntity>, options: PerceptionOptions, picture?: Picture, memo?: PerceptionMemo): TokenPerception =>
    tokenPerception(sight, ambient, lights, tokens, picture ? { ...options, policy: POLICIES[picture] } : options, memo),
  memo: (): PerceptionMemo => new PerceptionMemo(),
};
