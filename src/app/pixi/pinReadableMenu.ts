import type { ContextMenuEntry } from '../react/components/context-menu/AtlasContextMenu';
import type { ViewAtlasStore } from '../storeFactory';
import type { NotePin } from '../types';
import { t } from '../i18n';
import { linksReadableNote } from '../tools/pinNoteLink';

/** The pin menu's switch that lets players read the pin's note once they find it; none for a pin that links a scene. */
export function readablePinEntry(store: ViewAtlasStore, pin: NotePin): ContextMenuEntry | null {
  if (!linksReadableNote(pin)) return null;
  const readable = pin.readable === true;
  return {
    type: 'item',
    label: t('pinMenu.readable'),
    icon: 'book-open',
    checked: readable,
    onClick: () => store.getState().updateNotePin(pin.id, { readable: readable ? undefined : true }),
  };
}
