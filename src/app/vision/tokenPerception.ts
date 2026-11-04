import type { TokenEntity } from '../types';
import { movedWhileHeld } from '../lighting/sightOnDrop';
import { lightLevelAt } from './lightLevels';
import { perceive, targetOf, withinReach, type Perception, type PerceptionOptions } from './perception';
import type { AmbientLight, LightReach, Sight } from './sight';
import { tokenEffects } from './sightRules';
import { PLAYER_SIGHT_POLICY } from './tokenSightPolicy';

/** How the players perceive each token. */
export type TokenPerception = (tokenId: string) => Perception;

/**
 * How the vision tokens perceive each token, by its centre, the light there and its conditions.
 * A token the policy always shows (`options.policy`, unset the players': a nonhidden token with vision)
 * is shown whatever its conditions and the light: the players' window is one shared screen, and they
 * are the party. `tokens` is the record the positions are read from, so a caller may pass tokens at
 * other places than the store's.
 *
 * A token the policy always shows that is dragged while sight waits for the drop (`held`: `heldForSight`)
 * shows only where the sight that stayed behind still reaches, by any sense, lit or not. Beyond
 * it the players' picture is dark or remembered, and the token goes with its nameplate, bars
 * and conditions rather than leaving them over the darkness.
 */
// The `held` rule is sight on drop's and must survive a rework of this function: without it a
// dragged vision token's nameplate and bars stand over the darkness that covers its sprite.
export function tokenPerception(
  sight: Sight,
  ambient: AmbientLight,
  lights: readonly LightReach[],
  tokens: Record<string, TokenEntity>,
  options: PerceptionOptions = {},
  memo?: PerceptionMemo,
): TokenPerception {
  const { conditions = [], held = {}, policy = PLAYER_SIGHT_POLICY } = options;
  // Every consumer of a frame asks about every token: each is worked out once, and with a memo once for all frames.
  const known = memo?.of(sight, ambient, lights, options) ?? new WeakMap<TokenEntity, Perception>();
  const perceived = (token: TokenEntity): Perception => {
    const at = { x: token.x, y: token.y };
    if (token.isHidden) return 'unseen';
    if (policy.alwaysSeen(token)) return !movedWhileHeld(token, held) || withinReach(at, sight) ? 'seen' : 'unseen';
    return perceive(at, sight, () => lightLevelAt(at, ambient, lights), targetOf(tokenEffects(token, conditions)));
  };
  return (tokenId) => {
    const token = tokens[tokenId];
    if (!token) return 'unseen';
    let perception = known.get(token);
    if (!perception) known.set(token, perception = perceived(token));
    return perception;
  };
}

/**
 * What `tokenPerception` worked out, kept from one call to the next while the sight, the light,
 * the conditions, the held tokens and the policy are the same objects (no policy is the players'):
 * a mirrored frame then looks every token up. Each answer is kept by its token, and the store hands
 * out a new token whenever one changes, so only a changed token is worked out again.
 */
export class PerceptionMemo {
  private inputs: readonly unknown[] = [];
  private known = new WeakMap<TokenEntity, Perception>();

  of(sight: Sight, ambient: AmbientLight, lights: readonly LightReach[], { conditions, held, policy }: PerceptionOptions): WeakMap<TokenEntity, Perception> {
    const inputs = [sight, ambient, lights, conditions, held, policy ?? PLAYER_SIGHT_POLICY];
    if (inputs.some((input, i) => input !== this.inputs[i])) {
      this.inputs = inputs;
      this.known = new WeakMap();
    }
    return this.known;
  }
}
