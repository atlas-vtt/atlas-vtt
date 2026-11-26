import React, { useCallback, useEffect, useState } from 'react';
import { Check, Grid3x3, Layers, Move, RotateCcw } from 'lucide-react';
import { t } from '../../../i18n';
import { floorAlignment, referenceFloor } from '../../../levels/floorPosition';
import { viewedLevelId } from '../../../levels/sceneLevels';
import { DropdownMenu } from '../../../packages/components/primitives/DropdownMenu';
import { DropdownMenuItem } from '../../../packages/components/primitives/DropdownMenuItem';
import { DropdownSliderRow } from '../../../packages/components/primitives/DropdownSliderRow';
import { ToolButton } from '../../../packages/components/primitives/ToolButton';
import { TooltipProvider } from '../../../packages/components/primitives/tooltip';
import { GroupBreak, ToolOptionsBars } from '../../../packages/components/toolbar/ToolOptionsBar';
import { FLOOR_GHOST_ALPHA } from '../../../pixi/levels/FloorGhost';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore, useViewStoreHook } from '../../ViewStoreContext';
import { FloorPositioning, placeFloor } from './floorPositioning';
import { levelLabel } from './levelEditing';
import './floor-position-bar.scss';

/**
 * Position floor: the GM moves the floor the view shows over another floor's map, drawn
 * see-through, until their stairs and walls meet. Its bars stand above the main toolbar like a
 * tool's. It ends with Done, Enter or Escape, when the scene is left, or when it keeps one floor.
 */
export function FloorPositionBar(): React.ReactElement {
  const on = useAtlasStore((state) => state.isFloorPositioning);
  const several = useAtlasStore((state) => (state.levels?.length ?? 0) > 1);
  const loading = useAtlasStore((state) => state.isMapLoading);
  const aligningGrid = useAtlasStore((state) => state.isGridAlignmentOpen);
  const setFloorPositioning = useAtlasStore((state) => state.setFloorPositioning);
  const shown = useAtlasStore((state) => state.isFloorPositioning && !state.isPlayerView && !state.isToolbarEditing && !state.isMapLoading);
  // A scene left, one floor left (nothing to place against), or the grid being aligned, which takes the map's presses
  useEffect(() => {
    if (on && (loading || !several || aligningGrid)) setFloorPositioning(false);
  }, [on, loading, several, aligningGrid, setFloorPositioning]);
  return <ToolOptionsBars shown={shown}><FloorPositionBars /></ToolOptionsBars>;
}

function FloorPositionBars(): React.ReactElement | null {
  const { view, renderer } = useAtlasUI();
  const store = useViewStoreHook();
  const levels = useAtlasStore((state) => state.levels);
  const viewed = useAtlasStore((state) => viewedLevelId(state));
  const atCorner = useAtlasStore((state) => {
    const id = viewedLevelId(state);
    if (id === null) return true;
    const { offset } = floorAlignment(state, id);
    return offset.x === 0 && offset.y === 0;
  });
  const [chosen, setChosen] = useState<string | null>(null);
  const [alpha, setAlpha] = useState(FLOOR_GHOST_ALPHA);
  const [stopped, setStopped] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleMenu = useCallback((): void => setMenuOpen((open) => !open), []);
  const reference = chosen !== null && chosen !== viewed && levels?.some((level) => level.id === chosen) ? chosen : referenceFloor(levels, viewed);

  useEffect(() => {
    renderer?.showFloorGhost(reference, alpha);
  }, [renderer, reference, alpha]);
  useEffect(() => () => renderer?.showFloorGhost(null), [renderer]);

  useEffect(() => {
    const canvas = renderer?.getCanvasElement();
    const viewport = renderer?.getViewportInstance();
    if (!renderer || !canvas || !viewport || !view) return undefined;
    const positioning = new FloorPositioning({
      store,
      viewId: view.viewId,
      canvas,
      zoom: () => viewport.scale.x,
      preview: (placement) => renderer.previewViewedPlacement(placement),
      onStopped: setStopped,
      onDone: () => store.getState().setFloorPositioning(false),
    });
    return () => positioning.destroy();
  }, [renderer, view, store]);

  if (!levels || viewed === null) return null;
  const level = levels.find((entry) => entry.id === viewed);
  if (!level) return null;
  const name = levelLabel(levels, level);
  const others = levels.filter((entry) => entry.id !== viewed).reverse();
  const done = (): void => store.getState().setFloorPositioning(false);
  const reset = (): void => {
    placeFloor(store, viewed, { ...floorAlignment(store.getState(), viewed), offset: { x: 0, y: 0 } });
    setStopped(false);
  };
  const fitCells = (): void => {
    store.getState().setFloorPositioning(false);
    store.getState().setGridAlignmentOpen(true);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div role="toolbar" aria-label={t('levels.positionBar')} className="atlas-tool-bar atlas-tool-bar--modes atlas-floor-position-bar">
        <span className="atlas-floor-position-bar__title">
          <Move aria-hidden="true" />
          <span>{t('levels.positioning', { name })}</span>
        </span>
        <span className="atlas-floor-position-bar__hint" role="status">
          {stopped ? t('levels.positionEdge') : t('levels.positionHint')}
        </span>
      </div>
      <div role="toolbar" aria-label={t('levels.positionBar')} className="atlas-tool-bar atlas-tool-bar--tools">
        <DropdownMenu
          isOpen={menuOpen}
          onToggle={toggleMenu}
          label={t('levels.positionOver')}
          position="top"
          align="center"
          triggerButton={<ToolButton icon={Layers} label={t('levels.positionOver')} isActive={false} menuExpanded={menuOpen} onClick={() => undefined} />}
        >
          <div className="atlas-dropdown-section">
            <span className="atlas-dropdown-label">{t('levels.positionOver')}</span>
            {others.map((entry) => (
              <DropdownMenuItem
                key={entry.id}
                icon={Layers}
                label={levelLabel(levels, entry)}
                isActive={entry.id === reference}
                onClick={() => setChosen(entry.id)}
              />
            ))}
          </div>
          <div className="atlas-dropdown-section">
            <DropdownSliderRow
              label={t('levels.positionSeeThrough')}
              value={Math.round(alpha * 100)}
              min={10}
              max={90}
              step={5}
              unit="%"
              onChange={(value) => setAlpha(value / 100)}
            />
          </div>
        </DropdownMenu>
        <ToolButton icon={Grid3x3} label={t('levels.positionFit', { name })} isActive={false} onClick={fitCells} />
        <ToolButton icon={RotateCcw} label={t('levels.positionReset', { name })} isActive={false} disabled={atCorner} onClick={reset} />
        <GroupBreak />
        <ToolButton icon={Check} label={t('levels.positionDone')} shortcut="Enter" isActive={false} onClick={done} />
      </div>
    </TooltipProvider>
  );
}
