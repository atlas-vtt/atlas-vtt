import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { t } from '../../../i18n';

/** How long clicks and keys must rest before the tray says what it holds. */
export const ANNOUNCE_REST_MS = 500;

/** A timeout set on the tray's own window (a popout has its own). */
interface WindowTimer {
  win: Window;
  id: number;
}

function cancelTimer(timer: WindowTimer | null): void {
  if (timer) timer.win.clearTimeout(timer.id);
}

/**
 * What the tray holds, said once a burst of clicks or keys has rested (never per keypress in the field):
 * `announce` after such a change, `announced` for the polite live region. `formula` reads the tray as it is then.
 */
export function useTrayAnnouncement(root: React.RefObject<HTMLElement | null>, formula: () => string): { announced: string; announce: () => void } {
  const [announced, setAnnounced] = useState('');
  const timer = useRef<WindowTimer | null>(null);
  const read = useRef(formula);
  read.current = formula;

  useEffect(() => () => cancelTimer(timer.current), []);

  const announce = (): void => {
    const win = root.current?.ownerDocument.defaultView ?? window;
    cancelTimer(timer.current);
    const id = win.setTimeout(() => {
      timer.current = null;
      const now = read.current().trim();
      setAnnounced(now === '' ? t('diceRoll.announceEmpty') : t('diceRoll.announceTray', { formula: now }));
    }, ANNOUNCE_REST_MS);
    timer.current = { win, id };
  };

  return { announced, announce };
}
