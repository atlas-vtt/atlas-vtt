import type { TokenEntity } from '../types';
import type { TokenVision } from '../types/lightingTypes';

/** How one picture of the scene treats tokens. The rule functions read these two decisions from here and make none of their own. */
export interface SightPolicy {
  /** The token's senses count for the picture. False for a token without vision on. */
  readonly givesSight: (token: TokenEntity) => boolean;
  /**
   * The picture shows the token wherever it stands, whatever its conditions and the light, and within its
   * footprint where the map around it is dark; a token the pointer holds while sight waits for the drop shows,
   * footprint included, only within the sight that stayed behind. Asked of tokens with and without vision;
   * never true for a hidden token.
   */
  readonly alwaysSeen: (token: TokenEntity) => boolean;
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

/** The players' picture: every vision token that is not hidden sees and is always shown. */
export const PLAYER_SIGHT_POLICY: SightPolicy = Object.freeze({ givesSight: playersSource, alwaysSeen: playersSource });

/**
 * The GM's shading and range rings: hidden vision tokens see too. Footprints are the players' (a hidden token never
 * has one), and must stay so: while both pictures have the same sight the GM's view draws the players' footprints.
 */
export const GM_SIGHT_POLICY: SightPolicy = Object.freeze({ givesSight: visionOn, alwaysSeen: playersSource });

const sceneVision = new WeakMap<Readonly<Record<string, TokenEntity>>, boolean>();

/**
 * Whether a token of the scene, on any of its levels, has vision switched on, hidden or not: pass every level's
 * tokens (`everyLevelObjects`). A scene where none has sees everything (with token vision on); a level shown
 * without such a token while the scene has one elsewhere sees nothing, or presenting a floor the party is not on
 * would show players all of it. Kept per record, so a store write that leaves the tokens asks nothing anew.
 */
export function sceneHasVision(tokens: Readonly<Record<string, TokenEntity>>): boolean {
  let has = sceneVision.get(tokens);
  if (has === undefined) sceneVision.set(tokens, has = Object.values(tokens).some(visionOn));
  return has;
}
