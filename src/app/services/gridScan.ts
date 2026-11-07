import type { PixiRendererOrchestrator } from '../PixiRendererOrchestrator';
import { GridScanLayer } from '../pixi/gridAlignment/GridScanLayer';
import type { ViewAtlasState } from '../storeFactory';
import { prefersReducedMotion } from '../utils/motion';

/** Whether anything stands on the map: a token, a drawing, a pin, fog, a wall, a light. */
function somethingOnMap({ objects }: Pick<ViewAtlasState, 'objects'>): boolean {
  return Object.values(objects).some((record) => record !== undefined && Object.keys(record).length > 0);
}

/**
 * The scan that shows a grid detection on a view's map; null where none can show (no map, no
 * WebGL) or none should (reduced motion): a detection then shows its answer alone.
 *
 * A swell bends the map's own picture, which the scan draws over the map. That picture is the map
 * alone and unlit: over a lit scene it would show what the light hides, and over a map with
 * anything on it, the tokens and drawings under it would vanish while the swell passes. So it
 * bends only a bare, unlit map, which a new scene's is; elsewhere a swell only shines.
 */
export function createGridScan(state: () => Pick<ViewAtlasState, 'objects' | 'lighting'> | undefined, renderer: PixiRendererOrchestrator): GridScanLayer | null {
  const map = renderer.getMapImage();
  const viewport = renderer.getViewportInstance();
  const canvas = renderer.getCanvasElement();
  if (!map || !viewport || !canvas || prefersReducedMotion(canvas)) return null;
  return GridScanLayer.create({
    app: renderer.getAppInstance(),
    viewport,
    map,
    addOverlay: (overlay) => renderer.addDmScreenOverlay(overlay),
    bendsMap: () => {
      const scene = state();
      return scene !== undefined && !somethingOnMap(scene) && !scene.lighting?.enabled;
    },
  });
}
