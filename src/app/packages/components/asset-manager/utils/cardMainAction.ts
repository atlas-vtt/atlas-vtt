import type { AnyAsset } from '../types';
import { t } from '../../../../i18n';

type AssetType = AnyAsset['type'];

/** The card's main action (double-click, Enter), told on hover and focus so it is found outside the menu. */
const HOVER_HINT: Readonly<Record<AssetType, () => string>> = {
  tokens: () => t('am.card.hint.spawn'),
  encounters: () => t('am.card.hint.spawn'),
  scenes: () => t('am.card.hint.open'),
  maps: () => t('am.card.hint.openScene'),
};

/** The same action told in the selection chip while one card is selected, with the key that runs it. */
const SELECTED_HINT: Readonly<Record<AssetType, () => string>> = {
  tokens: () => t('am.selection.spawn'),
  encounters: () => t('am.selection.spawn'),
  scenes: () => t('am.selection.openScene'),
  maps: () => t('am.selection.openMapScene'),
};

/** What double-clicking a card of `type` does, for its hover card. */
export function cardActionHint(type: AssetType): string {
  return HOVER_HINT[type]();
}

/** "1 selected · Enter to spawn on map": the selection chip's text for one selected card of `type`. */
export function selectedCardAction(type: AssetType): string {
  return SELECTED_HINT[type]();
}
