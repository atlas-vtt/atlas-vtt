import { useEffect, useState } from 'react';

/** A view in a tab behind another is `display: none`; its tour waits until the tab comes to the front. */
export function isOnScreen(root: HTMLElement): boolean {
  return root.isConnected && root.checkVisibility();
}

/** A fact about a view's DOM that no store holds (online play mounts its controls itself), read twice a second. */
export function useWatched(root: HTMLElement | null, read: (root: HTMLElement) => boolean): boolean {
  const [value, setValue] = useState(() => root !== null && read(root));
  useEffect(() => {
    const check = (): void => setValue(root !== null && read(root));
    check();
    const timer = window.setInterval(check, 500);
    return () => window.clearInterval(timer);
  }, [root, read]);
  return value;
}
