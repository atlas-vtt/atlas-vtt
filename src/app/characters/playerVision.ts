import type { TokenEntity } from '../types';
import type { TokenVision } from '../types/lightingTypes';

/**
 * The vision a token takes when it becomes a player's: placed as a player character, made one,
 * moved to the players' side or given to a player. Its own vision, switched on; undefined when it
 * already sees. Vision is switched on only at that moment and never off, so a GM who switches it off
 * afterwards keeps it off, and a scene that loads changes nothing.
 */
export function playerVision(vision: TokenVision | undefined): TokenVision | undefined {
  return vision?.enabled === true ? undefined : { ...vision, enabled: true };
}

/** For `updateTokens`: the tokens among `ids` that do not see yet, each with its vision switched on. */
export function playerVisionChanges(
  tokens: Readonly<Record<string, TokenEntity>>,
  ids: readonly string[],
): Array<{ id: string; changes: { vision: TokenVision } }> {
  return ids.flatMap((id) => {
    const vision = tokens[id] ? playerVision(tokens[id].vision) : undefined;
    return vision ? [{ id, changes: { vision } }] : [];
  });
}
