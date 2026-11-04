/**
 * Fitting a grid measured or placed by hand to the lines printed on the map: the GM's input says
 * which grid is meant, the map's lines say exactly where it lies (`snapGridToMapGray`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AtlasView } from '../../atlas-view';
import type { GridAlignmentController } from '../../pixi/GridAlignmentController';
import type { AlignmentPoint, AlignmentResult } from '../../pixi/gridAlignmentMath';
import { pictureOf } from '../../pixi/spectralEngine/detectGrid';
import type { MapPicture } from '../../pixi/spectralEngine/detectGrid';
import type { DetectOptions } from '../../pixi/spectralEngine/SpectralEngineClient';
import { NO_GRID } from '../../pixi/spectralEngine/detectionJob';
import type { DetectionOutcome } from '../../pixi/spectralEngine/detectionJob';
import { detectGridInGray } from '../../pixi/spectralEngine/spectralEngineService';

/** Who watches a fit: hears what it finds on its way, and may end it. */
export type FitWatch = Pick<DetectOptions, 'onEvent' | 'signal'>;

/** The grid among `candidates` (the likeliest first) that the map's lines support, with its edges on them; no result where they support none. */
export type FitToLines = (candidates: AlignmentResult[], watch?: FitWatch) => Promise<DetectionOutcome>;

/** Fits grids to the lines of the view's map image, whose pixels are read once, with the first fit. */
export function useGridFit(view: AtlasView | null): FitToLines {
  // One picture for the panel's life: the detection's worker reads it once and keeps what it read.
  const picture = useRef<MapPicture | null>(null);
  useEffect(() => {
    picture.current = null;
  }, [view]);

  return useCallback(async (candidates, watch) => {
    const mapImage = view?.renderer?.getMapImage?.();
    if (!mapImage) return NO_GRID;
    picture.current ??= pictureOf(mapImage);
    if (!picture.current) return NO_GRID;
    try {
      return await detectGridInGray(picture.current, { candidates, ...watch });
    } catch (error) {
      // A fit its asker ended is no failure, and the map's pixels are as good as before.
      if (watch?.signal?.aborted) return NO_GRID;
      picture.current = null;
      console.error('[GridAlignment] The grid could not be fitted to the map image', error);
      return NO_GRID;
    }
  }, [view]);
}

export interface FittedAlignment {
  /** The grid the lines support, else the first candidate as it is; null without candidates. */
  result: AlignmentResult | null;
  /** The lines are being read; `result` is the first candidate meanwhile. */
  pending: boolean;
}

const NOTHING: FittedAlignment = { result: null, pending: false };

/** Where a fit is shown while it runs: on the controller's map, from the point the GM clicked last. */
export interface FitScan {
  controller: GridAlignmentController | null;
  origin: AlignmentPoint | null;
}

/**
 * The alignment `candidates` stand for (the likeliest first), fitted to the map's lines by `fit`
 * where they support one. Pass the same array while the input is the same.
 */
export function useFittedAlignment(candidates: AlignmentResult[], fit: FitToLines, scan?: FitScan): FittedAlignment {
  const [fitted, setFitted] = useState<FittedAlignment>(NOTHING);
  // Read when a fit begins: a scan belongs to the candidates it was begun for.
  const shown = useRef(scan);
  shown.current = scan;

  useEffect(() => {
    const measured = candidates[0] ?? null;
    if (!measured) {
      setFitted(NOTHING);
      return;
    }
    // A fit nobody waits for any more ends with its worker, so the next one starts at once.
    const asked = new AbortController();
    const controller = shown.current?.controller ?? null;
    const onEvent = controller?.beginScan(shown.current?.origin ?? undefined);
    setFitted({ result: measured, pending: true });
    void fit(candidates, { signal: asked.signal, ...(onEvent ? { onEvent } : {}) }).then((outcome) => {
      if (asked.signal.aborted) return;
      controller?.endScan(outcome);
      setFitted({ result: outcome.result ?? measured, pending: false });
    });
    return () => {
      asked.abort();
      controller?.cancelScan();
    };
  }, [candidates, fit]);

  return fitted;
}
