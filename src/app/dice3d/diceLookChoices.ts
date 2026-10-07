/** The dice looks the GM can choose in the dice settings: Atlas's own first, then the extensions' looks. */

import { t } from '../i18n';
import { customLooks } from './customLooks';

export interface DiceLookChoice {
  /** The full id stored in the settings; empty for Atlas's own look. */
  value: string;
  label: string;
  /** An image of the look, for an extension's look that gives one. */
  preview: string | null;
  /** False for a stored choice whose extension is not loaded: Atlas's own look shows meanwhile. */
  loaded: boolean;
}

/** Every look to choose from, with `stored` (the setting) listed as not loaded when no extension has it registered. */
export function diceLookChoices(stored: string): DiceLookChoice[] {
  const looks = customLooks();
  const choices: DiceLookChoice[] = [{ value: '', label: t('dice.look.atlas'), preview: null, loaded: true }];
  for (const look of looks) choices.push({ value: look.id, label: look.name, preview: look.preview, loaded: true });
  if (stored !== '' && !looks.some((look) => look.id === stored)) {
    choices.push({ value: stored, label: t('dice.look.notLoaded', { id: stored }), preview: null, loaded: false });
  }
  return choices;
}
