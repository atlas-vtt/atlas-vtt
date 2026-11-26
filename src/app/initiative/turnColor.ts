/**
 * The colour a combatant's turn flashes in, on the players' list and in the turn banner: its token's ring colour; null
 * for the accent (a combatant without a token, or a ring without a colour of its own).
 */
export function turnColor(token: { readonly ringColor?: string | undefined } | undefined): string | null {
  return token?.ringColor || null;
}
