import type { ContextMenuEntry } from '../react/components/context-menu/AtlasContextMenu';
import type { ViewAtlasStore } from '../storeFactory';
import type { NotePin } from '../types';
import { t } from '../i18n';
import { pinNameEntries } from './pinNameMenu';
import { pinOpenLook } from './pinOpenLook';
import { readablePinEntry } from './pinReadableMenu';
import { dispatchPinAction } from './utils/pinActions';

/** The rows of a pin's context menu; the level its scene opens on is added when the menu opens (`openPinMenu`). */
export function pinMenuEntries(store: ViewAtlasStore, pin: NotePin): ContextMenuEntry[] {
  return [
    { type: 'item', ...pinOpenLook(pin), onClick: () => dispatchPinAction('open', pin, store) },
    { type: 'item', label: t('pinMenu.edit'), icon: 'edit', onClick: () => dispatchPinAction('edit', pin, store) },
    ...[readablePinEntry(store, pin)].filter((entry) => entry !== null),
    ...pinNameEntries(store, pin),
    { type: 'item', label: t('common.duplicate'), icon: 'files', onClick: () => store.getState().duplicateMapObjects([pin.id]) },
    { type: 'item', label: t('common.delete'), icon: 'trash', destructive: true, onClick: () => store.getState().deleteMapObject('pin', pin.id) },
  ];
}
