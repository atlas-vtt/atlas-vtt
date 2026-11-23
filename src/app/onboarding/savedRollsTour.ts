import type { TutorialStep } from './Tutorial';
import { t } from '../i18n';

/** The saved rolls' tour, the first time their panel opens: the panel itself carries no words. */
export function savedRollsSteps(): TutorialStep[] {
  return [
    { title: t('tour.savedRolls.saveTitle'), body: t('tour.savedRolls.saveBody'), selector: '.atlas-dice-presets__form' },
    { title: t('tour.savedRolls.rowTitle'), body: t('tour.savedRolls.rowBody'), selector: '.atlas-dice-tray__dice' },
  ];
}
