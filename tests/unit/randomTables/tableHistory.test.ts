import { describe, expect, it } from 'vitest';
import { mergeLootHistories, readDeviceLootHistory, serializeDeviceLootHistory, withRoll, EMPTY_DEVICE_HISTORY } from '../../../src/app/loot/deviceLootHistory';
import { readLootHistory, type LootRoll } from '../../../src/app/loot/lootHistory';
import { toLootItems, type LootItem } from '../../../src/app/loot/lootItem';
import { rollLoot, type LootDraw, type LootProperty } from '../../../src/app/loot/lootRoller';
import { tablesOfNote } from '../../../src/app/randomTables/noteTables';
import type { LinkedTable, TableResolver } from '../../../src/app/randomTables/resultCells';
import type { CollectionTable } from '../../../src/app/randomTables/TableNoteReader';
import { rollCollectionTable, tableRollEntry } from '../../../src/app/randomTables/tableResults';
import type { RandomTableSource } from '../../../src/app/types/randomTableTypes';
import { isFiniteNumber, isRecord, isStringArray } from '../../../src/app/utils/guards';
import { BREW_NOTE } from '../../fixtures/tableNotes';
import { seededRandom } from '../library/fakeSync';

/** `readLootRoll` as Atlas 0.7 shipped it, which devices that have not updated still run. */
function readLootRoll07(value: unknown): unknown {
  const isLootProperty = (v: unknown): v is LootProperty => isRecord(v) && typeof v.label === 'string' && typeof v.value === 'string';
  const isLootDraw = (v: unknown): boolean => {
    if (!isRecord(v)) return false;
    const { id, notePath, source, name, price, description, type, rarity, properties } = v;
    return typeof id === 'string' && typeof notePath === 'string' && isStringArray(source) && typeof name === 'string'
      && (price === undefined || typeof price === 'string') && (description === undefined || typeof description === 'string')
      && (type === undefined || typeof type === 'string') && (rarity === undefined || typeof rarity === 'string')
      && Array.isArray(properties) && properties.every(isLootProperty);
  };
  if (!isRecord(value)) return null;
  const { id, rolledAt, mapName, draws } = value;
  if (typeof id !== 'string' || !isFiniteNumber(rolledAt) || typeof mapName !== 'string' || !Array.isArray(draws)) return null;
  const valid = draws.filter(isLootDraw);
  if (valid.length === 0) return null;
  return { id, rolledAt, mapName, draws: valid };
}

const NO_LINKS: TableResolver = { resolve: () => Promise.resolve(null) };

function found(text: string, source: RandomTableSource, items?: LootItem[]): CollectionTable {
  const table = tablesOfNote(text, 'Brew').tables[source.index]!;
  return { id: `${source.path}#${source.index}`, source, status: 'found', table, noteName: 'Brew', ...(items && { items }) };
}

const RUMOURS: RandomTableSource = { path: 'Brew.md', table: '🗣️ Rumours in the Taproom', index: 1, kind: 'text', hiddenColumns: ['True?'] };

const itemRoll = (id: string, rolledAt: number): LootRoll =>
  ({ id, rolledAt, mapName: 'Crypt', draws: [{ id: `${id}-1`, notePath: 'Rope.md', source: ['Gear'], name: 'Rope', properties: [] }] });

async function textRoll(rolledAt = 2): Promise<LootRoll> {
  const outcome = await rollCollectionTable(found(BREW_NOTE, RUMOURS), { count: 2, resolver: NO_LINKS, random: seededRandom(3) });
  return tableRollEntry(outcome, 'Taproom', rolledAt);
}

describe('a roll on a Text table', () => {
  it('gives results with the die, the text and the columns, the GM\'s hidden ones marked', async () => {
    const roll = await textRoll();
    expect(roll.draws).toEqual([]);
    expect(roll.results).toHaveLength(2);
    const [first] = roll.results!;
    expect(first).toMatchObject({ source: ['Brew', '🗣️ Rumours in the Taproom'], notePath: 'Brew.md', roll: { die: 'd6' } });
    expect(first!.text).toMatch(/^"/);
    expect(first!.fields).toEqual([{ label: 'True?', value: expect.stringMatching(/[✅❌]/) as string, hidden: true }]);
  });

  it('survives a write and a read of the history file', async () => {
    const roll = await textRoll();
    const file = serializeDeviceLootHistory(withRoll(EMPTY_DEVICE_HISTORY, roll));
    expect(readDeviceLootHistory(JSON.parse(file)).rolls).toEqual([roll]);
  });

  it('is left out whole by the reader of Atlas 0.7, which keeps item rolls', async () => {
    const file = JSON.parse(serializeDeviceLootHistory({ rolls: [await textRoll(), itemRoll('items', 1)], removed: [] })) as { rolls: unknown[] };
    expect(file.rolls.map(readLootRoll07)).toEqual([null, itemRoll('items', 1)]);
  });

  it('merges with other devices\' rolls of either kind, newest first', async () => {
    const text = await textRoll(5);
    const merged = mergeLootHistories([
      readDeviceLootHistory({ rolls: [itemRoll('mine', 3)] }),
      readDeviceLootHistory(JSON.parse(serializeDeviceLootHistory({ rolls: [text, itemRoll('old', 1)], removed: [] }))),
    ]);
    expect(merged.map((roll) => roll.id)).toEqual([text.id, 'mine', 'old']);
  });

  it('drops broken results and keeps the rest', () => {
    const result = { id: 'r', source: ['Brew', 'Rumours'], notePath: 'Brew.md', text: 'A rumour', fields: [] };
    expect(readLootHistory({ rolls: [
      { id: 'a', rolledAt: 1, mapName: 'X', draws: [], results: [result, { ...result, fields: [{ label: 1 }] }, { id: 'no text' }] },
      { id: 'b', rolledAt: 1, mapName: 'X', draws: [], results: [{ ...result, roll: { die: 'd6' } }] },
    ] })).toEqual([{ id: 'a', rolledAt: 1, mapName: 'X', draws: [], results: [result] }]);
  });
});

/** A view of the Cairn loot base: items without rarity, prices in gp. */
function cairnItems(): LootItem[] {
  const entries = ['Rope', 'Lantern', 'Crowbar'].map((name) => ({ path: `Reference/Cairn/Items/${name}.md`, name, values: { 'note.price': '10', 'note.slots': '1' } }));
  return toLootItems({ entries, order: ['note.price', 'note.slots'], displayNames: { 'note.slots': 'Slots' } }, ['Cairn Items', 'Gear']);
}

describe('items', () => {
  it('the Cairn loot base still rolls as an Items table and its history reads as before', () => {
    const draws: LootDraw[] = rollLoot(cairnItems(), { count: 2, currency: 'gp', random: seededRandom(1) });
    expect(draws.every((draw) => draw.price === '10 gp' && draw.rarity === undefined)).toBe(true);
    const roll = tableRollEntry({ draws, results: [] }, 'Crypt', 1);
    expect(roll).not.toHaveProperty('results');
    expect(readLootRoll07(JSON.parse(JSON.stringify(roll)))).toEqual(roll);
  });

  it('a master Items table rolls the Base view its row links, and a plain row is its own item', async () => {
    const note = '| d6 | Loot |\n| --- | --- |\n| 1-5 | ![[Cairn Items.base#Gear]] |\n| 6 | Gold Tooth |\n';
    const source: RandomTableSource = { path: 'Master.md', index: 0, kind: 'items' };
    const gearView: LinkedTable = { kind: 'view', key: 'Cairn Items.base#Gear', items: cairnItems() };
    const resolver: TableResolver = { resolve: (link) => Promise.resolve(link === 'Cairn Items.base#Gear' ? gearView : null) };
    const master = found(note, source, [
      { id: 'Master.md', name: '![[Cairn Items.base#Gear]]', source: ['Master', 'Master'], properties: [] },
      { id: 'Master.md', name: 'Gold Tooth', source: ['Master', 'Master'], properties: [] },
    ]);
    const outcome = await rollCollectionTable(master, { count: 20, resolver, currency: 'gp', random: seededRandom(2) });
    expect(outcome.results).toEqual([]);
    expect(outcome.draws).toHaveLength(20);
    expect(new Set(outcome.draws.map((draw) => draw.name))).toEqual(new Set(['Rope', 'Lantern', 'Crowbar', 'Gold Tooth']));
  });
});

describe('a generator\'s result in the history', () => {
  const result = {
    id: 'g', source: ['Weapons', 'Magic Weapon'], notePath: 'Weapons.md', text: '+1 Mace',
    fields: [{ label: 'Type', value: 'Mace', row: 1, items: ['d1'] }],
    generator: { path: 'Weapons.md', index: 0, name: '{Bonus} {Type}' },
    item: 'd0',
  };

  it('keeps its generator, rows and item through a write and a read', () => {
    const roll: LootRoll = { id: 'a', rolledAt: 1, mapName: 'X', draws: [], results: [result] };
    expect(readDeviceLootHistory(JSON.parse(serializeDeviceLootHistory(withRoll(EMPTY_DEVICE_HISTORY, roll)))).rolls).toEqual([roll]);
  });

  it('drops what it cannot read of them and keeps the result as a Text result', () => {
    const broken = { ...result, fields: [{ label: 'Type', value: 'Mace', row: -1, items: [2] }], generator: { path: 3, index: 0 }, item: 4 };
    const [roll] = readLootHistory({ rolls: [{ id: 'a', rolledAt: 1, mapName: 'X', draws: [], results: [broken] }] });
    expect(roll!.results).toEqual([{ id: 'g', source: ['Weapons', 'Magic Weapon'], notePath: 'Weapons.md', text: '+1 Mace', fields: [{ label: 'Type', value: 'Mace' }] }]);
  });
});
