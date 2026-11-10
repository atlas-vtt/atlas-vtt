import type { LootItem } from './lootItem';
import { rarityOptionOf, rarityToneIn, type RarityTone } from './lootRarity';
import type { RarityOption } from '../types/randomTableTypes';

export interface LootProperty {
  label: string;
  value: string;
}

/**
 * One rolled item, copied out of its note so the history outlives edits to it.
 * Its price already names the collection's currency, e.g. "500 thorns".
 */
export type LootDraw = Omit<LootItem, 'id'> & {
  /** This draw; an item drawn twice gives two draws. */
  id: string;
  /** The item note. */
  notePath: string;
  /** The tone its rarity was painted in when it was drawn, by the collection's words; absent for none. */
  tone?: RarityTone;
};

/** The collection's rarity words, and those switched off for a roll (lower case). */
export interface RarityChoice {
  rarities: readonly RarityOption[];
  /** Words switched off: their items are never drawn. Items whose rarity is none of the words always may be. */
  excluded?: ReadonlySet<string>;
}

export interface LootRollOptions {
  count: number;
  /** Which rarities may be drawn and the tones drawn items are painted in; without it, every item and the ladder's tones. */
  rarity?: RarityChoice;
  /** Named after plain-number prices, e.g. "thorns". */
  currency?: string | undefined;
  random?: () => number;
}

/** The key a rarity word is switched off by. */
export const rarityKey = (option: RarityOption): string => option.name.toLowerCase();

/** A price as players read it: plain numbers get thousands separators and the currency. */
export function formatPrice(price: string, currency: string | undefined): string {
  if (!/^\d+(\.\d+)?$/.test(price.trim())) return price;
  const amount = Number(price).toLocaleString('en-US');
  return currency?.trim() ? `${amount} ${currency.trim()}` : amount;
}

/** Each item once, however many ticked views hold it. */
function unique(items: readonly LootItem[]): LootItem[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && seen.add(item.id));
}

function drawable(items: readonly LootItem[], rarity: RarityChoice | undefined): LootItem[] {
  const excluded = rarity?.excluded;
  if (!rarity || !excluded || excluded.size === 0) return unique(items);
  return unique(items).filter((item) => {
    const option = rarityOptionOf(item.rarity, rarity.rarities);
    return !option || !excluded.has(rarityKey(option));
  });
}

/** How many items can be drawn with these rarities switched off. */
export function countDrawable(items: readonly LootItem[], rarity: RarityChoice): number {
  return drawable(items, rarity).length;
}

/** How many items name each of the collection's rarity words, by `rarityKey`. */
export function countByRarity(items: readonly LootItem[], rarities: readonly RarityOption[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of unique(items)) {
    const option = rarityOptionOf(item.rarity, rarities);
    if (option) counts.set(rarityKey(option), (counts.get(rarityKey(option)) ?? 0) + 1);
  }
  return counts;
}

/** An item as drawn: copied out of its note, its price in the currency, its rarity's tone by the collection's words. */
export function toDraw(item: LootItem, currency: string | undefined, rarities: readonly RarityOption[] = []): LootDraw {
  const { id, price, ...rest } = item;
  const tone = rarityToneIn(item.rarity, rarities);
  return { ...rest, id: crypto.randomUUID(), notePath: id, ...(price && { price: formatPrice(price, currency) }), ...(tone && { tone }) };
}

/** Draws `count` items; every drawable item has the same chance, and may come up more than once. */
export function rollLoot(items: readonly LootItem[], { count, rarity, currency, random = Math.random }: LootRollOptions): LootDraw[] {
  const pool = drawable(items, rarity);
  const draws: LootDraw[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const item = pool[Math.floor(random() * pool.length)];
    if (item) draws.push(toDraw(item, currency, rarity?.rarities));
  }
  return draws;
}
