import type { TokenVision } from '../types/lightingTypes';

/**
 * The vision a token takes when it becomes a player's: placed as a player character,
 * moved to the players' side or given to a player. Its own vision, switched on; undefined when it
 * already sees. Vision is switched on only at that moment and never off, so a GM who switches it off
 * afterwards keeps it off, and a scene that loads changes nothing.
 */
export function playerVision(vision: TokenVision | undefined): TokenVision | undefined {
  return vision?.enabled === true ? undefined : { ...vision, enabled: true };
}
