/**
 * Shared hooks for the grid alignment tabs: cursor style, canvas clicks,
 * arrow-key nudging, cursor preview and alignment preview calculation.
 */

import { useState, useEffect, useRef } from 'react';
import type { GridAlignmentController } from '../../pixi/GridAlignmentController';
import type { AlignmentPoint, AlignmentResult } from '../../pixi/GridAlignmentController';
import type { FitToLines } from './useGridFit';
import type { GridType } from '../../grid/GridSystem';
import { isHexGridType } from '../../grid/hexGeometry';
import { setCanvasCursor } from '../../pixi/utils/canvasCursor';
import type { AtlasView } from '../../atlas-view';
import { t, type MessageKey } from '../../i18n';

// ---------------------------------------------------------------------------
// Shared prop type for both alignment tabs
// ---------------------------------------------------------------------------

export interface AlignmentTabProps {
  controller: GridAlignmentController | null;
  view: AtlasView | null;
  result: AlignmentResult | null;
  setResult: (r: AlignmentResult | null) => void;
  /** The grid type the GM picked in the panel. */
  gridType: GridType;
  /** Fits what the tab measures to the map's lines; null while the GM has that switched off. */
  fit: FitToLines | null;
}

/** Instructions for the two clicks of a measurement, per grid type; `first` takes the `{area}` to click in. */
export function alignmentPointHints(gridType: GridType): { first: MessageKey; second: MessageKey } {
  if (isHexGridType(gridType)) {
    return { first: 'align.clickHexCorner', second: 'align.nextHexCorner' };
  }
  return { first: 'align.clickIntersection', second: 'align.nextIntersection' };
}

export function describeGridType(gridType: GridType): string {
  if (gridType === 'hex-vertical') return t('align.pointyHexes');
  if (gridType === 'hex-horizontal') return t('align.flatHexes');
  return t('align.squares');
}

// ---------------------------------------------------------------------------
// useCrosshairCursor — sets crosshair cursor on canvas during placement
// ---------------------------------------------------------------------------

export function useCrosshairCursor(isPreviewing: boolean, view: AlignmentTabProps['view']): void {
  useEffect(() => {
    const canvasEl = view?.renderer?.getCanvasElement();
    if (!canvasEl) return;

    if (!isPreviewing) {
      const prev = canvasEl.style.cursor;
      setCanvasCursor(canvasEl, 'crosshair');
      return () => { setCanvasCursor(canvasEl, prev); };
    }
    return undefined;
  }, [isPreviewing, view]);
}

// ---------------------------------------------------------------------------
// useCanvasClick — short left clicks on the map canvas; presses that move pan instead
// ---------------------------------------------------------------------------

const CLICK_DRAG_THRESHOLD = 5;

export function useCanvasClick(active: boolean, onClick: (event: PointerEvent) => void): void {
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    if (!active) return;

    let leftDown = false;
    let startX = 0;
    let startY = 0;

    const onDown = (e: PointerEvent): void => {
      if (e.button !== 0 || e.ctrlKey) return;
      if ((e.target as HTMLElement)?.tagName !== 'CANVAS') return;
      leftDown = true;
      startX = e.clientX;
      startY = e.clientY;
    };

    const onUp = (e: PointerEvent): void => {
      if (!leftDown || e.button !== 0) return;
      leftDown = false;

      if ((e.target as HTMLElement)?.tagName !== 'CANVAS') return;
      if (Math.abs(e.clientX - startX) > CLICK_DRAG_THRESHOLD ||
          Math.abs(e.clientY - startY) > CLICK_DRAG_THRESHOLD) return;

      onClickRef.current(e);
    };

    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
    };
  }, [active]);
}

// ---------------------------------------------------------------------------
// useArrowNudge — arrow key offset nudging during preview
// ---------------------------------------------------------------------------

export function useArrowNudge(isPreviewing: boolean): { dx: number; dy: number } {
  const [offsetAdjust, setOffsetAdjust] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  useEffect(() => {
    // A new preview starts without the previous one's nudges.
    if (!isPreviewing) {
      setOffsetAdjust(prev => (prev.dx === 0 && prev.dy === 0 ? prev : { dx: 0, dy: 0 }));
      return;
    }

    const handler = (e: KeyboardEvent): void => {
      const nudge = e.shiftKey ? 0.1 : 1;
      let dx = 0;
      let dy = 0;

      switch (e.key) {
        case 'ArrowLeft':  dx = -nudge; break;
        case 'ArrowRight': dx = nudge;  break;
        case 'ArrowUp':    dy = -nudge; break;
        case 'ArrowDown':  dy = nudge;  break;
        default: return;
      }

      e.preventDefault();
      e.stopPropagation();
      setOffsetAdjust(prev => ({ dx: prev.dx + dx, dy: prev.dy + dy }));
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPreviewing]);

  return offsetAdjust;
}

// ---------------------------------------------------------------------------
// useCursorPreview — ghost crosshair that follows the pointer during placement
// ---------------------------------------------------------------------------

export function useCursorPreview(
  isPreviewing: boolean,
  isPlacingA: boolean,
  pointA: AlignmentPoint | null,
  controller: GridAlignmentController | null,
  lockToRow: boolean,
): void {
  useEffect(() => {
    if (isPreviewing) {
      controller?.hideCursorPreview();
      return;
    }
    if (!controller) return;

    const handler = (e: PointerEvent): void => {
      if ((e.target as HTMLElement)?.tagName !== 'CANVAS') return;

      const lockY = lockToRow && !isPlacingA && pointA ? pointA.y : undefined;
      controller.updateCursorPreview(e.clientX, e.clientY, lockY);
    };

    window.addEventListener('pointermove', handler, true);
    return () => {
      window.removeEventListener('pointermove', handler, true);
      controller?.hideCursorPreview();
    };
  }, [isPreviewing, isPlacingA, pointA, controller, lockToRow]);
}

// ---------------------------------------------------------------------------
// useAlignmentPreview — shows an alignment with the arrow-key nudges on top
// ---------------------------------------------------------------------------

/** Previews `alignment` moved by the nudges and reports it as the tab's result; null reports none and leaves the grid as it is shown. */
export function useAlignmentPreview(
  alignment: AlignmentResult | null,
  offsetAdjust: { dx: number; dy: number },
  controller: GridAlignmentController | null,
  setResult: (r: AlignmentResult | null) => void,
): void {
  useEffect(() => {
    if (!controller) return;
    if (!alignment) {
      setResult(null);
      return;
    }
    const nudged: AlignmentResult = {
      ...alignment,
      offsetX: alignment.offsetX + offsetAdjust.dx,
      offsetY: alignment.offsetY + offsetAdjust.dy,
    };
    setResult(nudged);
    controller.showPreview(nudged);
  }, [alignment, offsetAdjust, controller, setResult]);
}
