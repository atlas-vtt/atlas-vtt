import { useEffect, type RefObject } from 'react';

/**
 * Calls `onEscape` for Escape anywhere in the dialog's window, captured on the
 * document so it works wherever focus is and never reaches dialogs underneath.
 * An open list keeps its Escape: pressed in a combobox whose list is open, or in
 * a listbox, the key closes that list and leaves the dialog open.
 */
export function useDialogEscape(dialogRef: RefObject<HTMLElement | null>, onEscape: (() => void) | undefined): void {
  useEffect(() => {
    const doc = dialogRef.current?.ownerDocument;
    if (!onEscape || !doc) return undefined;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const target = event.target as Partial<Element> | null;
      if (target?.closest?.('[role="combobox"][aria-expanded="true"], [role="listbox"]')) return;
      event.preventDefault();
      event.stopPropagation();
      onEscape();
    };
    doc.addEventListener('keydown', handleKeyDown, true);
    return (): void => doc.removeEventListener('keydown', handleKeyDown, true);
  }, [dialogRef, onEscape]);
}
