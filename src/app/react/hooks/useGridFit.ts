/**
 * Fitting a grid measured or placed by hand to the lines printed on the map: the GM's input says
 * which grid is meant, the map's lines say exactly where it lies (`snapGridToMapGray`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AtlasView } from '../../atlas-view';
import type { AlignmentResult } from '../../pixi/gridAlignmentMath';
import { readMapGray, snapGridToMapGray } from '../../pixi/gridDetection/detectGrid';
import type { MapGray } from '../../pixi/gridDetection/detectGrid';

/** The grid among `candidates` (the likeliest first) that the map's lines support; null where they support none. */
export type FitToLines = (candidates: AlignmentResult[]) => Promise<AlignmentResult | null>;

/** Lets the "fitting" status paint before the fit, which is CPU-bound, holds the thread. */
const PAINT_DELAY_MS = 30;

/** Fits grids to the lines of the view's map image, whose pixels are read once, with the first fit. */
export function useGridFit(view: AtlasView | null): FitToLines {
  const gray = useRef<Promise<MapGray | null> | null>(null);
  useEffect(() => {
    gray.current = null;
  }, [view]);

  return useCallback(async (candidates) => {
    const mapImage = view?.renderer?.getMapImage?.();
    if (!mapImage) return null;
    try {
      gray.current ??= readMapGray(mapImage);
      const read = await gray.current;
      if (!read) {
        // Not readable yet (its image still opening): the next fit reads again.
        gray.current = null;
        return null;
      }
      await new Promise((resolve) => window.setTimeout(resolve, PAINT_DELAY_MS));
      return snapGridToMapGray(read, candidates);
    } catch (error) {
      gray.current = null;
      console.error('[GridAlignment] The grid could not be fitted to the map image', error);
      return null;
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

/**
 * The alignment `candidates` stand for (the likeliest first), fitted to the map's lines by `fit`
 * where they support one; without `fit` the first candidate. Pass the same array while the input is the same.
 */
export function useFittedAlignment(candidates: AlignmentResult[], fit: FitToLines | null): FittedAlignment {
  const [fitted, setFitted] = useState<FittedAlignment>(NOTHING);

  useEffect(() => {
    const measured = candidates[0] ?? null;
    if (!measured || !fit) {
      setFitted(measured ? { result: measured, pending: false } : NOTHING);
      return;
    }
    let current = true;
    setFitted({ result: measured, pending: true });
    void fit(candidates).then((onLines) => {
      if (current) setFitted({ result: onLines ?? measured, pending: false });
    });
    return () => {
      current = false;
    };
  }, [candidates, fit]);

  return fitted;
}
