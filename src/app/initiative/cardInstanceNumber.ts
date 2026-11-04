import type { TokenEntity } from '../types';
import { resolveLevel, type SceneLevels } from '../levels/sceneLevels';

type NumberedToken = Pick<TokenEntity, 'imagePath' | 'instanceNumber' | 'level'>;

/**
 * The number each token's badge shows on the GM's map (`drawInstanceBadge`), by token id: its
 * instance number (1 where it has none) while badges are on and two or more tokens on its level
 * (`levels`, unset for a scene of one level) share its art. Tokens without a badge are not listed.
 * Every screen shows these numbers, the players' too, so a token keeps one number everywhere.
 */
export function instanceBadgeNumbers(tokens: Readonly<Record<string, NumberedToken>>, badgesOn: boolean, levels?: SceneLevels): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>();
  if (!badgesOn) return numbers;
  const counts = new Map<string | null, Map<string, number>>();
  const countOf = (token: NumberedToken): Map<string, number> => {
    const level = resolveLevel(levels, token.level);
    let byArt = counts.get(level);
    if (!byArt) counts.set(level, (byArt = new Map<string, number>()));
    return byArt;
  };
  for (const token of Object.values(tokens)) {
    const byArt = countOf(token);
    byArt.set(token.imagePath, (byArt.get(token.imagePath) ?? 0) + 1);
  }
  for (const [id, token] of Object.entries(tokens)) {
    if ((countOf(token).get(token.imagePath) ?? 0) >= 2) numbers.set(id, token.instanceNumber ?? 1);
  }
  return numbers;
}

/** The number on a GM's card, the number its token's badge shows on the map (`instanceBadgeNumbers`); none without a badge. */
export function cardInstanceNumber(tokens: Readonly<Record<string, TokenEntity>>, tokenId: string, badgesOn: boolean, levels?: SceneLevels): number | null {
  if (!tokens[tokenId]) return null;
  return instanceBadgeNumbers(tokens, badgesOn, levels).get(tokenId) ?? null;
}
