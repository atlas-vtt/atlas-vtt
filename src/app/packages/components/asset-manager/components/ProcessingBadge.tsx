import React from 'react';
import type { AnyAsset } from '../types';
import { ProcessingRing } from '../../primitives/ProcessingRing';
import { useAssetProcessing } from '../hooks/useAssetProcessing';
import { t } from '../../../../i18n';

/**
 * "Processing" over the artwork of a map or scene whose map image is still being cut into tiles:
 * a wash greys the art, a ring shows how far the tiles are. The map opens and works meanwhile,
 * only softer until its tiles land. Gone once they have.
 */
export function ProcessingBadge({ asset }: { asset: AnyAsset }): React.JSX.Element | null {
  const percent = useAssetProcessing(asset);
  if (percent === null) return null;
  return (
    <div className="atlas-asset-processing" role="status" aria-label={t('am.card.processingProgress', { percent })}>
      <ProcessingRing percent={percent} />
      <span className="atlas-asset-processing__label" aria-hidden="true">{t('am.card.processing')}</span>
    </div>
  );
}
