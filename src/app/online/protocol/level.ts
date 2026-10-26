/**
 * What this GM side can serve a player page. Raise it, with a line below, whenever the GM learns
 * something a player page will rely on; the relay's minimum may then follow, once an Atlas with the
 * new level is published.
 *
 * 1: everything up to the campaign players' codes (2026-10-18).
 * 2: rest requests from a player character's recovery buttons (`book-rest`, `book-rest-answer`) and the `rest` log entry (2026-10-20).
 * 3: rest steps: actions picked in a rest, for oneself or another character (2026-10-20).
 * 4: entries added to or taken out of a character's list values (`book-list`: words, labels with values) (2026-10-21).
 * 5: a player's formula may name its numbers (`+4+3[Str mod]`, a bonus too), as a value's `@` references fill it in (2026-10-22).
 * 6: a player's roll may ask for advantage or disadvantage (`advantage`), rolled by the GM's dice set rules; the scene's rules and a player's tokens name the dice it rolls with (`dice`) (2026-10-22).
 * 7: a player sets the maximum of their character's resources, tracked numbers and Counters rows (`book-resource` with `max`, `SheetResource.maxEditable`) (2026-10-22).
 */
export const GM_LEVEL = 7;

/** The level of a GM that names none: one from before levels, which serves level 1. */
export const UNNAMED_GM_LEVEL = 1;

const MAX_LEVEL = 10_000;

/** A level as sent: a whole number from 0 to 10,000; anything else is 0. */
export function readLevel(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_LEVEL ? value : 0;
}

/** The level a frame names in `field`, or that of a GM that names none. */
export function levelIn(value: Readonly<Record<string, unknown>>, field: string): number {
  return value[field] === undefined ? UNNAMED_GM_LEVEL : readLevel(value[field]);
}
