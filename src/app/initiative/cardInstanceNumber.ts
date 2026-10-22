import type { TokenEntity } from '../types';

/**
 * The number on a GM's card, the number its token's badge shows on the map (`drawInstanceBadge`):
 * the token's instance number (1 where it has none) while badges are on and two or more tokens
 * share its art; else none.
 */
export function cardInstanceNumber(tokens: Readonly<Record<string, TokenEntity>>, tokenId: string, badgesOn: boolean): number | null {
  const token = tokens[tokenId];
  if (!badgesOn || !token) return null;
  let sameArt = 0;
  for (const other of Object.values(tokens)) if (other.imagePath === token.imagePath) sameArt++;
  return sameArt >= 2 ? token.instanceNumber ?? 1 : null;
}
