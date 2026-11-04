/**
 * The words a collection's items name their rarity with, each painted in a
 * tone of the ladder or none: the collection's own, else its preset's, else the
 * classic ladder. Like senses, a collection stores its own list only once the
 * GM edits it, and an edit that ends at the system's list stores nothing.
 */

import { isRarityTone } from '../loot/lootRarity';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import type { RarityOption } from '../types/randomTableTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { isRecord } from '../utils/guards';

/** Words of a list beyond this are left out; so are longer words. */
const MAX_RARITIES = 32;
const MAX_NAME = 80;

/** The ladder of a collection whose system names no rarities. */
export const DEFAULT_ITEM_RARITIES: readonly RarityOption[] = [
  { name: 'Common', tone: 'common' },
  { name: 'Uncommon', tone: 'uncommon' },
  { name: 'Rare', tone: 'rare' },
  { name: 'Very rare', tone: 'epic' },
  { name: 'Legendary', tone: 'legendary' },
  { name: 'Artifact', tone: 'legendary' },
];

function readOption(value: unknown): RarityOption | null {
  if (!isRecord(value) || typeof value.name !== 'string') return null;
  const name = value.name.trim();
  if (!name || name.length > MAX_NAME) return null;
  return { name, tone: isRarityTone(value.tone) ? value.tone : null };
}

/**
 * A stored list of rarity words, which arrives unchecked, or undefined for none. Unusable entries
 * are left out, and a word only once, whatever its case. An empty list is a list: no rarities.
 */
export function parseItemRarities(value: unknown): RarityOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const options: RarityOption[] = [];
  for (const entry of value) {
    const option = readOption(entry);
    if (!option || seen.has(option.name.toLowerCase())) continue;
    seen.add(option.name.toLowerCase());
    options.push(option);
    if (options.length === MAX_RARITIES) break;
  }
  return options;
}

/** The rarity words of the collection's game system: its preset's, else the ladder. */
export function systemItemRarities(
  settings: Pick<CollectionSettings, 'systemPresetId'>,
  presets: readonly SystemPreset[],
): readonly RarityOption[] {
  return presets.find((preset) => preset.id === settings.systemPresetId)?.rules.itemRarities ?? DEFAULT_ITEM_RARITIES;
}

/** The rarity words of a collection: its own, else its system's. */
export function collectionItemRarities(
  settings: Pick<CollectionSettings, 'itemRarities' | 'systemPresetId'>,
  presets: readonly SystemPreset[],
): readonly RarityOption[] {
  return parseItemRarities(settings.itemRarities) ?? systemItemRarities(settings, presets);
}

/** Whether two lists offer the same words, in the same order and tones. */
export function sameItemRarities(a: readonly RarityOption[], b: readonly RarityOption[]): boolean {
  return a.length === b.length && a.every((option, i) => option.name === b[i]!.name && option.tone === b[i]!.tone);
}

/** What the collection stores after an edit of its words: `next`, or nothing while it equals its system's. */
export function editedItemRarities(next: readonly RarityOption[], system: readonly RarityOption[]): RarityOption[] | undefined {
  return sameItemRarities(next, system) ? undefined : next.map((option) => ({ ...option }));
}
