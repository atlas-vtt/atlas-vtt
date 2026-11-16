import { useEffect, type RefObject } from 'react';
import { isShortcutScopeActive } from '../../../../utils/activeLeafGuard';

/** Escape closes the creator and Mod+Enter saves it, unless a menu, list or dialog inside it takes the key. */
export function useCreatorKeys(windowRef: RefObject<HTMLElement | null>, isOpen: boolean, isSubmitting: boolean, onClose: () => void, onSubmit: () => Promise<void>): void {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!isShortcutScopeActive(windowRef.current)) return;
      // Let an open menu consume Escape before the importer handles it.
      if (e.key === 'Escape' && windowRef.current?.querySelector('[aria-haspopup="menu"][aria-expanded="true"]')) return;
      // A dialog or list inside the window (a note being edited) takes its own Escape.
      if (e.key === 'Escape' && e.target instanceof Element && e.target.closest('[role="dialog"] [role="dialog"], [role="listbox"], .atlas-ctx-menu')) return;
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void onSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [windowRef, isOpen, onClose, onSubmit, isSubmitting]);
}
