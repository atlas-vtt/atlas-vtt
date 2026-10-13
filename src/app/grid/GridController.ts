import { PixiRendererOrchestrator } from '../PixiRendererOrchestrator';
import type { GridOptions } from './GridSystem';
import { parseGridColor } from './gridContrastColor';
import { cellNumberStyleOfGrid } from './cellNumbering';
import type { MapFile } from '../services/MapPersistence';

/** The part of the loaded map the grid helpers read and keep in sync. */
export type GridMapData = Pick<MapFile, 'grid'>;

/**
 * Ensure a GridSystem exists for the given renderer. If none exists yet it
 * will be initialised using the provided mapData as source of options.
 */
function ensureInitialised(
  renderer: PixiRendererOrchestrator,
  mapData: GridMapData | null
): void {
  if (!mapData) return; // nothing to do without map meta

  if (renderer.getGridSystem()) return; // already present

  const gridOptions: GridOptions = {
    type: mapData.grid?.type ?? 'square',
    size: mapData.grid?.size ?? 70,
    offsetX: mapData.grid?.offsetX ?? 0,
    offsetY: mapData.grid?.offsetY ?? 0,
    color: parseGridColor(mapData.grid?.color),
    alpha: mapData.grid?.opacity ?? 0.7,
    lineWidth: mapData.grid?.lineWidth ?? 1,
    lineType: mapData.grid?.lineType ?? 'solid',
    cellNumbers: cellNumberStyleOfGrid(mapData.grid),
    enabled: true,
  } as const;

  const mapImage = renderer.getMapImage();
  if (!mapImage) {
    console.error('[GridController] Cannot create grid – no map image');
    return;
  }

  renderer.initGrid(gridOptions, mapImage);
}

/**
 * Toggle grid visibility, updating the supplied mapData structure in‑place so
 * the UI and save logic remain in sync.
 *
 * Returns the new enabled state.
 */
function toggle(
  renderer: PixiRendererOrchestrator,
  mapData: GridMapData | null
): boolean {
  // Ensure we have a grid system before toggling.
  ensureInitialised(renderer, mapData);

  const isGridOn = renderer.toggleGrid();

  if (mapData) {
    if (!mapData.grid) {
      mapData.grid = {
        enabled: isGridOn,
        size: 70,
        offsetX: 0,
        offsetY: 0,
        opacity: 0.7,
        lineType: 'solid',
        lineWidth: 1,
      };
    } else {
      mapData.grid.enabled = isGridOn;
    }
  }

  return isGridOn;
}

/**
 * Helper functions to manage grid initialisation and visibility state.
 *
 * By extracting this logic out of the AtlasView class we keep the view focused
 * on orchestrating and delegate granular duties to dedicated modules.
 */
export const GridController = { ensureInitialised, toggle };
