import { describe, expect, it } from 'vitest';
import { tablesOfNote } from '../../../src/app/randomTables/noteTables';
import { resolveCell, type CellContext, type LinkedTable, type TableResolver } from '../../../src/app/randomTables/resultCells';
import { TABLE_LIMITS } from '../../../src/app/randomTables/tableModel';
import type { LootItem } from '../../../src/app/loot/lootItem';
import { rollTable } from '../../../src/app/randomTables/tableRoller';
import { seededRandom } from '../library/fakeSync';

/** Tables by link: "Gems" is a whole note, "Treasure#Coins" a heading, "Loot.base#Rare" a Base view. */
function resolverOf(notes: Record<string, string>, views: Record<string, LootItem[]> = {}): TableResolver {
  return {
    resolve: async (link): Promise<LinkedTable | null> => {
      const items = views[link];
      if (items) return { kind: 'view', key: link, items };
      const [note = '', heading] = link.split('#');
      const text = notes[note];
      if (text === undefined) return null;
      const { tables } = tablesOfNote(text, note);
      const table = heading === undefined ? (tables.length === 1 ? tables[0] : undefined) : tables.find((t) => t.heading === heading);
      return table ? { kind: 'table', key: `${note}.md#${table.index}`, table, notePath: `${note}.md` } : null;
    },
  };
}

const context = (notes: Record<string, string> = {}, seed = 1, views: Record<string, LootItem[]> = {}): CellContext => ({
  resolver: resolverOf(notes, views),
  currency: 'gp',
  fromPath: 'Here.md',
  random: seededRandom(seed),
  trail: [],
  budget: { results: TABLE_LIMITS.results },
});

const oneRow = (text: string): string => `| Result |\n| --- |\n| ${text} |\n`;

describe('a rolled cell', () => {
  it('rolls dice in backticks and marks where their totals stand', async () => {
    const cell = await resolveCell('Take `3d6` gold and `dice: 1d4` gems', context());
    expect(cell.text).toMatch(/^Take \d+ gold and \d gems$/);
    expect(cell.rolls).toHaveLength(2);
    const [gold, gems] = cell.rolls;
    expect(gold!.formula).toBe('3d6');
    expect(cell.text.slice(gold!.at, gold!.at + String(gold!.total).length)).toBe(String(gold!.total));
    expect(gems!.formula).toBe('1d4');
    expect(gems!.total).toBeGreaterThanOrEqual(1);
    expect(gems!.total).toBeLessThanOrEqual(4);
  });

  it('leaves plain dice, code and refused formulas as written', async () => {
    const cell = await resolveCell('Deals 1d6 bludgeoning, `code`, `5` and `1000d1000`', context());
    expect(cell.text).toBe('Deals 1d6 bludgeoning, `code`, `5` and `1000d1000`');
    expect(cell.rolls).toEqual([]);
  });

  it('rolls a linked table in place, its own dice included', async () => {
    const cell = await resolveCell('A pouch with [[Gems|some gems]].', context({ Gems: oneRow('`2d4` rubies') }));
    expect(cell.text).toMatch(/^A pouch with \d rubies\.$/);
    expect(cell.rolls[0]!.at).toBe('A pouch with '.length);
  });

  it('rolls a table under a heading, and Dice Roller\'s dice link', async () => {
    const notes = { Treasure: `## Coins\n\n${oneRow('copper')}\n## Gems\n\n${oneRow('jade')}` };
    expect((await resolveCell('[[Treasure#Gems]] and `dice: [[Treasure#Coins]]`', context(notes))).text).toBe('jade and copper');
  });

  it('keeps any other link as a link', async () => {
    const notes = { Two: `## A\n\n${oneRow('a')}\n## B\n\n${oneRow('b')}` };
    expect((await resolveCell('See [[Rules]] and [[Two]]', context(notes))).text).toBe('See [[Rules]] and [[Two]]');
  });

  it('stops at a table that reaches itself', async () => {
    const notes = { Loop: oneRow('again [[Loop]]') };
    const cell = await resolveCell('[[Loop]]', context(notes));
    expect(cell.text).toBe('again [[Loop]]');
    expect(cell.stopped).toEqual(['loop']);
  });

  it('stops nesting at the depth limit', async () => {
    const notes = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`T${i}`, oneRow(`${i} [[T${i + 1}]]`)]));
    const cell = await resolveCell('[[T0]]', context(notes));
    expect(cell.text).toBe(`${Array.from({ length: TABLE_LIMITS.depth }, (_, i) => i).join(' ')} [[T${TABLE_LIMITS.depth}]]`);
    expect(cell.stopped).toEqual(['depth']);
  });

  it('stops at the results limit of one roll', async () => {
    const fan = oneRow('[[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]]');
    const notes = { Fan: fan, Mid: oneRow('[[Fan]] [[Fan]] [[Fan]] [[Fan]] [[Fan]] [[Fan]] [[Fan]]'), Leaf: oneRow('x') };
    const cell = await resolveCell('[[Mid]]', context(notes));
    expect(cell.text.split('x').length - 1).toBeLessThan(TABLE_LIMITS.results);
    expect(cell.stopped).toContain('results');
  });
});

const item = (name: string, view: string, price?: string): LootItem =>
  ({ id: `Items/${name}.md`, name, source: ['Loot', view], ...(price && { price }), properties: [] });

describe('a master table', () => {
  const views = {
    'Loot.base#Common': [item('Rope', 'Common', '1'), item('Torch', 'Common', '1')],
    'Loot.base#Rare': [item('Ring of Warmth', 'Rare', '1500')],
  };
  const notes = {
    Master: '| d6 | Loot |\n| --- | --- |\n| 1-3 | [[Loot.base#Common]] |\n| 4-5 | ![[Loot.base#Rare]] |\n| 6 | [[Coins]] |\n',
    Coins: oneRow('`2d6` gp'),
  };

  it('rolls the view or table its rolled row links: items from Base views, text from note tables', async () => {
    const resolver = resolverOf(notes, views);
    const master = (await resolver.resolve('Master', 'Here.md'))!;
    if (master.kind !== 'table') throw new Error('Master is a table');
    const seen = new Set<string>();
    const random = seededRandom(9);
    for (let i = 0; i < 100; i++) {
      const [draw] = rollTable(master.table, { count: 1, random });
      const cell = await resolveCell(draw!.row!.cells[0]!, { ...context(notes, 0, views), random });
      if (cell.items.length > 0) expect(cell.text).toBe(cell.items[0]!.name);
      seen.add(cell.items[0]?.source[1] ?? (/^\d+ gp$/.test(cell.text) ? 'Coins' : cell.text));
    }
    expect([...seen].sort()).toEqual(['Coins', 'Common', 'Rare']);
  });

  it('draws a Base view\'s item as the loot roller does, price in the currency', async () => {
    const cell = await resolveCell('Found: ![[Loot.base#Rare]]', context(notes, 1, views));
    expect(cell.text).toBe('Found: Ring of Warmth');
    expect(cell.items).toMatchObject([{ name: 'Ring of Warmth', notePath: 'Items/Ring of Warmth.md', price: '1,500 gp' }]);
  });

  it('counts a view against the depth limit like a table', async () => {
    const chain = Object.fromEntries(Array.from({ length: TABLE_LIMITS.depth }, (_, i) => [`T${i}`, oneRow(i < TABLE_LIMITS.depth - 1 ? `[[T${i + 1}]]` : '[[Loot.base#Rare]]')]));
    const cell = await resolveCell('[[T0]]', context(chain, 1, views));
    expect(cell.stopped).toEqual(['depth']);
    expect(cell.items).toEqual([]);
  });
});

describe('a row that rolls its own table again', () => {
  const armor = '| d4 | Armor |\n| --- | --- |\n| 1 | Leather |\n| 2 | Chainmail |\n| 3 | Plate |\n| 4 | Mithral + reroll ([[Armor]]) |\n';

  it('rolls the table again, never landing on the row that links it', async () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const cell = await resolveCell('[[Armor]]', context({ Armor: armor }, seed));
      expect(cell.text).not.toContain('[[');
      expect(cell.stopped).toEqual([]);
      seen.add(cell.text);
    }
    expect(seen).toEqual(new Set(['Leather', 'Chainmail', 'Plate', 'Mithral + reroll (Leather)', 'Mithral + reroll (Chainmail)', 'Mithral + reroll (Plate)']));
  });

  it('rolls it once for each link: two encounters combined', async () => {
    const encounters = '| d3 | Details |\n| --- | --- |\n| 1 | Orcs |\n| 2 | Wolves |\n| 3 | Roll two: [[Enc]] / [[Enc]] |\n';
    for (let seed = 1; seed <= 100; seed++) {
      const cell = await resolveCell('[[Enc]]', context({ Enc: encounters }, seed));
      expect(cell.text).toMatch(/^(Orcs|Wolves|Roll two: (Orcs|Wolves) \/ (Orcs|Wolves))$/);
    }
  });

  it('keeps a reroll from rerolling once more: a second row that links the table stays a link', async () => {
    const twice = '| d3 | Result |\n| --- | --- |\n| 1 | a |\n| 2 | again [[T]] |\n| 3 | more [[T]] |\n';
    const texts = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const cell = await resolveCell('[[T]]', context({ T: twice }, seed));
      texts.add(cell.text);
      if (cell.text.includes('[[T]]')) expect(cell.stopped).toEqual(['loop']);
    }
    expect(texts).toContain('again more [[T]]');
    expect(texts).toContain('more again [[T]]');
    expect(texts).toContain('again a');
  });

  it('is still a loop when another table leads back to it', async () => {
    const notes = { Outer: oneRow('[[Inner]]'), Inner: oneRow('back to [[Outer]]') };
    const cell = await resolveCell('[[Outer]]', context(notes));
    expect(cell.text).toBe('back to [[Outer]]');
    expect(cell.stopped).toEqual(['loop']);
  });
});
