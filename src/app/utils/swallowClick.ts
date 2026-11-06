/**
 * The click a browser sends after a drag's release would press what the drag began on (switch
 * to a tab, open a menu, roll a statblock's dice): a drag is no click. Where the release sends
 * no click, the next click is not lost.
 */
export function swallowNextClick(win: Window): void {
  const swallow = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
  };
  win.addEventListener('click', swallow, { capture: true, once: true });
  win.setTimeout(() => win.removeEventListener('click', swallow, { capture: true }), 0);
}

/**
 * For a drag ended while its button is still held (Escape): the release that follows is no
 * click either. A press that comes first means the release was lost, and the next click is
 * the user's again.
 */
export function swallowClickAfterRelease(win: Window, pointerId: number): void {
  const forget = (): void => {
    win.removeEventListener('pointerup', onRelease, { capture: true });
    win.removeEventListener('pointerdown', forget, { capture: true });
  };
  const onRelease = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    forget();
    swallowNextClick(win);
  };
  win.addEventListener('pointerup', onRelease, { capture: true });
  win.addEventListener('pointerdown', forget, { capture: true });
}
