/** What follows a pressed pointer until it is let go. */
export interface PointerDragSteps {
  move(event: PointerEvent): void;
  /** The pointer was released, or lost (`pointercancel`): a lost one ends the drag where it is, and no click follows it. */
  end(event: PointerEvent, lost: boolean): void;
}

export interface PointerFollow {
  /**
   * Holds the pointer on the handle, so its moves arrive wherever it goes. For a press that may
   * still be a click, call it only once the press has become a drag: the click of a captured
   * pointer goes to the handle, not to what was pressed.
   */
  capture(): void;
  /** Stops following at once, without telling the steps: for a handle that goes away mid-drag. */
  stop(): void;
}

/**
 * Follows the pointer that pressed `handle` (`down`), be it a mouse, a finger or a pen, and tells
 * `steps` of its moves and of its end. Other pointers that touch meanwhile are not heard. Listens
 * on the handle's own document, so a popout drags too. The handle needs `touch-action: none`, or
 * the browser takes a finger's drag for a scroll and cancels it.
 */
export function followPointer(handle: HTMLElement, down: PointerEvent, steps: PointerDragSteps): PointerFollow {
  const doc = handle.ownerDocument;
  const { pointerId } = down;
  let done = false;
  const stop = (): void => {
    if (done) return;
    done = true;
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerup', onUp);
    doc.removeEventListener('pointercancel', onCancel);
    if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
  };
  const onMove = (event: PointerEvent): void => {
    if (event.pointerId === pointerId) steps.move(event);
  };
  const finish = (event: PointerEvent, lost: boolean): void => {
    if (event.pointerId !== pointerId) return;
    stop();
    steps.end(event, lost);
  };
  const onUp = (event: PointerEvent): void => finish(event, false);
  const onCancel = (event: PointerEvent): void => finish(event, true);
  doc.addEventListener('pointermove', onMove);
  doc.addEventListener('pointerup', onUp);
  doc.addEventListener('pointercancel', onCancel);
  return {
    capture: (): void => {
      if (done) return;
      try {
        handle.setPointerCapture?.(pointerId);
      } catch {
        // A pointer the browser no longer knows: the document's listeners still follow it.
      }
    },
    stop,
  };
}

/**
 * A finger is held by the element it touched: that element hears all its moves, and no other
 * element hears it come. Lets go of that hold, so the elements the finger moves onto get their
 * `pointerenter` as under a mouse. For drags that land on what the pointer enters (a die on
 * another die, a resource on another socket). A mouse is held by nothing, so nothing changes for it.
 */
export function releaseImplicitCapture(event: { pointerId: number; target: EventTarget | null }): void {
  // Asked of the target itself: an element of a popout window is no `Element` of this one
  const target = event.target as Partial<Pick<Element, 'hasPointerCapture' | 'releasePointerCapture'>> | null;
  if (target?.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture?.(event.pointerId);
}
