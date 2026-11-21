/** What Obsidian itself opens over the table (settings, its command palette, a menu): keys typed there are its own. */
const OBSIDIAN_OVERLAYS = '.modal-container, .prompt, .suggestion-container, .menu';
const KEY_EVENTS = ['keydown', 'keyup', 'keypress', 'copy', 'cut', 'paste'] as const;

/**
 * Stops keys on their way to the map while it is in Table mode, so none of its shortcuts runs on
 * the players' picture: no tool, no delete, no paste, no undo. Heard on the window in the capture
 * phase, before the map's own listeners. Returns what lets keys through again.
 */
export function blockTableKeys(win: Window): () => void {
  const stop = (event: Event): void => {
    const node = event.target as Node | null;
    const element = node && typeof node.instanceOf === 'function' && node.instanceOf(Element) ? node : null;
    if (element?.closest(OBSIDIAN_OVERLAYS)) return;
    event.stopImmediatePropagation();
  };
  for (const type of KEY_EVENTS) win.addEventListener(type, stop, true);
  return () => {
    for (const type of KEY_EVENTS) win.removeEventListener(type, stop, true);
  };
}
