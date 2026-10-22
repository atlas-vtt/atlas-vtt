import { describe, expect, it } from 'vitest';
import { placementGridOf } from '../../src/app/pixi/tokenPlacement/placementGrid';
import { spawnTargetOf } from '../../src/app/packages/components/asset-manager/utils/spawnTarget';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import type { AtlasView } from '../../src/app/atlas-view';

/** A square grid of 70 px cells, shown or hidden. */
function grid(enabled: boolean) {
  const snap = (x: number, y: number): { x: number; y: number } => ({ x: Math.floor(x / 70) * 70 + 35, y: Math.floor(y / 70) * 70 + 35 });
  return { getOptions: () => ({ type: 'square', size: 70, enabled }), snapTokenCenter: snap, snapToCellCenter: snap };
}

describe('the grid held tokens snap to', () => {
  it('is the grid wherever tokens snap, hidden or shown', () => {
    for (const enabled of [true, false]) {
      const placement = placementGridOf(grid(enabled) as unknown as GridSystem, true);
      expect(placement?.snapToken({ x: 100, y: 10 }, 1)).toEqual({ x: 105, y: 35 });
      expect(placement?.cellOutline({ x: 35, y: 35 })).toHaveLength(4);
    }
  });

  it('is none where tokens do not snap', () => {
    expect(placementGridOf(grid(true) as unknown as GridSystem, false)).toBeNull();
  });
});

describe('where spawned tokens are laid out', () => {
  function view(enabled: boolean, snapToGrid: boolean): AtlasView {
    const viewport = { screenWidth: 800, screenHeight: 600, toWorld: (p: { x: number; y: number }) => p, scale: { x: 1 } };
    return {
      serviceManager: { getRendererService: () => ({ getViewport: () => viewport, getGridSystem: () => grid(enabled), getRenderer: () => null }) },
      getStore: () => ({ getState: () => ({ mapPath: 'maps/cave.atlasmap', isMapLoading: false, grid: { snapToGrid } }) }),
    } as unknown as AtlasView;
  }

  it('follows a hidden grid tokens snap to', () => {
    expect(spawnTargetOf(view(false, true))?.grid).toMatchObject({ type: 'square', size: 70 });
  });

  it('ignores a grid tokens do not snap to, but keeps its spacing', () => {
    const target = spawnTargetOf(view(true, false));
    expect(target?.grid).toBeNull();
    expect(target?.pitch).toBe(70);
  });
});
