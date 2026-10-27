import { describe, expect, it } from 'vitest';
import { EMPTY_DEVICE_HISTORY, mergeLootHistories, withReplacedRoll, withRoll } from '../../../src/app/loot/deviceLootHistory';
import type { LootRoll, TableResult } from '../../../src/app/loot/lootHistory';
import { rollGeneratorResults } from '../../../src/app/randomTables/generatorResults';
import { canReroll, heldDraws, rerollPart, rerollUnlocked } from '../../../src/app/randomTables/generatorReroll';
import { tableRollEntry } from '../../../src/app/randomTables/tableResults';
import { seededRandom } from '../library/fakeSync';
import { foundGenerator, generatorNote, item, resolverOf } from './generatorFixtures';

/** Title and Epithet roll a d1000, so a reroll all but always changes them; the Name names both. */
const NOTE = generatorNote('Hero', [
  ['Name', '{Title} the {Epithet}'],
  ['Title', '`1d1000`'],
  ['Epithet', '`1d1000`'],
  ['Weapon', '![[Loot.base#Arms]]'],
  ['Type', 'Hero'],
]);
const ARMS = { 'Loot.base#Arms': ['Sword', 'Axe', 'Bow', 'Spear', 'Club', 'Whip', 'Sling', 'Pick'].map((name) => item(name, 'Arms')) };
const found = foundGenerator('Heroes', NOTE);
const request = (seed: number): Parameters<typeof rerollPart>[4] => ({ resolver: resolverOf({}, ARMS), random: seededRandom(seed) });

async function rolled(): Promise<{ roll: LootRoll; result: TableResult }> {
  const roll = tableRollEntry(await rollGeneratorResults(found, request(1), 2), 'Keep', 1);
  return { roll, result: roll.results![0]! };
}

const value = (result: TableResult, label: string): string | undefined => result.fields.find((field) => field.label === label)?.value;

describe('rerolling a generator result', () => {
  it('rolls one part again and names the result again with it, every other part kept', async () => {
    const { roll, result } = await rolled();
    const next = await rerollPart(roll, result, 1, found, request(7));
    const after = next!.results![0]!;
    expect(after.id).toBe(result.id);
    expect(after.item).toBe(result.item);
    expect(value(after, 'Title')).not.toBe(value(result, 'Title'));
    expect(value(after, 'Epithet')).toBe(value(result, 'Epithet'));
    expect(value(after, 'Weapon')).toBe(value(result, 'Weapon'));
    expect(after.text).toBe(`${value(after, 'Title')} the ${value(result, 'Epithet')}`);
    // The other result and every draw it holds stay as they were.
    expect(next!.results![1]).toBe(roll.results![1]);
    expect(next!.draws.filter((draw) => !heldDraws(result).has(draw.id))).toEqual(roll.draws.filter((draw) => !heldDraws(result).has(draw.id)));
    // Its item follows: same id, the new name.
    expect(next!.draws.find((draw) => draw.id === after.item)?.name).toBe(after.text);
  });

  it('replaces the draws of a part rolled again', async () => {
    const { roll, result } = await rolled();
    const weapon = result.fields.find((field) => field.label === 'Weapon')!;
    const next = await rerollPart(roll, result, weapon.row!, found, request(11));
    const after = next!.results![0]!.fields.find((field) => field.label === 'Weapon')!;
    expect(after.items).toHaveLength(1);
    expect(after.items).not.toEqual(weapon.items);
    expect(next!.draws.some((draw) => draw.id === weapon.items![0])).toBe(false);
    expect(next!.draws.find((draw) => draw.id === after.items![0])?.name).toBe(after.value);
    expect(next!.draws).toHaveLength(roll.draws.length);
  });

  it('rolls every unlocked part and the Name again, keeping the locked ones', async () => {
    const { roll, result } = await rolled();
    const epithet = result.fields.find((field) => field.label === 'Epithet')!.row!;
    const weapon = result.fields.find((field) => field.label === 'Weapon')!;
    const next = await rerollUnlocked(roll, result, new Set([epithet, weapon.row!]), found, request(5));
    const after = next!.results![0]!;
    expect(value(after, 'Title')).not.toBe(value(result, 'Title'));
    expect(value(after, 'Epithet')).toBe(value(result, 'Epithet'));
    expect(after.fields.find((field) => field.label === 'Weapon')).toEqual(weapon);
    expect(next!.draws.some((draw) => draw.id === weapon.items![0])).toBe(true);
  });

  it('cannot be rolled again once its generator lost the part or is no longer a generator', async () => {
    const { roll, result } = await rolled();
    expect(canReroll(result, found)).toBe(true);
    const renamed = foundGenerator('Heroes', NOTE.replace('| Title |', '| Rank |'));
    expect(canReroll(result, renamed)).toBe(false);
    expect(await rerollPart(roll, result, 1, renamed, request(2))).toBeNull();
    expect(canReroll(result, { ...found, source: { ...found.source, kind: 'text' } })).toBe(false);
    expect(canReroll(result, undefined)).toBe(false);
  });
});

describe('the history after a reroll', () => {
  const roll = (id: string, text: string): LootRoll => ({ id, rolledAt: 1, mapName: 'Keep', draws: [], results: [{ id: 'r', source: [], notePath: 'H.md', text, fields: [] }] });

  it('holds the roll the card shows in place of the one rolled', () => {
    const own = withRoll(withRoll(EMPTY_DEVICE_HISTORY, roll('a', 'old')), roll('b', 'other'));
    const next = withReplacedRoll(own, [], roll('a', 'new'));
    expect(next.rolls.map((entry) => [entry.id, entry.results![0]!.text])).toEqual([['b', 'other'], ['a', 'new']]);
  });

  it('takes another device\'s roll as its own, and brings no removed roll back', () => {
    const other = { rolls: [roll('a', 'old')], removed: [] };
    expect(mergeLootHistories([withReplacedRoll(EMPTY_DEVICE_HISTORY, [other], roll('a', 'new')), other])[0]!.results![0]!.text).toBe('new');
    expect(withReplacedRoll(EMPTY_DEVICE_HISTORY, [], roll('a', 'new'))).toBe(EMPTY_DEVICE_HISTORY);
  });
});
