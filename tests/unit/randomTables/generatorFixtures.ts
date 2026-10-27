import type { LootItem } from '../../../src/app/loot/lootItem';
import { tablesOfNote } from '../../../src/app/randomTables/noteTables';
import type { LinkedTable, TableResolver } from '../../../src/app/randomTables/resultCells';
import type { CollectionTable } from '../../../src/app/randomTables/TableNoteReader';
import type { RandomTableSource } from '../../../src/app/types/randomTableTypes';

/** A one-column table of one row. */
export const oneRow = (text: string): string => `| Result |\n| --- |\n| ${text} |\n`;

/** A generator note: a `| Part | Result |` table under the heading `name`. */
export const generatorNote = (name: string, parts: [string, string][]): string =>
  `## ${name}\n\n| Part | Result |\n| --- | --- |\n${parts.map(([part, cell]) => `| ${part} | ${cell} |`).join('\n')}\n`;

/** Shadowdark's magic weapon, shortened: the Name names two parts, the Curse is often nothing. */
export const WEAPON_NOTE = generatorNote('Magic Weapon', [
  ['Name', '{Bonus} {Type}'],
  ['Type', '[[Weapon Types]]'],
  ['Bonus', '+`1d3`'],
  ['Feature', '[[Features]]'],
  ['Curse', ''],
]);

export const WEAPON_TABLES: Record<string, string> = {
  'Weapon Types': '| d2 | Weapon |\n| --- | --- |\n| 1 | Longsword |\n| 2 | Mace |\n',
  Features: '| d3 | Feature |\n| --- | --- |\n| 1 | Oak leaf motif |\n| 2 | Hums near undead |\n| 3 | Cold to the touch |\n',
};

/** Tables and views by link, as the reader finds them: notes named in `generators` are listed as generators. */
export function resolverOf(
  notes: Record<string, string>, views: Record<string, LootItem[]> = {}, generators: ReadonlySet<string> = new Set(),
): TableResolver {
  return {
    resolve: async (link): Promise<LinkedTable | null> => {
      const items = views[link];
      if (items) return { kind: 'view', key: link, items };
      const [note = '', heading] = link.split('#');
      const text = notes[note];
      if (text === undefined) return null;
      const { tables } = tablesOfNote(text, note);
      const table = heading === undefined ? (tables.length === 1 ? tables[0] : undefined) : tables.find((t) => t.heading === heading);
      if (!table) return null;
      return {
        kind: 'table',
        key: `${note}.md#${table.index}`,
        table,
        notePath: `${note}.md`,
        ...(generators.has(note) && { generator: { name: table.name, noteName: note } }),
      };
    },
  };
}

/** The first table of `text` as a listed generator of the note `name`. */
export function foundGenerator(name: string, text: string, source: Partial<RandomTableSource> = {}): CollectionTable {
  const full: RandomTableSource = { path: `${name}.md`, index: 0, kind: 'generator', ...source };
  const table = tablesOfNote(text, name).tables[full.index] ?? null;
  return { id: `${full.path}#${full.index}`, source: full, status: table ? 'found' : 'table-missing', table, noteName: name };
}

export const item = (name: string, view: string): LootItem => ({ id: `Items/${name}.md`, name, source: ['Loot', view], properties: [] });
