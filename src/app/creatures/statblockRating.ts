/**
 * The rating a statblock states (challenge rating, tier, level), as tokens
 * and lists label a creature by it. A native template's `rating` field comes
 * first, so a template that rates by another key ("threat", "hit_dice") is
 * read too; then the keys Fantasy Statblocks' layouts share.
 */

import { labelFromKey } from '../statblocks/model/fieldKeys';
import type { FieldMeanings } from '../statblocks/resolve/fieldMeanings';

type StatblockFields = Readonly<Record<string, unknown>>;

export interface StatblockRating {
  /** The field it was read from. */
  key: string;
  value: string;
}

/** A statblock scalar usable as text; YAML may hold a rating or a name as a number. */
export function scalarText(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * The name a statblock goes by where it is shown (its card's header, a token's
 * nameplate, a list): the field its template means as the display name where
 * it holds one (Cairn's `title`, "Aranea"), else `name`, which stays what
 * identifies it ("Aranea (Cairn)"). Null where it names nothing.
 */
export function statblockDisplayName(fields: StatblockFields, meanings: FieldMeanings): string | null {
  const meant = meanings['display-name'];
  return (meant === undefined ? null : scalarText(fields[meant])) ?? scalarText(fields.name);
}

/** The field the template means as the rating, else the first of `keys` that holds a value; null without one. */
export function statblockRating(fields: StatblockFields, meanings: FieldMeanings, keys: readonly string[]): StatblockRating | null {
  const meant = meanings.rating;
  for (const key of meant === undefined ? keys : [meant, ...keys]) {
    const value = scalarText(fields[key]);
    if (value !== null) return { key, value };
  }
  return null;
}

/** A rating under its field's name, with `short` names for the conventional keys ("CR", "T"). */
export function ratingText({ key, value }: StatblockRating, short: Readonly<Record<string, string>>): string {
  return `${short[key] ?? `${labelFromKey(key)} `}${value}`;
}

const DIFFICULTY_NAMES: Readonly<Record<string, string>> = { cr: 'CR ', tier: 'T' };

/** What a linked token records as its difficulty: "CR 5", "T2", "Level 3", else the statblock's own `difficulty`. */
export function difficultyLabel(fields: StatblockFields, meanings: FieldMeanings): string | undefined {
  const rating = statblockRating(fields, meanings, ['cr', 'tier']);
  return rating ? ratingText(rating, DIFFICULTY_NAMES) : scalarText(fields.difficulty) ?? undefined;
}
