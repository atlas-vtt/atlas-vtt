/** What the user last used: a pointer of some kind, or the keyboard. */
export type InputKind = 'mouse' | 'pen' | 'touch' | 'key';

/**
 * On the root of each watched document while the pointer last used was a finger: hover styles hold back under it
 * (`atlas-hover`, `atlas-ghost-button`). A touch screen leaves `:hover` on what was tapped last, and some report that
 * they can hover (Samsung's, which Chromium takes for a touchpad), so `@media (hover: hover)` alone lets the tint stay.
 */
export const TOUCH_ATTRIBUTE = 'data-atlas-touch';

let last: InputKind = 'mouse';
let lastPointer: Exclude<InputKind, 'key'> = 'mouse';

/** Whether the last thing the user did was done with a finger. Never, where no document is watched (`watchInput`). */
export function lastInputWasTouch(): boolean {
  return last === 'touch';
}

/** Whether the pointer last used was a finger, whatever was typed since. Never, where no document is watched (`watchInput`). */
export function lastPointerWasTouch(): boolean {
  return lastPointer === 'touch';
}

function pointerKind(event: PointerEvent): Exclude<InputKind, 'key'> {
  return event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse';
}

/**
 * Notes what is used in `doc`, press by press and move by move, so that what follows a press without being one (focus
 * given back to a button, say) can tell a finger's from a mouse's, and marks its root while a finger was last
 * (`TOUCH_ATTRIBUTE`); returns the function that stops it and takes the mark away. A touch never sends a pointer event
 * of another kind, so a mouse attached to a tablet is heard as soon as it moves.
 */
export function watchInput(doc: Document): () => void {
  const onPointer = (event: PointerEvent): void => {
    lastPointer = pointerKind(event);
    last = lastPointer;
    // Set only when it changes: a mark set again on every move would restyle the document each time.
    const touch = lastPointer === 'touch';
    if (doc.documentElement.hasAttribute(TOUCH_ATTRIBUTE) !== touch) doc.documentElement.toggleAttribute(TOUCH_ATTRIBUTE, touch);
  };
  const onKey = (): void => {
    last = 'key';
  };
  const options = { capture: true, passive: true } as const;
  doc.addEventListener('pointerdown', onPointer, options);
  doc.addEventListener('pointermove', onPointer, options);
  doc.addEventListener('keydown', onKey, options);
  return () => {
    doc.removeEventListener('pointerdown', onPointer, options);
    doc.removeEventListener('pointermove', onPointer, options);
    doc.removeEventListener('keydown', onKey, options);
    doc.documentElement.removeAttribute(TOUCH_ATTRIBUTE);
  };
}
