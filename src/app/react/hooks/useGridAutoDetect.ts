/**
 * The alignment panel's automatic detection: looks for the grid in the view's map image while
 * `detecting` is set, shows the search on the map, and says what it is doing and what it found.
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { AtlasView } from '../../atlas-view';
import type { GridAlignmentController } from '../../pixi/GridAlignmentController';
import type { AlignmentResult } from '../../pixi/gridAlignmentMath';
import { NO_GRID } from '../../pixi/spectralEngine/detectionJob';
import type { DetectionEvent, DetectionOutcome } from '../../pixi/spectralEngine/detectionJob';
import { detectGridOfMap } from '../../pixi/spectralEngine/spectralEngineService';
import { describeGridType } from './useGridAlignmentEffects';
import { t } from '../../i18n';

/** The words that name a detection's step stay at least this long: long enough to read. */
const STATUS_HOLD_MS = 900;

export interface AutoDetectListener {
  /** What the detection is doing, in words. */
  status(words: string): void;
  /** The grid it found; its scan is already ending on the map. */
  found(grid: AlignmentResult): void;
  /** The map has no grid to find. */
  none(): void;
  /** Whether a grid found is one to offer; one that is not counts as none found. Unset, every grid is. */
  accepts?(grid: AlignmentResult): boolean;
}

/**
 * Runs a detection for as long as `detecting` holds. It begins once the panel shows it: the tab the
 * GM was measuring in is gone by then, with its marks, its cursor and what it does to the grid
 * when it leaves. Whatever ends the detecting state ends the detection: its answer, or the GM
 * moving on.
 */
export function useGridAutoDetect(view: AtlasView | null, controller: RefObject<GridAlignmentController | null>, detecting: boolean, listener: AutoDetectListener): void {
  const heard = useRef(listener);
  heard.current = listener;

  useEffect(() => {
    const mapImage = view?.renderer?.getMapImage?.();
    if (!detecting || !mapImage) return undefined;
    const scanned = controller.current;
    const asked = new AbortController();

    // The search is watched on the whole map, without the grid it may be about to replace.
    scanned?.zoomToFullMap();
    scanned?.hidePreview();
    const showOnMap = scanned?.beginScan();
    let saidAt = 0;
    const onEvent = (event: DetectionEvent): void => {
      if (asked.signal.aborted) return;
      showOnMap?.(event);
      // Fits come several a second, of one grid type and then another: the words keep up at reading pace.
      if (event.type !== 'fit' || !event.fit.gridType || performance.now() - saidAt < STATUS_HOLD_MS) return;
      saidAt = performance.now();
      heard.current.status(t('align.checking', { type: describeGridType(event.fit.gridType) }));
    };

    void detectGridOfMap(mapImage, { onEvent, signal: asked.signal }).catch((error: unknown): DetectionOutcome => {
      if (!asked.signal.aborted) console.error('[GridAlignment] Auto-detect failed', error);
      return NO_GRID;
    }).then((outcome) => {
      if (asked.signal.aborted) return;
      if (!outcome.result?.gridType || heard.current.accepts?.(outcome.result) === false) {
        scanned?.endScan(NO_GRID);
        view?.renderer?.cancelGridAlignment?.();
        heard.current.none();
        return;
      }
      scanned?.endScan(outcome);
      heard.current.found(outcome.result);
    });
    return () => asked.abort();
  }, [detecting, view, controller]);
}
