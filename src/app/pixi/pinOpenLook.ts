import type { NotePin } from '../types';
import { isEncounterFolderLink } from '../links/atlasLinkTargets';
import { t } from '../i18n';

/** What opening `pin` does, as its menus name it: open its note or scene, or roll one of its folder's encounters. */
export function pinOpenLook(pin: Pick<NotePin, 'notePath'>): { label: string; icon: string } {
  return isEncounterFolderLink(pin.notePath)
    ? { label: t('pinMenu.rollEncounter'), icon: 'dices' }
    : { label: t('pinMenu.open'), icon: 'file-text' };
}
