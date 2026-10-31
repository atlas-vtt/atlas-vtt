import React, { useContext } from 'react';
import { MapProcessing } from '../../pixi/mosaicCanvas/mapProcessing';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { ProcessingRing } from '../../packages/components/primitives/ProcessingRing';
import { useProcessingPercent, useSceneImagePaths } from '../../packages/components/shared/useMapProcessing';
import { AtlasUIContext } from '../root/AtlasUIContext';
import { t } from '../../i18n';

/**
 * The ring on a scene tab whose map image is still being cut into tesserae: the scene works
 * meanwhile, only softer until its tesserae land. Nothing while none of its images is processed.
 */
export function SceneTabProcessing({ scenePath, suppressed = false }: { scenePath: string; suppressed?: boolean }): React.JSX.Element | null {
  const app = useContext(AtlasUIContext)?.app ?? null;
  const processing = app ? MapProcessing.forApp(app) : null;
  const paths = useSceneImagePaths(app, processing, scenePath);
  const percent = useProcessingPercent(processing, paths);
  if (percent === null) return null;
  return (
    <LabelTooltip side="bottom" label={t('tabs.processing', { percent })} suppressed={suppressed}>
      <span className="atlas-scene-tab__processing">
        <ProcessingRing percent={percent} />
      </span>
    </LabelTooltip>
  );
}
