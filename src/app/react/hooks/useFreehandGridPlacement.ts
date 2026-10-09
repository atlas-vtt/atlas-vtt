import { useEffect, useRef, useState } from 'react';
import type { AtlasView } from '../../atlas-view';
import type { GridType } from '../../grid/GridSystem';
import type { Point } from '../../grid/hexGeometry';
import { NO_STRETCH, type MapStretch } from '../../grid/mapStretch';
import { FreehandGridPreview, freehandCellSize } from '../../pixi/FreehandGridPreview';
import { useCanvasClick } from './useGridAlignmentEffects';

export interface FreehandPlacement {
  /** World point the placed grid centres a cell on. */
  point: Point;
  cellSize: number;
  /** How the map was drawn when it was clicked: what `point` and `cellSize` are measured in. */
  mapStretch: MapStretch;
}

/**
 * Shows the freehand preview under the pointer while `placing`, and places the
 * grid where the map is clicked. The preview keeps its size on screen, so the
 * map's zoom decides the cell size; returns the size the current zoom gives.
 */
export function useFreehandGridPlacement(
  view: AtlasView | null,
  gridType: GridType,
  placing: boolean,
  onPlace: (placement: FreehandPlacement) => void,
): number | null {
  const renderer = view?.renderer ?? null;
  const viewport = renderer?.getViewportInstance() ?? null;
  const previewRef = useRef<FreehandGridPreview | null>(null);
  const gridTypeRef = useRef(gridType);
  gridTypeRef.current = gridType;
  const [cellSize, setCellSize] = useState<number | null>(() => (viewport ? freehandCellSize(viewport.scale.x) : null));

  useEffect(() => {
    if (!renderer || !placing) return;
    const canvas = renderer.getCanvasElement();
    const preview = new FreehandGridPreview(gridTypeRef.current);
    const removeOverlay = renderer.addDmScreenOverlay(preview.view);
    previewRef.current = preview;

    const onMove = (e: PointerEvent): void => {
      if (e.target !== canvas) {
        preview.hide();
        return;
      }
      const rect = canvas.getBoundingClientRect();
      preview.showAt(e.clientX - rect.left, e.clientY - rect.top);
    };
    const onLeave = (): void => preview.hide();

    window.addEventListener('pointermove', onMove, true);
    canvas.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      canvas.removeEventListener('pointerleave', onLeave);
      previewRef.current = null;
      removeOverlay();
      preview.destroy();
    };
  }, [renderer, placing]);

  useEffect(() => {
    previewRef.current?.setGridType(gridType);
  }, [gridType]);

  useEffect(() => {
    if (!viewport) return;
    const onZoom = (): void => setCellSize(freehandCellSize(viewport.scale.x));
    onZoom();
    viewport.on('zoomed', onZoom);
    return () => {
      viewport.off('zoomed', onZoom);
    };
  }, [viewport]);

  useCanvasClick(placing && viewport !== null, (e) => {
    if (!viewport || !renderer) return;
    const rect = renderer.getCanvasElement().getBoundingClientRect();
    const world = viewport.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    onPlace({
      point: { x: world.x, y: world.y },
      cellSize: freehandCellSize(viewport.scale.x),
      mapStretch: renderer.getMapImage()?.mapStretch ?? NO_STRETCH,
    });
  });

  return cellSize;
}
