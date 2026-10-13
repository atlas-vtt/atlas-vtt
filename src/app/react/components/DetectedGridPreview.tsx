import React, { useEffect } from 'react';
import type { GridAlignmentController } from '../../pixi/GridAlignmentController';
import type { AlignmentResult } from '../../pixi/gridAlignmentMath';
import { useAlignmentPreview, useArrowNudge } from '../hooks/useGridAlignmentEffects';
import { AlignmentSummary } from './AlignmentSummary';
import { t } from '../../i18n';

interface DetectedGridPreviewProps {
  controller: GridAlignmentController | null;
  /** The grid auto-detect found. */
  detected: AlignmentResult;
  result: AlignmentResult | null;
  setResult: (r: AlignmentResult | null) => void;
}

/** The grid auto-detect found, shown over the whole map for the GM to check, nudge and apply. */
export function DetectedGridPreview({ controller, detected, result, setResult }: DetectedGridPreviewProps): React.ReactElement {
  const offsetAdjust = useArrowNudge(true);
  useAlignmentPreview(detected, offsetAdjust, controller, setResult);

  // After the preview, which may have stretched the map.
  useEffect(() => {
    controller?.zoomToFullMap();
  }, [controller, detected]);

  return (
    <>
      <p className="atlas-grid-alignment-hint">{t('align.preview')}</p>
      {result && <AlignmentSummary result={result} />}
    </>
  );
}
