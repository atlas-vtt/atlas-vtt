import type { InitiativeEntry } from '../types/initiativeTypes';

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/** The colour the GM gave a combatant's card, as `#rrggbb`; null for none or one a hand edit broke. */
export function combatantColor(entry: Pick<InitiativeEntry, 'color'>): string | null {
  return typeof entry.color === 'string' && HEX_COLOUR.test(entry.color) ? entry.color : null;
}

/**
 * The colour a combatant's turn flashes in, on the players' list and in the turn banner: its
 * card's colour, else its token's ring colour; null for the accent.
 */
export function turnColor(entry: Pick<InitiativeEntry, 'color'>, token: { readonly ringColor?: string | undefined } | undefined): string | null {
  return combatantColor(entry) ?? (token?.ringColor || null);
}
