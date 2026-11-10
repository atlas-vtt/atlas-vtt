import { t } from '../i18n';
import type { RarityOption } from '../types/randomTableTypes';
/**
 * The classic item-rarity ladder games colour loot by. An item's own rarity
 * names map onto it, so a Rarity property can use the words its system uses.
 */
export const RARITY_TONES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

export type RarityTone = typeof RARITY_TONES[number];

export const RARITY_LABELS: Record<RarityTone, string> = {
  common: t('loot.rarity.common'),
  uncommon: t('loot.rarity.uncommon'),
  rare: t('loot.rarity.rare'),
  epic: t('loot.rarity.epic'),
  legendary: t('loot.rarity.legendary'),
};

const TONES: ReadonlyArray<readonly [RegExp, RarityTone]> = [
  [/^(common|poor|mundane|junk)$/i, 'common'],
  [/^uncommon$/i, 'uncommon'],
  [/^rare$/i, 'rare'],
  [/^(epic|very rare)$/i, 'epic'],
  [/^(legendary|artifact|artefact|mythic|unique)$/i, 'legendary'],
];

/** A rarity as written, without Markdown emphasis or surrounding space. */
function rarityName(rarity: string | undefined): string {
  return rarity?.replace(/[*_]/g, '').trim() ?? '';
}

/** The tone to colour an item by, or undefined for a rarity outside the ladder. */
export function rarityTone(rarity: string | undefined): RarityTone | undefined {
  const name = rarityName(rarity);
  if (!name) return undefined;
  return TONES.find(([pattern]) => pattern.test(name))?.[1];
}

/** The word of `options` an item's rarity is, whatever its case; undefined for a rarity the collection does not name. */
export function rarityOptionOf(rarity: string | undefined, options: readonly RarityOption[]): RarityOption | undefined {
  const name = rarityName(rarity).toLowerCase();
  return name ? options.find((option) => option.name.toLowerCase() === name) : undefined;
}

/**
 * The tone to colour an item by in a collection: the tone its own word for the rarity is
 * painted in (none, when the GM chose none), else the ladder's reading of it.
 */
export function rarityToneIn(rarity: string | undefined, options: readonly RarityOption[]): RarityTone | undefined {
  const option = rarityOptionOf(rarity, options);
  return option ? option.tone ?? undefined : rarityTone(rarity);
}

export function isRarityTone(value: unknown): value is RarityTone {
  return RARITY_TONES.some((tone) => tone === value);
}
