/** Suppress the compatibility click from one dragged pointer, including outside the strip. */
export function sceneTabDragClick(doc: Document, pointerId: number): { suppress(event: MouseEvent): void; dispose(): void } {
  let active = true;
  const dispose = (): void => {
    active = false;
    doc.removeEventListener('click', suppress, true);
    doc.removeEventListener('pointerdown', dispose, true);
  };
  const suppress = (event: MouseEvent): void => {
    // Keyboard activation has detail zero. A different pointer belongs to another gesture.
    if (!active || !event.detail || ('pointerId' in event && event.pointerId !== pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    dispose();
  };
  doc.addEventListener('click', suppress, true);
  doc.addEventListener('pointerdown', dispose, true);
  return { suppress, dispose };
}
