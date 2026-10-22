/** How the protocol names and spells a player: their id, their name and the codes people say aloud. */

/** The longest player name, in characters. */
export const MAX_PLAYER_NAME = 32;
/** A player id: 96 random bits in lowercase base32 (20 characters). */
export const PLAYER_ID_PATTERN = /^[a-z2-7]{20}$/;
/** A join code: six digits, which the GM hands out apart from the link. */
export const JOIN_CODE_PATTERN = /^\d{6}$/;
/** A join code as people read and say it: `483 912`. */
export const shownJoinCode = (code: string): string => `${code.slice(0, 3)} ${code.slice(3)}`;

/**
 * Characters a name never keeps: controls, line and paragraph separators, the marks and overrides
 * that set a text's direction (the Arabic letter mark among them), and letters that show as nothing
 * (the Hangul fillers, the blank Braille pattern). A name stands in other people's sentences ("Mira
 * wants to join"), where it must neither reorder the words around it nor stand there as a gap.
 */
export const UNSHOWN = /[\p{Cc}\p{Zl}\p{Zp}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u115f\u1160\u3164\uffa0\u2800]/gu;
/** Zero-width characters no name needs: the zero-width space, the word joiner, the byte order mark, the soft hyphen, the Mongolian vowel separator. The joiners scripts and emoji are written with stay. */
export const UNSEEN = /[\u00ad\u180e\u200b\u2060\ufeff]/gu;
/** Something of a name that shows: a letter, a digit, a mark of punctuation or a symbol. */
export const SHOWN = /[\p{L}\p{N}\p{P}\p{S}]/u;

/**
 * A player name as shown: unshown characters removed, white space collapsed; null when nothing that
 * shows or too much is left.
 */
export function playerName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_PLAYER_NAME * 4) return null;
  const name = value.replace(UNSHOWN, ' ').replace(UNSEEN, '').replace(/\s+/g, ' ').trim();
  return SHOWN.test(name) && [...name].length <= MAX_PLAYER_NAME ? name : null;
}
