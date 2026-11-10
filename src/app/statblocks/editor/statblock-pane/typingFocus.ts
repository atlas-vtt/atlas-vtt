/**
 * Focus for the value a new statblock opens with (§12.2). Obsidian focuses the
 * note's editor as the leaf becomes active, which can land after the panel has
 * opened the value's input; for a moment the input takes focus back, so the
 * first key typed goes into the value and never into the note or nowhere.
 */

/** The input of the value being edited in `card`, if one is open. */
export function editingInput(card: HTMLElement): HTMLInputElement | HTMLTextAreaElement | null {
  return card.querySelector<HTMLInputElement | HTMLTextAreaElement>('.atlas-sb-pane-editor input, .atlas-sb-pane-editor textarea');
}

/** How long after opening the input it keeps focus against the leaf's own focusing, in ms. */
export const HOLD_MS = 600;

/**
 * Keeps focus in the input being opened for `HOLD_MS`: an input that lost it is
 * focused again, and one that closed (its blur ended the edit) is opened again
 * through `reopen`. A key the user presses ends the hold. Returns the stop.
 */
export function holdTypingFocus(card: HTMLElement, reopen: () => void): () => void {
  const doc = card.ownerDocument;
  const win = doc.defaultView ?? window;
  const timers: number[] = [];
  let frame = 0;
  const restore = (): void => {
    if (!card.isConnected) return;
    const input = editingInput(card);
    if (!input) {
      reopen();
      frame = win.requestAnimationFrame(() => editingInput(card)?.focus());
      return;
    }
    // Any input of the open block keeps it: a line of several values opens on the one asked for.
    if (!input.closest('.atlas-sb-pane-editor')?.contains(doc.activeElement)) input.focus();
  };
  const stop = (): void => {
    for (const timer of timers) win.clearTimeout(timer);
    win.cancelAnimationFrame(frame);
    doc.removeEventListener('keydown', stop, true);
    doc.removeEventListener('pointerdown', stop, true);
  };
  frame = win.requestAnimationFrame(restore);
  for (const ms of [60, 200, HOLD_MS]) timers.push(win.setTimeout(restore, ms));
  timers.push(win.setTimeout(stop, HOLD_MS + 1));
  doc.addEventListener('keydown', stop, true);
  doc.addEventListener('pointerdown', stop, true);
  return stop;
}
