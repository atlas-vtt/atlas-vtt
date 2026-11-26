import type { ContextMenuEntry } from '../react/root/ContextMenuContext';
import { t } from '../i18n';

/**
 * A preview asked for from a menu's Preview row, where Mod held over a pin, a token or a card
 * opens it for a mouse. No key is held for it, so it stays until a press lands outside it.
 */

/** The view event that opens the preview of a pin's note or a token's statblock at a screen point (`NotePreviewUIManager`). */
export const OPEN_PREVIEW_EVENT = 'pin-open-preview';

/** The menu row that opens a preview. */
export function previewEntry(open: () => void): ContextMenuEntry {
  return { type: 'item', label: t('preview.show'), icon: 'eye', onClick: open };
}

/**
 * Calls `onOutside` at the first press in `doc` that `isInside` does not claim, and at Escape;
 * returns what stops watching before that.
 */
export function watchPressOutside(doc: Document, isInside: (target: Node) => boolean, onOutside: () => void): () => void {
  const stop = (): void => {
    doc.removeEventListener('pointerdown', onPress, true);
    doc.removeEventListener('keydown', onKey, true);
  };
  const onPress = (event: PointerEvent): void => {
    const target = event.target as Node | null;
    if (target && isInside(target)) return;
    stop();
    onOutside();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    stop();
    onOutside();
  };
  doc.addEventListener('pointerdown', onPress, true);
  doc.addEventListener('keydown', onKey, true);
  return stop;
}
