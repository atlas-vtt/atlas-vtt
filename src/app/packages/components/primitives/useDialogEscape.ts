import { useEffect, type RefObject } from 'react';

/**
 * Calls `onEscape` for Escape anywhere in the dialog's window, captured on the
 * document so it works wherever focus is and never reaches dialogs underneath.
 */
export function useDialogEscape(dialogRef: RefObject<HTMLElement | null>, onEscape: (() => void) | undefined): void {
  useEffect(() => {
    const doc = dialogRef.current?.ownerDocument;
    if (!onEscape || !doc) return undefined;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onEscape();
    };
    doc.addEventListener('keydown', handleKeyDown, true);
    return (): void => doc.removeEventListener('keydown', handleKeyDown, true);
  }, [dialogRef, onEscape]);
}
