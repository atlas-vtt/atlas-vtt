import { getDomHost } from '../host/dom';

/** The ResizeObserver of `node`'s own window, so an element in an Obsidian popout is observed by the popout's; null where it has none. */
export function resizeObserverOf(node: Node): { win: Window; Observer: typeof ResizeObserver } | null {
  const win = getDomHost().ownerWindow(node);
  // Obsidian's typings give `win` the plain Window type, which omits the constructors.
  const Observer = (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  return typeof Observer === 'function' ? { win, Observer } : null;
}

/**
 * Calls `onResize` whenever one of `targets` changes size. Uses the
 * ResizeObserver of the targets' own window, so it also works for elements in
 * an Obsidian popout window. Returns the function that stops observing.
 */
export function observeResize(targets: readonly Element[], onResize: () => void): () => void {
  const first = targets[0];
  const found = first ? resizeObserverOf(first) : null;
  if (!found) return () => undefined;

  const observer = new found.Observer(onResize);
  for (const target of targets) observer.observe(target);
  return () => observer.disconnect();
}
