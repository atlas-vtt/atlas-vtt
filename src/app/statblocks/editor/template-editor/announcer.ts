import { useCallback, useState } from 'react';

/** Alternates at the end of a message said twice in a row, so assistive technology reads it again. */
const REPEAT_MARK = ' ';

export interface Announcer {
  /** What the polite live region holds now. */
  said: string;
  announce: (text: string | undefined) => void;
}

/**
 * The template editor's announcements (§7.7): "Deleted Speed. Press Cmd+Z to
 * undo.", "Moved Armor class to section Defenses, position 2 of 3." They go to
 * a polite live region the editor renders inside its view, so a popout's
 * screen reader hears them in its own document.
 */
export function useAnnouncer(): Announcer {
  const [said, setSaid] = useState('');
  const announce = useCallback((text: string | undefined): void => {
    if (!text) return;
    setSaid((previous) => (previous === text ? `${text}${REPEAT_MARK}` : text));
  }, []);
  return { said, announce };
}
