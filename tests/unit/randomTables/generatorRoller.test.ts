import { describe, expect, it } from 'vitest';
import { fillName, generatorShape, partValues } from '../../../src/app/randomTables/generatorParts';
import { rollGeneratorResults } from '../../../src/app/randomTables/generatorResults';
import { resolveCell, type CellContext } from '../../../src/app/randomTables/resultCells';
import { rollCollectionTable } from '../../../src/app/randomTables/tableResults';
import { TABLE_LIMITS } from '../../../src/app/randomTables/tableModel';
import { tablesOfNote } from '../../../src/app/randomTables/noteTables';
import { seededRandom } from '../library/fakeSync';
import { foundGenerator, generatorNote, item, oneRow, resolverOf, WEAPON_NOTE, WEAPON_TABLES } from './generatorFixtures';

const weapon = foundGenerator('Weapons', WEAPON_NOTE);
const request = (seed = 1, notes = WEAPON_TABLES, views = {}, generators = new Set<string>()): Parameters<typeof rollGeneratorResults>[1] =>
  ({ resolver: resolverOf(notes, views, generators), currency: 'gp', random: seededRandom(seed) });

describe('a generator table', () => {
  it('is read as its parts in row order, the Name apart', () => {
    const shape = generatorShape(weapon.table!);
    expect(shape.name).toMatchObject({ row: 0, label: 'Name', cell: '{Bonus} {Type}' });
    expect(shape.parts.map((part) => [part.row, part.label])).toEqual([[1, 'Type'], [2, 'Bonus'], [3, 'Feature'], [4, 'Curse']]);
  });

  it('fills `{Part}` with what parts rolled, in any case, keeps an unknown one and closes the gap an empty one leaves', () => {
    const values = partValues([{ label: 'Bonus', value: '+1' }, { label: 'Type', value: 'Longsword' }, { label: 'Curse', value: '' }]);
    expect(fillName('{bonus} {TYPE}', values)).toBe('+1 Longsword');
    expect(fillName('{Curse} {Type} of {Owner}', values)).toBe('Longsword of {Owner}');
  });

  it('names with plain text: a part\'s links count as the words they show, its emphasis is dropped', () => {
    const values = partValues([{ label: 'Spell', value: '*[[Magic/Spells/Illusion|Illusion]]*' }, { label: 'Ink', value: '**[[Gold Ink]]**' }]);
    expect(fillName('Scroll of {Spell}', values)).toBe('Scroll of Illusion');
    expect(fillName('{Ink} wand', values)).toBe('Gold Ink wand');
  });
});

describe('rolling a generator', () => {
  it('rolls every part in order into one result named by its Name part', async () => {
    const { results, draws } = await rollGeneratorResults(weapon, request(), 1);
    const [result] = results;
    // It has a Type part: it is an item too.
    expect(draws.map((draw) => draw.id)).toEqual([result!.item]);
    expect(result!.fields.map((field) => field.label)).toEqual(['Type', 'Bonus', 'Feature']);
    const [type, bonus, feature] = result!.fields;
    expect(type!.value).toMatch(/^(Longsword|Mace)$/);
    expect(bonus!.value).toMatch(/^\+[123]$/);
    expect(feature!.value).toMatch(/^(Oak leaf motif|Hums near undead|Cold to the touch)$/);
    expect(result!.text).toBe(`${bonus!.value} ${type!.value}`);
    expect(result).toMatchObject({ source: ['Weapons', 'Magic Weapon'], notePath: 'Weapons.md', generator: { path: 'Weapons.md', index: 0, name: '{Bonus} {Type}' } });
    expect(result!.fields.map((field) => field.row)).toEqual([1, 2, 3]);
    expect(result).not.toHaveProperty('roll');
  });

  it('leaves out empty parts and is named after the generator without a Name part', async () => {
    const plain = foundGenerator('Taverns', generatorNote('Tavern', [['Sign', 'The Drowned Rat'], ['Owner', ''], ['Drink', 'Mead']]), { label: 'Inns' });
    const { results: [result] } = await rollGeneratorResults(plain, request(), 1);
    expect(result!.text).toBe('Inns');
    expect(result!.fields).toEqual([{ label: 'Sign', value: 'The Drowned Rat', row: 0 }, { label: 'Drink', value: 'Mead', row: 2 }]);
    expect(result!.generator).toEqual({ path: 'Taverns.md', index: 0 });
  });

  it('rolls through `rollCollectionTable`, several results at once', async () => {
    const outcome = await rollCollectionTable(weapon, { ...request(4), count: 3 });
    expect(outcome.results).toHaveLength(3);
    expect(new Set(outcome.results.map((result) => result.id)).size).toBe(3);
  });

  it('shares one results budget among the parts of every result', async () => {
    const fan = foundGenerator('Fan', generatorNote('Fan', Array.from({ length: 12 }, (_, i): [string, string] => [`Part ${i}`, '[[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]]'])));
    const { results } = await rollGeneratorResults(fan, request(1, { Leaf: oneRow('x') }), 2);
    const rolled = results.flatMap((result) => result.fields).reduce((sum, field) => sum + (field.value.split('x').length - 1), 0);
    expect(rolled).toBe(TABLE_LIMITS.results - 2);
    expect(results.flatMap((result) => result.fields).some((field) => field.value.includes('[[Leaf]]'))).toBe(true);
  });

  it('draws the items of Base views its parts link, each named by its part', async () => {
    const trinkets = foundGenerator('Pockets', generatorNote('Pockets', [['Name', 'A pocket'], ['Trinket', '![[Loot.base#Rare]]']]));
    const { results: [result], draws } = await rollGeneratorResults(trinkets, request(1, {}, { 'Loot.base#Rare': [item('Ring of Warmth', 'Rare')] }), 1);
    expect(result!.fields).toEqual([{ label: 'Trinket', value: 'Ring of Warmth', row: 1, items: [draws[0]!.id] }]);
    expect(draws).toMatchObject([{ name: 'Ring of Warmth', notePath: 'Items/Ring of Warmth.md' }]);
    expect(result).not.toHaveProperty('item');
  });

  it('is an item when it has a Type part: named, typed, the other parts as lines', async () => {
    const blade = foundGenerator('Blades', generatorNote('Blade', [['Name', '{Bonus} {Type}'], ['Type', 'Dagger'], ['Bonus', '+2'], ['Feature', 'Glows'], ['Curse', '']]));
    const { results: [result], draws } = await rollGeneratorResults(blade, request(), 1);
    expect(draws).toHaveLength(1);
    expect(draws[0]).toMatchObject({ name: '+2 Dagger', type: 'Dagger', description: 'Bonus: +2\nFeature: Glows', notePath: 'Blades.md', source: ['Blades', 'Blade'] });
    expect(result!.item).toBe(draws[0]!.id);
  });
});

describe('a link to a generator in a cell', () => {
  const notes = { ...WEAPON_TABLES, Weapons: WEAPON_NOTE, Hoard: oneRow('A chest holding [[Weapons]]') };
  const context = (seed: number): CellContext => ({
    resolver: resolverOf(notes, {}, new Set(['Weapons'])),
    fromPath: 'Here.md',
    random: seededRandom(seed),
    trail: [],
    budget: { results: TABLE_LIMITS.results },
  });

  it('rolls the whole generator: its name, then its parts, and its item joins the cell\'s', async () => {
    const cell = await resolveCell('[[Hoard]]', context(3));
    expect(cell.text).toMatch(/^A chest holding \+[123] (Longsword|Mace) \(Type: (Longsword|Mace); Bonus: \+[123]; Feature: [^;)]+\)$/);
    expect(cell.items).toHaveLength(1);
    expect(cell.items[0]!.name).toMatch(/^\+[123] (Longsword|Mace)$/);
    expect(cell.items[0]!.notePath).toBe('Weapons.md');
  });

  it('is a table like any other where the collection does not roll it as a generator', async () => {
    const cell = await resolveCell('[[Weapons]]', { ...context(3), resolver: resolverOf(notes) });
    expect(cell.text).toMatch(/^(\{Bonus\} \{Type\}|Type|Bonus|Feature|Curse)$/);
  });

  it('stops at a generator that links itself, and at the depth limit', async () => {
    const loop = { Self: generatorNote('Self', [['Name', 'Me'], ['Again', '[[Self]]']]) };
    const own = await resolveCell('[[Self]]', { ...context(1), resolver: resolverOf(loop, {}, new Set(['Self'])) });
    expect(own.text).toBe('Me (Again: [[Self]])');
    expect(own.stopped).toEqual(['loop']);
    const deep = await resolveCell('[[Weapons]]', { ...context(1), trail: Array.from({ length: TABLE_LIMITS.depth }, (_, i) => `T${i}`) });
    expect(deep.text).toBe('[[Weapons]]');
    expect(deep.stopped).toEqual(['depth']);
  });

  it('is read as a table without a roll column', () => {
    expect(tablesOfNote(WEAPON_NOTE, 'Weapons').tables[0]!.hasRollColumn).toBe(false);
  });
});
