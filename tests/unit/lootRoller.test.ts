import { describe, expect, it } from 'vitest';
import type { LootItem } from '../../src/app/loot/lootItem';
import { countByRarity, countDrawable, formatPrice, rollLoot, type RarityChoice } from '../../src/app/loot/lootRoller';
import { rarityTone, rarityToneIn } from '../../src/app/loot/lootRarity';
import { readLootRoll } from '../../src/app/loot/lootHistory';
import { collectionItemRarities, DEFAULT_ITEM_RARITIES } from '../../src/app/gameSystems/itemRarities';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';

/** A random source that returns the given values in turn. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

function item(name: string, fields: Partial<LootItem> = {}): LootItem {
  return { id: `Items/${name}.md`, name, source: ['Items', 'Gear'], properties: [], ...fields };
}

const BROADSWORD = item('Broadsword', { price: '100', properties: [{ label: 'Damage', value: 'd8 phy' }] });
const LONGSWORD = item('Longsword');

describe('rollLoot', () => {
  it('draws every item with the same chance', () => {
    const [first] = rollLoot([BROADSWORD, LONGSWORD], { count: 1, random: sequence(0.1) });
    const [second] = rollLoot([BROADSWORD, LONGSWORD], { count: 1, random: sequence(0.9) });
    expect(first?.name).toBe('Broadsword');
    expect(second?.name).toBe('Longsword');
  });

  it('copies the item note, its source and its properties', () => {
    const [draw] = rollLoot([BROADSWORD], { count: 1, random: sequence(0.1) });
    expect(draw).toMatchObject({
      notePath: 'Items/Broadsword.md',
      source: ['Items', 'Gear'],
      name: 'Broadsword',
      price: '100',
      properties: [{ label: 'Damage', value: 'd8 phy' }],
    });
    const [longsword] = rollLoot([LONGSWORD], { count: 1 });
    expect(longsword?.price).toBeUndefined();
  });

  it('names plain-number prices after the currency', () => {
    const [draw] = rollLoot([item('Crown', { price: '1500' })], { count: 1, currency: 'thorns' });
    expect(draw?.price).toBe('1,500 thorns');
  });

  it('counts an item in two ticked views once', () => {
    const inTwoViews = [BROADSWORD, { ...BROADSWORD, source: ['Items', 'Weapons'] }, LONGSWORD];
    expect(countDrawable(inTwoViews, { rarities: [] })).toBe(2);
    const [draw] = rollLoot(inTwoViews, { count: 1, random: sequence(0.9) });
    expect(draw?.name).toBe('Longsword');
  });

  it('rolls the requested number of items', () => {
    expect(rollLoot([BROADSWORD, LONGSWORD], { count: 4, random: sequence(0.3, 0.7) })).toHaveLength(4);
  });

  it('rolls nothing without items', () => {
    expect(rollLoot([], { count: 3 })).toEqual([]);
  });
});

describe('formatPrice', () => {
  it('leaves prices that are not plain numbers as they are', () => {
    expect(formatPrice('2 handfuls', 'gold')).toBe('2 handfuls');
    expect(formatPrice('250', undefined)).toBe('250');
    expect(formatPrice('250', '  ')).toBe('250');
  });
});

describe('rarity', () => {
  it('maps onto the classic ladder, whatever the base calls it', () => {
    expect(rarityTone('Uncommon')).toBe('uncommon');
    expect(rarityTone('Very Rare')).toBe('epic');
    expect(rarityTone('**Legendary**')).toBe('legendary');
    expect(rarityTone('Artifact')).toBe('legendary');
    expect(rarityTone('Heirloom')).toBeUndefined();
    expect(rarityTone(undefined)).toBeUndefined();
  });
});

describe('rollLoot with rarities switched off', () => {
  const LADDER = [item('Rope', { rarity: 'Common' }), item('Lantern', { rarity: 'Uncommon' }), item('Glowing Rings', { rarity: '**Rare**' })];
  const PEBBLE = item('Pebble');
  const off = (...names: string[]): RarityChoice => ({ rarities: DEFAULT_ITEM_RARITIES, excluded: new Set(names) });

  it('never draws items of a switched-off rarity word', () => {
    const draws = rollLoot(LADDER, { count: 30, rarity: off('common', 'rare'), random: Math.random });
    expect(new Set(draws.map((draw) => draw.name))).toEqual(new Set(['Lantern']));
  });

  it('keeps items whose rarity is none of the words whatever is switched off', () => {
    const draws = rollLoot([PEBBLE, item('Heirloom', { rarity: 'Heirloom' })], { count: 4, rarity: off('common', 'uncommon', 'rare'), random: sequence(0.1, 0.9) });
    expect(draws.map((draw) => draw.name)).toEqual(['Pebble', 'Heirloom', 'Pebble', 'Heirloom']);
  });

  it('counts the items of each word and those left to draw', () => {
    expect(countByRarity([...LADDER, PEBBLE], DEFAULT_ITEM_RARITIES)).toEqual(new Map([['common', 1], ['uncommon', 1], ['rare', 1]]));
    expect(countDrawable([...LADDER, PEBBLE], off('common'))).toBe(3);
    expect(countDrawable(LADDER, off('common', 'uncommon', 'rare'))).toBe(0);
  });
});

describe('the tone a drawn item is painted in', () => {
  const PF2E_RARITIES = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === 'builtin:pathfinder2e')!.rules.itemRarities!;

  it('reads a 5e "Very rare" as epic', () => {
    const [draw] = rollLoot([item('Staff of Power', { rarity: 'Very rare' })], { count: 1, rarity: { rarities: DEFAULT_ITEM_RARITIES } });
    expect(draw?.tone).toBe('epic');
  });

  it('reads a word by the collection\'s own tone first: PF2e paints Unique legendary through its preset', () => {
    const rarities = collectionItemRarities({ systemPresetId: 'builtin:pathfinder2e' }, BUILT_IN_SYSTEM_PRESETS);
    expect(rarities).toEqual(PF2E_RARITIES);
    const [draw] = rollLoot([item('Orb of Dragonkind', { rarity: 'unique' })], { count: 1, rarity: { rarities } });
    expect(draw?.tone).toBe('legendary');
    expect(rarityToneIn('Rare', [{ name: 'Rare', tone: null }])).toBeUndefined();
  });

  it('paints a Cairn item, which names no rarity, in no tone', () => {
    const rarities = collectionItemRarities({ systemPresetId: 'builtin:cairn' }, BUILT_IN_SYSTEM_PRESETS);
    const [draw] = rollLoot([item('Rope, 50ft', { price: '5' })], { count: 1, rarity: { rarities } });
    expect(draw && 'tone' in draw).toBe(false);
  });

  it('keeps an earlier draw without a tone as it was, and drops a tone it does not know', () => {
    const roll = { id: 'r', rolledAt: 1, mapName: 'Cellar', draws: [{ id: 'd', notePath: 'Items/Rope.md', source: ['Items'], name: 'Rope', rarity: 'Rare', properties: [] }] };
    expect(readLootRoll(roll)?.draws[0]).toEqual(roll.draws[0]);
    expect(readLootRoll({ ...roll, draws: [{ ...roll.draws[0], tone: 'mythic' }] })?.draws[0]).toEqual(roll.draws[0]);
    expect(readLootRoll({ ...roll, draws: [{ ...roll.draws[0], tone: 'epic' }] })?.draws[0]?.tone).toBe('epic');
  });
});
