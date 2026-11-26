import type { NotePin } from '../../types';
import type { PinActionEventDetail } from '../../types/atlasWindowEvents';

/** Asks the note pin tool of the view whose store holds `pin` to open or edit it, or to preview its note at `at`. */
export function dispatchPinAction(action: PinActionEventDetail['action'], pin: NotePin, store: object, at?: { x: number; y: number }): void {
  window.dispatchEvent(new CustomEvent('atlas-pin-action', { detail: { action, pin, store, ...(at && { at }) } }));
}
