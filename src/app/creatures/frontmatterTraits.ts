import { readBudget, valueText, type TextStyle } from './statblockValues';

/** The lists whose entries Fantasy Statblocks' watcher stores as `{ name, desc }`. */
const TRAIT_LISTS = ['traits', 'actions', 'bonus_actions', 'reactions', 'legendary_actions'];

/** A trait's text as the watcher stores it: the parts of a list or a map in a row. */
const STORED: TextStyle = { joiner: ' ', parens: false, keyed: true };

/**
 * A creature's trait lists with their `[name, description]` entries as the `{ name, desc }` a
 * statblock's blocks read. Other entries stay as they are: a list of plain words is what the
 * Traits filter reads. `frontmatter` is the note's frontmatter as a bounded copy.
 */
export function namedTraitLists(frontmatter: Readonly<Record<string, unknown>>): Record<string, unknown> {
  // One budget for all the texts of the note, however many entries they are made for.
  const budget = readBudget();
  const lists: Record<string, unknown> = {};
  for (const key of TRAIT_LISTS) {
    const list = frontmatter[key];
    if (!Array.isArray(list)) continue;
    lists[key] = list.map((entry: unknown) => (Array.isArray(entry)
      ? { name: valueText(entry[0], STORED, budget), desc: valueText(entry.slice(1), STORED, budget) }
      : entry));
  }
  return lists;
}
