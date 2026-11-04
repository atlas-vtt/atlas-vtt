import { useEffect } from 'react';
import type { GridAlignmentController } from '../../pixi/GridAlignmentController';
import type { AlignmentResult } from '../../pixi/gridAlignmentMath';
import { useAlignmentPreview } from '../hooks/useGridAlignmentEffects';

interface DetectedGridPreviewProps {
  controller: GridAlignmentController | null;
  /** The grid auto-detect found. */
  detected: AlignmentResult;
  setResult: (r: AlignmentResult | null) => void;
}

/** The grid auto-detect found, shown over the whole map for the GM to check and apply. The map shows it: the panel adds no words. */
export function DetectedGridPreview({ controller, detected, setResult }: DetectedGridPreviewProps): null {
  useAlignmentPreview(detected, controller, setResult);

  // After the preview, which may have stretched the map.
  useEffect(() => {
    controller?.zoomToFullMap();
  }, [controller, detected]);

  return null;
}
