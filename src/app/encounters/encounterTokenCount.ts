import type { EncounterTokenRef } from '../services/AssetService';
import { formatRange } from '../creatures/creatureValues';
import { refsRange } from './encounterQuantity';
import { t } from '../i18n';

/** How many tokens an encounter places ("6 tokens"), a span where some are rolled ("3 – 9 tokens"). */
export function tokenCountText(refs: readonly EncounterTokenRef[]): string {
  const range = refsRange(refs);
  return range.min === range.max
    ? t('atlasLinks.tokenCount', { count: range.max })
    : t('atlasLinks.tokenRange', { count: range.max, range: formatRange(range) });
}
