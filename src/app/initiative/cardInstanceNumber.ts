import type { TokenEntity } from '../types';
import { resolveLevel, type SceneLevels } from '../levels/sceneLevels';

/**
 * The number on a GM's card, the number its token's badge shows on the map (`drawInstanceBadge`):
 * the token's instance number (1 where it has none) while badges are on and two or more tokens on
 * its level (`levels`, unset for a scene of one level) share its art; else none.
 */
export function cardInstanceNumber(tokens: Readonly<Record<string, TokenEntity>>, tokenId: string, badgesOn: boolean, levels?: SceneLevels): number | null {
  const token = tokens[tokenId];
  if (!badgesOn || !token) return null;
  const level = resolveLevel(levels, token.level);
  let sameArt = 0;
  for (const other of Object.values(tokens)) if (other.imagePath === token.imagePath && resolveLevel(levels, other.level) === level) sameArt++;
  return sameArt >= 2 ? token.instanceNumber ?? 1 : null;
}
