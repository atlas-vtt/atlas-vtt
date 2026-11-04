/**
 * Shared hooks for the grid alignment tabs: cursor style, canvas clicks,
 * cursor preview and alignment preview.
 */

import { useEffect, useRef } from 'react';
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
  setResult: (r: AlignmentResult | null) => void;
  /** The grid type the GM picked in the panel. */
  gridType: GridType;
  /** Fits what the tab measures to the map's lines. */
  fit: FitToLines;
}

/** Instructions for the two clicks of a measurement, per grid type. */
export function alignmentPointHints(gridType: GridType): { first: MessageKey; second: MessageKey } {
  if (isHexGridType(gridType)) {
    return { first: 'align.hexCornerFirst', second: 'align.hexCornerNext' };
  }
  return { first: 'align.cornerFirst', second: 'align.cornerNext' };
}

export function describeGridType(gridType: GridType): string {
  if (gridType === 'hex-vertical') return t('align.pointyHexes');
  if (gridType === 'hex-horizontal') return t('align.flatHexes');
  return t('align.squares');
}

// ---------------------------------------------------------------------------
// useAlignmentEnds — what ends the alignment besides its own buttons
// ---------------------------------------------------------------------------

/** The part of a view's store an alignment watches for another scene. */
interface SceneWatch {
  getState(): { mapPath: string | null; isMapLoading: boolean };
  subscribe(listener: (state: { mapPath: string | null; isMapLoading: boolean }) => void): () => void;
}

/**
 * Ends the alignment with `end` when the view loads another scene (what was measured belongs to
 * the map it was measured on), and closes it with `close` on Escape, as its close button does.
 */
export function useAlignmentEnds(store: SceneWatch | null | undefined, end: () => void, close: () => void): void {
  useEffect(() => {
    if (!store) return undefined;
    const mapPath = store.getState().mapPath;
    let ended = false;
    return store.subscribe((state) => {
      if (ended || (state.mapPath === mapPath && !state.isMapLoading)) return;
      ended = true;
      end();
    });
  }, [store, end]);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);
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
// useAlignmentPreview — shows an alignment on the map
// ---------------------------------------------------------------------------

/** Previews `alignment` and reports it as the tab's result; null reports none and leaves the grid as it is shown. */
export function useAlignmentPreview(
  alignment: AlignmentResult | null,
  controller: GridAlignmentController | null,
  setResult: (r: AlignmentResult | null) => void,
): void {
  useEffect(() => {
    if (!controller) return;
    setResult(alignment);
    if (alignment) controller.showPreview(alignment);
  }, [alignment, controller, setResult]);
}
