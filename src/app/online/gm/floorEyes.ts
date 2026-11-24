import { levelObjects } from '../../levels/levelObjects';
import { tokenVisionOn } from '../../lighting/sceneLightingOptions';
import { mapTokens } from '../../tokens/offMap';
import type { TokenEntity } from '../../types';
import type { SightRules } from '../../vision/sightRules';
import { PLAYER_SIGHT_POLICY, sightPolicyFor } from '../../vision/tokenSightPolicy';
import { isLit } from './atlasLighting.ts';
import type { SceneState } from './atlasView.ts';

/** Whose sight a player sees a floor through: the whole party's, or only that of `tokens`, their own characters there that see. */
export type Eyes = { readonly kind: 'party' } | { readonly kind: 'player'; readonly player: string; readonly tokens: readonly string[] };

export const PARTY_EYES: Eyes = Object.freeze({ kind: 'party' });

/** The key of a set of eyes among a floor's pictures. */
export const eyesKey = (eyes: Eyes): string => (eyes.kind === 'party' ? '' : `player:${eyes.player}`);

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
 * Whose sight each of `players` sees the floor through. Without Shared vision, a player with a token of
 * their own on the floor that gives sight (`sightPolicyFor`: not hidden, not defeated, vision on) sees
 * through those alone; every other player (none there, or none that sees: a spectator, a fallen
 * character) sees the party's picture. Sight decides nothing in an unlit scene or one without token
 * vision, so all of its players share the party's picture.
 */
export function floorEyes(inputs: EyesInputs, players: readonly string[]): Map<string, Eyes> {
  const { state } = inputs;
  if (inputs.sharedVision || !isLit(state) || !tokenVisionOn(state.lighting)) return new Map(players.map((player) => [player, PARTY_EYES]));
  const { givesSight } = sightPolicyFor(PLAYER_SIGHT_POLICY, inputs.rules);
  const seeing = new Map<string, string[]>();
  for (const [id, token] of Object.entries(mapTokens(levelObjects(state)))) {
    const owner = givesSight(token) ? inputs.ownerOf(id, token) : undefined;
    if (owner !== undefined) seeing.set(owner, [...(seeing.get(owner) ?? []), id]);
  }
  return new Map(players.map((player) => {
    const tokens = seeing.get(player);
    return [player, tokens === undefined ? PARTY_EYES : { kind: 'player', player, tokens }];
  }));
}
