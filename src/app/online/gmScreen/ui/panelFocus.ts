const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The controls of `panel` that take the focus now, in the order Tab reaches them: none inside a part that is `inert`. */
function focusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((control) => control.closest('[inert]') === null);
}

/** Moves the focus to the next control of `panel` (the one before, `backwards`), round from its last to its first; into it from outside. */
export function focusAround(panel: HTMLElement, backwards: boolean): void {
  const controls = focusables(panel);
  if (controls.length === 0) return;
  const at = controls.indexOf(panel.ownerDocument.activeElement as HTMLElement);
  const step = backwards ? -1 : 1;
  const next = at === -1 ? (backwards ? controls.length - 1 : 0) : (at + step + controls.length) % controls.length;
  controls[next]?.focus();
}
