import type { ContextMenuEntry } from '../react/components/context-menu/AtlasContextMenu';
import type { ViewAtlasStore } from '../storeFactory';
import type { NotePin } from '../types';
import { t } from '../i18n';
import { linkName, MAX_PIN_NAME, ownPinName } from '../tools/pinNames';
import { promptForText } from '../ui/textInputDialog';
import { runInBackground } from '../utils/backgroundTask';

/** Asks for the pin's name, its note's as the placeholder: an emptied name names the pin by its note again. A named pin shows its name. */
async function renamePin(store: ViewAtlasStore, pin: NotePin): Promise<void> {
  const typed = await promptForText({
    title: t('pinMenu.renameTitle'),
    confirmLabel: t('common.save'),
    initialValue: ownPinName(pin) ?? '',
    placeholder: linkName(pin.notePath),
    allowEmpty: true,
  });
  if (typed === null) return;
  const name = typed.slice(0, MAX_PIN_NAME);
  store.getState().updateNotePin(pin.id, { name: name === '' ? undefined : name, showName: true });
}

/** The pin menu's switch that shows the pin's name on the map, and the row that names it. */
export function pinNameEntries(store: ViewAtlasStore, pin: NotePin): ContextMenuEntry[] {
  const shown = pin.showName === true;
  return [
    {
      type: 'item',
      label: t('pinMenu.showName'),
      icon: 'tag',
      checked: shown,
      onClick: () => store.getState().updateNotePin(pin.id, { showName: shown ? undefined : true }),
    },
    {
      type: 'item',
      label: t('pinMenu.rename'),
      icon: 'pencil',
      onClick: () => runInBackground(renamePin(store, pin), 'Renaming a pin'),
    },
  ];
}
