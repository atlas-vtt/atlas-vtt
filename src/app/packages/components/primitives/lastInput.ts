/** What the user last used: a pointer of some kind, or the keyboard. */
export type InputKind = 'mouse' | 'pen' | 'touch' | 'key';

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
 * given back to a button, say) can tell a finger's from a mouse's; returns the function that stops it. A touch never
 * sends a pointer event of another kind, so a mouse attached to a tablet is heard as soon as it moves.
 */
export function watchInput(doc: Document): () => void {
  const onPointer = (event: PointerEvent): void => {
    lastPointer = pointerKind(event);
    last = lastPointer;
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
  };
}
