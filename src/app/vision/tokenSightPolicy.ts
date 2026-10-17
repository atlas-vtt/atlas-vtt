import type { TokenEntity } from '../types';
import type { TokenVision } from '../types/lightingTypes';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import { GENERIC_SIGHT_RULES, tokenEffects } from './sightRules';

/** How one picture of the scene treats tokens. The rule functions read these two decisions from here and make none of their own. */
export interface SightPolicy {
  /** The token is a candidate sight source. Conditions can still suppress its senses. False without vision on. */
  readonly givesSight: (token: TokenEntity) => boolean;
  /**
   * The picture shows the living token wherever it stands, whatever the light, and within its
   * footprint where the map around it is dark; a token the pointer holds while sight waits for the drop shows,
   * footprint included, only within the sight that stayed behind. Asked of tokens with and without vision;
   * never true for a hidden token.
   */
  readonly alwaysSeen: (token: TokenEntity, conditions?: readonly ConditionDefinition[]) => boolean;
}

/**
 * The token has vision switched on: only such a token can give sight. Only `sightSources` and `selectSight`
 * ask it (a lint rule holds that); every other rule asks the picture's `SightPolicy`.
 */
export function visionOn(token: TokenEntity): token is TokenEntity & { vision: TokenVision } {
  return !!token.vision?.enabled;
}

function playersSource(token: TokenEntity): boolean {
  return !token.isHidden && visionOn(token);
}

function playersVisible(token: TokenEntity, conditions = GENERIC_SIGHT_RULES.conditions): boolean {
  return playersSource(token) && !tokenEffects(token, conditions).has('no-vision');
}

/** The players' picture: nonhidden vision tokens can see; living ones are always shown. */
export const PLAYER_SIGHT_POLICY: SightPolicy = Object.freeze({ givesSight: playersSource, alwaysSeen: playersVisible });

/**
 * The GM's shading and range rings: hidden vision tokens see too. Footprints are the players' (a hidden token never
 * has one), and must stay so: while both pictures have the same sight the GM's view draws the players' footprints.
 */
export const GM_SIGHT_POLICY: SightPolicy = Object.freeze({ givesSight: visionOn, alwaysSeen: playersVisible });
