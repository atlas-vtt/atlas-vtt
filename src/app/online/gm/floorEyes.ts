import { everyLevelObjects, levelObjects } from '../../levels/levelObjects';
import { tokenVisionOn } from '../../lighting/sceneLightingOptions';
import { mapTokens } from '../../tokens/offMap';
import type { TokenEntity } from '../../types';
import type { SightRules } from '../../vision/sightRules';
import { PLAYER_SIGHT_POLICY, sceneHasVision, sightPolicyFor } from '../../vision/tokenSightPolicy';
import { isLit } from './atlasLighting.ts';
import type { SceneState } from './atlasView.ts';

/**
 * Whose sight a player sees a floor through: the whole party's, or only that of `tokens`, their own characters
 * there that see. A player whose `tokens` are none sees nothing live, as Foundry shows a user without a vision
 * source nothing: only what they remember.
 */
export type Eyes = { readonly kind: 'party' } | { readonly kind: 'player'; readonly player: string; readonly tokens: readonly string[] };

export const PARTY_EYES: Eyes = Object.freeze({ kind: 'party' });

/** The key of a player's own eyes among a floor's pictures. */
export const playerEyesKey = (player: string): string => `player:${player}`;

/** The key of a set of eyes among a floor's pictures. */
export const eyesKey = (eyes: Eyes): string => (eyes.kind === 'party' ? '' : playerEyesKey(eyes.player));

export interface EyesInputs {
  /** The floor's state: the shared scene with this floor shown. */
  readonly state: SceneState;
  /** Whether every player sees through every player character's sight (the GM's Shared vision). */
  readonly sharedVision: boolean;
  /** The map's sight rules, which tell a defeated token; undefined while they cannot be read. */
  readonly rules: SightRules | undefined;
  ownerOf(tokenId: string, token: TokenEntity): string | undefined;
}

/**
 * Whose sight each of `players` sees the floor through. Without Shared vision every player sees through their
 * own tokens on the floor that give sight (`sightPolicyFor`: not hidden, not defeated, vision on), and one
 * with none there (a spectator, a fallen character) through none. Sight hides nothing in an unlit scene, one
 * without token vision or one where no token has vision at all, so all of its players share the party's picture.
 */
export function floorEyes(inputs: EyesInputs, players: readonly string[]): Map<string, Eyes> {
  const { state } = inputs;
  const hides = isLit(state) && tokenVisionOn(state.lighting) && sceneHasVision(mapTokens(everyLevelObjects(state)));
  if (inputs.sharedVision || !hides) return new Map(players.map((player) => [player, PARTY_EYES]));
  const { givesSight } = sightPolicyFor(PLAYER_SIGHT_POLICY, inputs.rules);
  const seeing = new Map<string, string[]>();
  for (const [id, token] of Object.entries(mapTokens(levelObjects(state)))) {
    const owner = givesSight(token) ? inputs.ownerOf(id, token) : undefined;
    if (owner !== undefined) seeing.set(owner, [...(seeing.get(owner) ?? []), id]);
  }
  return new Map(players.map((player) => [player, { kind: 'player', player, tokens: seeing.get(player) ?? [] }]));
}
