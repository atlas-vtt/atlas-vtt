import type { CardToken } from './useNoteTokens';

const base = (path: string): string => (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '');

/**
 * A second line for tokens that share a name (three "Aboleth" tiles): the
 * statblock each is linked to, else its art's file name, so they tell apart.
 * Tokens with a name of their own get none.
 */
export function tokenDetails(tokens: readonly CardToken[]): ReadonlyMap<string, string> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token.name, (counts.get(token.name) ?? 0) + 1);
  const details = new Map<string, string>();
  for (const token of tokens) {
    if ((counts.get(token.name) ?? 0) < 2) continue;
    const detail = token.statblockPath ? `on ${base(token.statblockPath)}` : token.imagePath ? base(token.imagePath) : '';
    if (detail) details.set(token.id, detail);
  }
  return details;
}
