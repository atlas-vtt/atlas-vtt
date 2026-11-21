import { t } from '../i18n';
import { pinNameEntries } from '../pixi/pinNameMenu';
import { pinOpenLook } from '../pixi/pinOpenLook';
import { readablePinEntry } from '../pixi/pinReadableMenu';
import { dispatchPinAction } from '../pixi/utils/pinActions';
import type { ViewAtlasStore } from '../storeFactory';
import type { NotePin } from '../types';
import { actionOf, PRIMARY_ORDER, WHOLE_SELECTION, type SelectionAction } from './selectionActions';

/**
 * What can be done with a note pin, in its menu's order. A pin is never part of a selection, so
 * its actions are its own: open what it links, edit it, who may read it, its name, a copy, and
 * its removal.
 */
export function pinActions(store: ViewAtlasStore, pin: NotePin, at?: { x: number; y: number }): SelectionAction[] {
  const readable = readablePinEntry(store, pin);
  return [
    { kind: 'run', id: 'open', enabled: true, ...pinOpenLook(pin), run: () => dispatchPinAction('open', pin, store) },
    {
      kind: 'run', id: 'edit', enabled: true, label: t('pinMenu.edit'), icon: 'edit',
      primary: { order: PRIMARY_ORDER.edit, label: t('common.edit') },
      run: () => dispatchPinAction('edit', pin, store),
    },
    // The note a held Mod shows over the pin, for a hand that holds no key
    { kind: 'run', id: 'preview', enabled: true, label: t('preview.show'), icon: 'eye', run: () => dispatchPinAction('preview', pin, store, at) },
    ...(readable ? [actionOf('readable', readable)] : []),
    ...pinNameEntries(store, pin).map((entry, index) => actionOf(index === 0 ? 'show-name' : 'rename', entry)),
    {
      kind: 'run', id: WHOLE_SELECTION.duplicate, enabled: true, label: t('common.duplicate'), icon: 'files',
      primary: { order: PRIMARY_ORDER.duplicate, label: t('common.duplicate') },
      run: () => store.getState().duplicateMapObjects([pin.id]),
    },
    {
      kind: 'run', id: WHOLE_SELECTION.delete, enabled: true, destructive: true, label: t('common.delete'), icon: 'trash',
      primary: { order: PRIMARY_ORDER.delete, label: t('common.delete') },
      run: () => store.getState().deleteMapObject('pin', pin.id),
    },
  ];
}
