/**
 * Puts back a container around `view` that was scrolled although it shows no scrollbar
 * (`overflow: hidden`). Such a container is never meant to scroll, but focusing a field that
 * pokes past its edge scrolls it anyway (a dialog still animating in, a panel dragged half out),
 * and the whole view then stayed shifted, a strip of the window showing beside it, until a reload.
 * Hand it the target of a `scroll` event heard on the view's document in the capture phase.
 */
export function keepViewInPlace(target: EventTarget | null, view: HTMLElement): void {
  if (!(target instanceof Node) || !target.instanceOf(HTMLElement) || !target.contains(view)) return;
  const { overflowX, overflowY } = view.win.getComputedStyle(target);
  if (overflowX === 'hidden' && target.scrollLeft !== 0) target.scrollLeft = 0;
  if (overflowY === 'hidden' && target.scrollTop !== 0) target.scrollTop = 0;
}
