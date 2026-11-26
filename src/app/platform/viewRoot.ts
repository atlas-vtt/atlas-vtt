/** Obsidian's own header of a view: navigation, the file's name and the view's menu. */
const VIEW_HEADER = 'view-header';

/**
 * Empties the leaf content a view takes over as its root. On desktop Obsidian's view header goes
 * with the rest: the tab strip holds what it offers, and Atlas' own button the view's actions.
 * On mobile the header stays (`keepHeader`): navigation, the sidebars and the view's menu have
 * no other place there.
 */
export function emptyViewRoot(root: HTMLElement, keepHeader: boolean): void {
  if (!keepHeader) {
    root.empty();
    return;
  }
  for (const child of Array.from(root.children)) {
    if (!child.classList.contains(VIEW_HEADER)) child.remove();
  }
}
