import { getDomHost } from '../host/dom';
/**
 * Calls `onResize` whenever one of `targets` changes size. Uses the
 * ResizeObserver of the targets' own window, so it also works for elements in
 * an Obsidian popout window. Returns the function that stops observing.
 */
export function observeResize(targets: readonly Element[], onResize: () => void): () => void {
  const first = targets[0];
  if (!first) return () => undefined;
  // Obsidian's typings give `win` the plain Window type, which omits the constructors.
  const Observer = (getDomHost().ownerWindow(first) as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  if (typeof Observer !== 'function') return () => undefined;

  const observer = new Observer(onResize);
  for (const target of targets) observer.observe(target);
  return () => observer.disconnect();
}
