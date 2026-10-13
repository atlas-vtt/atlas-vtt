import type { UnitScale } from '../../src/app/lighting/lightingUnits';
import type { TokenEntity } from '../../src/app/types';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { SightRules } from '../../src/app/vision/sightRules';
import type { MapBounds } from '../../src/app/vision/visibility';
import { seenSpots as frozenSeenSpots, type PerceptionOptions, type SeenSpot } from '../oracles/sightPolicyBaseline/perception';
import { PerceptionMemo, tokenPerception, type TokenPerception } from '../oracles/sightPolicyBaseline/playerLightingLayers';
import { SceneModelBuilder, SceneSpots, type SceneModel } from '../oracles/sightPolicyBaseline/sceneModel';
import { NO_SIGHT, SEES_ALL, SightCache, sightSources, type AmbientLight, type LightReach, type Sight, type SightSource } from '../oracles/sightPolicyBaseline/sight';
import { tableSight } from '../oracles/sightPolicyBaseline/tableSight';
import { gmSightSource } from '../oracles/sightPolicyBaseline/tokenSightPolicy';

/** The sight rules as they were before this change: frozen copies, called the way each picture called them. */

export type Picture = 'players' | 'GM';
export type Model = SceneModel;
export type Update = SceneModelBuilder['update'];
export type Spots = Pick<SceneSpots, 'update'>;

export const none: Sight = NO_SIGHT;
export const all: Sight = SEES_ALL;
export { SightCache };

export function builder(): SceneModelBuilder {
  return new SceneModelBuilder();
}

export function sources(tokens: Record<string, TokenEntity>, scale: UnitScale, bounds: MapBounds, rules: SightRules, picture: Picture): SightSource[] {
  return sightSources(tokens, scale, bounds, rules, picture === 'GM' ? gmSightSource : undefined);
}

export function select(sight: Sight, tokens: Record<string, TokenEntity>): Sight {
  return tableSight(sight, tokens);
}

/** Both pictures' footprints came from one rule before: the players'. */
export function spots(): Spots {
  return new SceneSpots();
}

export function seenSpots(sight: Sight, ambient: AmbientLight, lights: readonly LightReach[], tokens: Record<string, TokenEntity>, cellSize: number, walls: readonly WallSegment[], options: PerceptionOptions): SeenSpot[] {
  return frozenSeenSpots(sight, ambient, lights, tokens, cellSize, walls, options);
}

export function perception(sight: Sight, ambient: AmbientLight, lights: readonly LightReach[], tokens: Record<string, TokenEntity>, options: PerceptionOptions, memo?: PerceptionMemo): TokenPerception {
  return tokenPerception(sight, ambient, lights, tokens, options, memo);
}

export function memo(): PerceptionMemo {
  return new PerceptionMemo();
}
