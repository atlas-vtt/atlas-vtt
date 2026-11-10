import { GM_MARKS } from './marks.ts';

/** Obsidian's colour variables a player's colour is one of, in the order of `playerTone`. */
export const PLAYER_COLOURS = ['--color-red', '--color-orange', '--color-yellow', '--color-green', '--color-cyan', '--color-blue', '--color-purple', '--color-pink'] as const;

/** The GM's colour: the accent. */
const GM_COLOUR = '--interactive-accent';

/**
 * Which of `PLAYER_COLOURS` a player has: a sum over the characters of the player's id, so it never
 * changes and everyone at the table works out the same one.
 */
export function playerTone(id: string): number {
  let sum = 0;
  for (const char of id) sum = (sum * 31 + char.charCodeAt(0)) % 9973;
  return sum % PLAYER_COLOURS.length;
}

/** The CSS variable that holds the colour of a player, or of the GM (`'gm'`). */
export function playerColourVariable(who: string): string {
  return who === GM_MARKS ? GM_COLOUR : (PLAYER_COLOURS[playerTone(who)] ?? GM_COLOUR);
}
