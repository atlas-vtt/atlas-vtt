import { useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { useStableCallback } from './useStableCallback';
import { areaOf, type PanelArea } from './useDraggablePosition';

/** The edges a panel can be resized by: its right edge, its bottom edge or the corner between them. */
export type ResizeEdge = 'right' | 'bottom' | 'corner';

interface PanelResizeOptions {
  /** Smallest size the panel can be dragged to. */
  min: PanelArea;
  /** Called once a resize ends, with the size the panel came to rest at. */
  onResizeEnd: (size: PanelArea) => void;
  /** Least distance kept between the panel and the edges of its area. */
  margin?: number;
  /**
   * Content held at its size while the pointer moves and sized once on release: the panel clips it
   * as it shrinks. For content whose relayout costs more than a frame, such as a page in a frame.
   */
  held?: RefObject<HTMLElement | null>;
}

/**
 * Resizes a floating panel by its right edge, bottom edge or bottom-right
 * corner. The panel keeps its top-left corner and stays inside its offset
 * parent. Like dragging, the size is set on the element while the pointer
 * moves and reported once when it is released.
 */
export function usePanelResize(
  panelRef: RefObject<HTMLElement | null>,
  { min, onResizeEnd, margin = 8, held }: PanelResizeOptions,
): (edge: ResizeEdge) => (event: ReactPointerEvent) => void {
  const notifyResizeEnd = useStableCallback(onResizeEnd);

  return useCallback((edge: ResizeEdge) => (event: ReactPointerEvent): void => {
    const panel = panelRef.current;
    if (!panel || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const win = panel.win;
    const area = areaOf(panel);
    const max = {
      width: Math.max(min.width, area.width - panel.offsetLeft - margin),
      height: Math.max(min.height, area.height - panel.offsetTop - margin),
    };
    const start = { x: event.clientX, y: event.clientY, width: panel.offsetWidth, height: panel.offsetHeight };
    // The pointer that pressed resizes the panel; a second finger laid down meanwhile does not
    const { pointerId } = event;
    let size = { width: start.width, height: start.height };
    panel.classList.add('is-resizing');
    const content = held?.current;
    if (content) {
      content.style.width = `${content.offsetWidth}px`;
      content.style.height = `${content.offsetHeight}px`;
    }

    const onMove = (move: PointerEvent): void => {
      if (move.pointerId !== pointerId) return;
      size = {
        width: edge === 'bottom' ? start.width : Math.min(max.width, Math.max(min.width, start.width + move.clientX - start.x)),
        height: edge === 'right' ? start.height : Math.min(max.height, Math.max(min.height, start.height + move.clientY - start.y)),
      };
      panel.style.width = `${size.width}px`;
      panel.style.height = `${size.height}px`;
    };
    const onUp = (up: PointerEvent): void => {
      if (up.pointerId !== pointerId) return;
      win.removeEventListener('pointermove', onMove);
      win.removeEventListener('pointerup', onUp);
      win.removeEventListener('pointercancel', onUp);
      panel.classList.remove('is-resizing');
      content?.style.removeProperty('width');
      content?.style.removeProperty('height');
      if (size.width !== start.width || size.height !== start.height) notifyResizeEnd(size);
    };
    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', onUp);
    win.addEventListener('pointercancel', onUp);
  }, [panelRef, min.width, min.height, margin, held, notifyResizeEnd]);
}
