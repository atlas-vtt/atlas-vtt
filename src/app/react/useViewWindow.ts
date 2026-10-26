import { useEffect, useState } from 'react';

/**
 * The window `el` lives in, updated when Obsidian moves it to another one (a tab dragged into a
 * popout, or back). Listeners for a view's keys and pointer belong on this window: the main
 * window hears nothing of a popout. Without an element, the main window.
 */
export function useViewWindow(el: HTMLElement | null | undefined): Window {
  const [win, setWin] = useState<Window>(() => el?.win ?? window);
  useEffect(() => {
    if (!el) return undefined;
    setWin(el.win);
    return el.onWindowMigrated(setWin);
  }, [el]);
  return win;
}
