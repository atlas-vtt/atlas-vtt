/** The lists whose entries Fantasy Statblocks' watcher stores as `{ name, desc }`. */
const TRAIT_LISTS = ['traits', 'actions', 'bonus_actions', 'reactions', 'legendary_actions'];

/**
 * How much of a note's trait entries is read. A note is not Atlas' own text (it may come in a
 * bundle or a shared vault), and the frontmatter parser hands over lists that hold each other, or
 * themselves, any number of times. A trait is a name and a description, a text or a short list of
 * texts, so the limits lie far beyond any real one.
 */
const MAX_DEPTH = 5;
const MAX_TEXT_LENGTH = 10_000;
/** Values looked at for all trait lists of one creature together. */
const MAX_VALUES = 10_000;

type ReadTraitText = (value: unknown, from?: number) => string;

/**
 * Reads trait texts as Fantasy Statblocks' watcher writes them: the parts of a list or a map in a
 * row, a list from its item `from` on. What lies beyond a limit reads as nothing: a text ends at
 * its length, a list or map is read once per text and to `MAX_DEPTH`, and all texts of one reader
 * share `MAX_VALUES`.
 */
function traitTextReader(): ReadTraitText {
  let values = MAX_VALUES;
  // A map's keys and values in a row. Listing them costs its whole size, whatever is read of it
  // after, so a map that many entries share is listed once.
  const listed = new Map<object, unknown[]>();
  const itemsOf = (part: object): unknown[] => {
    if (Array.isArray(part)) return part;
    const items = listed.get(part) ?? Object.entries(part).flat();
    listed.set(part, items);
    return items;
  };

  return (value, from = 0) => {
    const read = new Set<object>();
    let room = MAX_TEXT_LENGTH;

    const textOf = (part: unknown, depth: number): string => {
      if (values <= 0 || room <= 0) return '';
      values -= 1;
      if (typeof part === 'string' || typeof part === 'number') {
        const text = String(part).slice(0, room);
        room -= text.length + 1;
        return text;
      }
      if (!part || typeof part !== 'object' || depth === MAX_DEPTH || read.has(part)) return '';
      read.add(part);

      const items = itemsOf(part);
      const texts: string[] = [];
      for (let index = depth === 0 ? from : 0; index < items.length && values > 0 && room > 0; index++) {
        texts.push(textOf(items[index], depth + 1));
      }
      return texts.join(' ');
    };

    return textOf(value, 0);
  };
}

/**
 * A creature's trait lists with their `[name, description]` entries as the `{ name, desc }` a
 * statblock's blocks read. Other entries stay as they are: a list of plain words is what the
 * Traits filter reads.
 */
export function namedTraitLists(frontmatter: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const traitText = traitTextReader();
  const lists: Record<string, unknown> = {};
  for (const key of TRAIT_LISTS) {
    const list = frontmatter[key];
    if (!Array.isArray(list)) continue;
    lists[key] = list.map((entry: unknown) =>
      (Array.isArray(entry) ? { name: traitText(entry[0]), desc: traitText(entry, 1) } : entry));
  }
  return lists;
}
