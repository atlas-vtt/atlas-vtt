import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether the linked note holds the keys: while it does, nothing it types reaches the canvas's hotkeys,
 * and Escape hands focus back to the screen. A click in the note takes them, a click elsewhere gives them back.
 */
export function useNoteFocus(isOpen: boolean, screenRef: RefObject<HTMLDivElement | null>): [boolean, (focused: boolean) => void] {
  const [isNoteFocused, setIsNoteFocused] = useState(false);

  useEffect(() => {
    if (!isOpen) setIsNoteFocused(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isNoteFocused) return;

    const notesSection = document.querySelector('.atlas-dm-notes-section');
    if (!notesSection) return;

    const stopKeyPropagation = (e: KeyboardEvent): void => {
      e.stopPropagation();

      if (e.type === 'keydown' && e.key === 'Escape') {
        e.preventDefault();

        // Give CodeMirror time to finish processing before unfocusing
        window.setTimeout(() => {
          setIsNoteFocused(false);
          screenRef.current?.focus();
        }, 50);
      }
    };

    notesSection.addEventListener('keydown', stopKeyPropagation as EventListener);
    notesSection.addEventListener('keyup', stopKeyPropagation as EventListener);
    notesSection.addEventListener('keypress', stopKeyPropagation as EventListener);

    return () => {
      notesSection.removeEventListener('keydown', stopKeyPropagation as EventListener);
      notesSection.removeEventListener('keyup', stopKeyPropagation as EventListener);
      notesSection.removeEventListener('keypress', stopKeyPropagation as EventListener);
    };
  }, [isOpen, isNoteFocused, screenRef]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;

      // Clicks on statblocks leave the focus as it is, and render nothing
      if (target.closest('.compact-statblock')) return;

      const notesSection = document.querySelector('.atlas-dm-notes-section');
      const noteContent = document.querySelector('.atlas-dm-note-content');

      if (notesSection?.contains(target) || noteContent?.contains(target)) {
        setIsNoteFocused(true);
      } else if (screenRef.current?.contains(target)) {
        setIsNoteFocused(false);
      }
    };

    // Capture, so this runs before other handlers
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [isOpen, screenRef]);

  return [isNoteFocused, setIsNoteFocused];
}
