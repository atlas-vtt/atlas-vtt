import { ratingText, scalarText, statblockDisplayName, statblockRating, type StatblockRating } from '../../../../creatures/statblockRating';
import type { FantasyStatblocksCreature } from '../../../../services/FantasyStatblocksService';
import { NO_MEANINGS, type FieldMeanings } from '../../../../statblocks/resolve/fieldMeanings';
import { t } from '../../../../i18n';
import { valueText } from '../../../../creatures/statblockValues';

type StatblockFields = Readonly<Record<string, unknown>>;

/** A note-backed creature a token can link to. */
export interface StatblockEntry {
  path: string;
  name: string;
  /** What the creature is, e.g. "Huge Dragon · CR 16", or the note's folder when its statblock does not say. */
  detail: string;
}

const RATING_KEYS = { cr: 'am.rating.cr', tier: 'am.rating.tier', level: 'am.rating.level' } as const;

/** "CR 16", "Tier 1", "Level 3"; another rating field under its own name. */
function ratingLabel(rating: StatblockRating): string {
  const key = Object.hasOwn(RATING_KEYS, rating.key) ? RATING_KEYS[rating.key as keyof typeof RATING_KEYS] : null;
  return key ? t(key, { value: rating.value }) : ratingText(rating, {});
}

/** The value of the field the template gives `meaning`, else of the conventional key, as text. */
function meantText(fields: StatblockFields, meant: string | undefined, conventional: string): string | null {
  return (meant === undefined ? null : scalarText(fields[meant])) ?? scalarText(fields[conventional]);
}

/**
 * The creature's kind and rating as its system notes them: "Huge Dragon · CR 16", "Solo · Tier 1".
 * A native template's size, creature type and rating fields are read before the conventional keys.
 */
export function describeCreature(fields: StatblockFields, meanings: FieldMeanings = NO_MEANINGS): string {
  const kind = [meantText(fields, meanings.size, 'size'), meantText(fields, meanings['creature-type'], 'type')].filter(Boolean).join(' ');
  const rating = statblockRating(fields, meanings, ['cr', 'tier', 'level']);
  return [kind, rating ? ratingLabel(rating) : ''].filter(Boolean).join(' · ');
}

/** The folder a note lives in, `/` for the vault root. */
export function noteFolder(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash > 0 ? path.slice(0, slash) : '/';
}

/** The entry of one statblock note, named after `fallbackName` where its statblock names nothing. */
export function statblockEntry(path: string, fields: StatblockFields, meanings: FieldMeanings, fallbackName: string): StatblockEntry {
  return { path, name: statblockDisplayName(fields, meanings) ?? fallbackName, detail: describeCreature(fields, meanings) || noteFolder(path) };
}

/** Entries sorted by name. */
export function sortedEntries(entries: Iterable<StatblockEntry>): StatblockEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

/** Only note-backed creatures can be linked (the link is a note path), sorted by name. */
export function statblockEntries(creatures: readonly FantasyStatblocksCreature[]): StatblockEntry[] {
  return sortedEntries(creatures
    .filter((creature): creature is FantasyStatblocksCreature & { path: string } => typeof creature.path === 'string' && creature.path !== '')
    // The bestiary's own entries come as Fantasy Statblocks parsed them: a name may be a number
    .map((creature) => statblockEntry(creature.path, creature, NO_MEANINGS, valueText(creature.name, { joiner: ', ', parens: false })))
    .filter((entry) => entry.name !== ''));
}

/**
 * Entries whose name or detail holds every word of the query, those whose name
 * starts with it first, so "drag" lists dragons before "Adult Red Dragon".
 */
export function filterStatblockEntries(entries: readonly StatblockEntry[], query: string): StatblockEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...entries];
  const terms = needle.split(/\s+/);
  const matches = entries.filter((entry) => {
    const haystack = `${entry.name} ${entry.detail}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  const leads = (entry: StatblockEntry): number => (entry.name.toLowerCase().startsWith(needle) ? 0 : 1);
  return matches.sort((a, b) => leads(a) - leads(b));
}
