import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { useStableCallback } from './useStableCallback';

export interface PanelPosition {
  x: number;
  y: number;
}

export interface PanelArea {
  width: number;
  height: number;
}

/** Where a panel first appears, or how to place it once its area and size are known. */
export type InitialPanelPosition = PanelPosition | ((area: PanelArea, panel: PanelArea) => PanelPosition);

interface DraggablePositionOptions {
  /** Called once a drag that moved the panel ends, with the position it came to rest at. */
  onDragEnd?: (position: PanelPosition) => void;
  /** Least distance kept between the panel and the edges of its area. */
  margin?: number;
  /** Read when a drag starts: where the panel is now, for a panel that sits in flow until it is first moved. */
  measureStart?: (panel: HTMLElement) => PanelPosition | null;
}

export interface DraggablePosition {
  position: PanelPosition;
  /** Attach to the panel; its offset parent is the area it stays within. */
  panelRef: RefObject<HTMLDivElement | null>;
  /** Put on the drag handle's `onPointerDown`; presses on buttons inside it don't drag. */
  startDrag: (event: ReactPointerEvent) => void;
  isDragging: boolean;
}

/** The area a panel moves in: its offset parent, or the window for a fixed panel. */
export function areaOf(panel: HTMLElement): PanelArea {
  const parent = panel.offsetParent;
  if (parent instanceof HTMLElement) return { width: parent.clientWidth, height: parent.clientHeight };
  return { width: panel.win.innerWidth, height: panel.win.innerHeight };
}

function clampToArea(panel: HTMLElement, position: PanelPosition, margin: number): PanelPosition {
  const area = areaOf(panel);
  const maxX = Math.max(margin, area.width - panel.offsetWidth - margin);
  const maxY = Math.max(margin, area.height - panel.offsetHeight - margin);
  return {
    x: Math.min(Math.max(position.x, margin), maxX),
    y: Math.min(Math.max(position.y, margin), maxY),
  };
}

function place(panel: HTMLElement, position: PanelPosition): void {
  panel.style.left = `${position.x}px`;
  panel.style.top = `${position.y}px`;
}

/**
 * Position of a floating panel the user moves by its header. The panel is
 * placed with `left`/`top` and kept inside its area when it mounts, when a
 * drag ends and when the window resizes. While dragging, the panel moves
 * without re-rendering; the position is committed once the drag ends.
 */
export function useDraggablePosition(initial: InitialPanelPosition, { onDragEnd, margin = 8, measureStart }: DraggablePositionOptions = {}): DraggablePosition {
  const [position, setPositionState] = useState<PanelPosition>(() => (typeof initial === 'function' ? { x: 0, y: 0 } : initial));
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef(position);
  const initialRef = useRef(initial);
  const measureStartRef = useRef(measureStart);
  measureStartRef.current = measureStart;
  const notifyDragEnd = useStableCallback((settled: PanelPosition): void => onDragEnd?.(settled));

  const setPosition = useCallback((next: PanelPosition): void => {
    positionRef.current = next;
    setPositionState(next);
  }, []);

  const clamp = useCallback((): void => {
    const panel = panelRef.current;
    if (!panel) return;
    const clamped = clampToArea(panel, positionRef.current, margin);
    if (clamped.x !== positionRef.current.x || clamped.y !== positionRef.current.y) setPosition(clamped);
  }, [margin, setPosition]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const start = initialRef.current;
    if (panel && typeof start === 'function') {
      setPosition(start(areaOf(panel), { width: panel.offsetWidth, height: panel.offsetHeight }));
    }
    clamp();
  }, [clamp, setPosition]);

  useEffect(() => {
    const win = panelRef.current?.win ?? window;
    win.addEventListener('resize', clamp);
    return () => win.removeEventListener('resize', clamp);
  }, [clamp]);

  const startDrag = useCallback((event: ReactPointerEvent): void => {
    const panel = panelRef.current;
    if (!panel || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button, input, select, textarea')) return;
    event.preventDefault();
    const measured = measureStartRef.current?.(panel);
    if (measured) setPosition(measured);

    const win = panel.win;
    const start = { x: event.clientX, y: event.clientY, panel: positionRef.current };
    let latest = start.panel;
    setIsDragging(true);

    const onMove = (move: PointerEvent): void => {
      latest = { x: start.panel.x + move.clientX - start.x, y: start.panel.y + move.clientY - start.y };
      place(panel, latest);
    };
    const onUp = (): void => {
      win.removeEventListener('pointermove', onMove);
      win.removeEventListener('pointerup', onUp);
      win.removeEventListener('pointercancel', onUp);
      setIsDragging(false);
      const settled = clampToArea(panel, latest, margin);
      place(panel, settled);
      setPosition(settled);
      if (settled.x !== start.panel.x || settled.y !== start.panel.y) notifyDragEnd(settled);
    };
    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', onUp);
    win.addEventListener('pointercancel', onUp);
  }, [margin, setPosition, notifyDragEnd]);

  return { position, panelRef, startDrag, isDragging };
}
