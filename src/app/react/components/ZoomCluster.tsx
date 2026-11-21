import React, { useSyncExternalStore } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { ZoomButtonsChoice } from '../../input/zoomButtons';
import { useHotkeyLabels } from '../../keyboard/useMapHotkeys';
import { ToolButton } from '../../packages/components/primitives/ToolButton';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { fitMapInView, zoomViewByNotch } from '../../pixi/mapZoomActions';
import { useCoarsePointer } from '../../platform/useCoarsePointer';
import { t } from '../../i18n';
import { useAtlasUI } from '../root/AtlasUIContext';

/**
 * Zoom in, zoom out and fit the map: a short bar at the right edge of the map, at mid-height,
 * where a thumb reaches it. Under a finger it always shows, since a tablet has no wheel; with a
 * mouse only where the GM switched it on in Atlas' settings.
 */
export function ZoomCluster(): React.ReactElement | null {
  const { app, renderer } = useAtlasUI();
  const choice = ZoomButtonsChoice.forApp(app);
  const chosen = useSyncExternalStore(choice.subscribe, () => choice.shown);
  const coarse = useCoarsePointer();
  const hotkeyLabel = useHotkeyLabels();
  if (!coarse && !chosen) return null;

  const zoom = (direction: 1 | -1): void => {
    const viewport = renderer?.getViewportInstance();
    if (viewport) zoomViewByNotch(viewport, direction);
  };
  const fit = (): void => {
    const viewport = renderer?.getViewportInstance();
    const rect = renderer?.getMapRect();
    if (viewport && rect) fitMapInView(viewport, rect);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="atlas-vtt-toolbar atlas-zoom-cluster" role="group" aria-label={t('view.zoom')}>
        <ToolButton icon={Plus} label={t('view.zoomIn')} isActive={false} tooltipSide="left" onClick={() => zoom(1)} />
        <ToolButton icon={Minus} label={t('view.zoomOut')} isActive={false} tooltipSide="left" onClick={() => zoom(-1)} />
        <ToolButton icon={Maximize} label={t('hotkey.fitMap')} shortcut={hotkeyLabel('fitMap')} isActive={false} tooltipSide="left" onClick={fit} />
      </div>
    </TooltipProvider>
  );
}
