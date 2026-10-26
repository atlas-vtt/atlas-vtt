/**
 * Runs `bind` for the window `el` lives in, and again for the new one whenever Obsidian moves `el`
 * to another window (a tab dragged into a popout, or back), after undoing the previous binding.
 * Listeners on a window only hear that window, so whatever listens for a view must follow it.
 *
 * @returns Undoes the current binding and stops following.
 */
export function followWindow(el: HTMLElement, bind: (win: Window) => () => void): () => void {
  let unbind = bind(el.win);
  const stopFollowing = el.onWindowMigrated((win: Window): void => {
    unbind();
    unbind = bind(win);
  });
  return (): void => {
    stopFollowing();
    unbind();
  };
}
