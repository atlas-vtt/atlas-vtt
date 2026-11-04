import type { TutorialStep } from './Tutorial';
import lootBaseImage from '../assets/tutorials/loot-base.webp';
import lootItemNoteImage from '../assets/tutorials/loot-item-note.webp';
import lootPlayerViewImage from '../assets/tutorials/loot-player-view.webp';
import { t } from '../i18n';

/**
 * The loot tours: the Loot tab of the collection settings, the loot roller the
 * first time it has items, and the first roll. Each shows once; Atlas'
 * settings replay them.
 */

export const LOOT_TUTORIAL_LABEL = t('tour.loot.label');

export const LOOT_SETTINGS_STEPS: TutorialStep[] = [
  {
    title: t('tour.loot.notesTitle'),
    body: t('tour.loot.notesBody'),
    image: { src: lootBaseImage, alt: t('tour.loot.notesAlt') },
  },
  {
    title: t('tour.loot.propsTitle'),
    body: t('tour.loot.propsBody'),
    image: { src: lootItemNoteImage, alt: t('tour.loot.propsAlt') },
  },
  {
    title: t('tour.loot.basesTitle'),
    body: t('tour.loot.basesBody'),
    selector: '.atlas-csm-loot-bases',
  },
  {
    title: t('tour.loot.currencyTitle'),
    body: t('tour.loot.currencyBody'),
    selector: '.atlas-csm-loot-currency',
  },
];

/** The loot roller's tour; the rarity step only while the items name rarities. */
export function lootRollerSteps(hotkey: string, hasRarities: boolean): TutorialStep[] {
  return [
    {
      title: t('tour.loot.pickTitle'),
      body: t('tour.loot.pickBody'),
      selector: '.atlas-loot-roller__sidebar',
    },
    ...(hasRarities ? [{
      title: t('tour.loot.rarityTitle'),
      body: t('tour.loot.rarityBody'),
      selector: '.atlas-loot-rarities',
    }] : []),
    {
      title: t('tour.loot.rollTitle'),
      body: t('tour.loot.rollBody', { hotkey }),
      selector: '.atlas-loot-rollbar__actions',
    },
    {
      title: t('tour.loot.historyTitle'),
      body: t('tour.loot.historyBody'),
      selector: '.atlas-loot-pane-tabs',
    },
  ];
}

export const LOOT_RESULT_STEPS: TutorialStep[] = [
  {
    title: t('tour.loot.readTitle'),
    body: t('tour.loot.readBody'),
    selector: '.atlas-loot-list .atlas-loot-card',
  },
  {
    title: t('tour.loot.handTitle'),
    body: t('tour.loot.handBody'),
    selector: '.atlas-loot-list .atlas-loot-card__show',
    image: { src: lootPlayerViewImage, alt: t('tour.loot.handAlt') },
  },
  {
    title: t('tour.loot.openTitle'),
    body: t('tour.loot.openBody'),
    selector: '.atlas-loot-list .atlas-loot-card__source',
  },
];
