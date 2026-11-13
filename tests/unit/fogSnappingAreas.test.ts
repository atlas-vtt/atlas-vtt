import { describe, expect, it } from 'vitest';
import { FogSnapping, type FogGuideMark } from '../../src/app/pixi/fog/FogSnapping';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
const FREE = { free: false, shift: false };

function scene(): { store: ReturnType<typeof createViewAtlasStore>; snapping: FogSnapping; guide: { mark: FogGuideMark | null } } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `fog-snap-areas-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  // No grid to land on: only the areas count.
  store.setState((state) => ({ grid: { ...state.grid, snapToGrid: false } }));
  const guide: { mark: FogGuideMark | null } = { mark: null };
  return { store, guide, snapping: new FogSnapping({ store, zoom: () => 1, guide: { show: (mark) => { guide.mark = mark; } } }) };
}

describe('the fog tool\'s points and the fog\'s areas', () => {
  it('land on an area\'s corner, and along its edge, with the guide saying which', () => {
    const { store, snapping, guide } = scene();
    store.getState().addFogArea({ type: 'rectangle', x: 203, y: 203, width: 100, height: 100 });
    expect(snapping.corner({ x: 207, y: 199 }, FREE)).toEqual({ x: 203, y: 203 });
    expect(guide.mark).toEqual({ kind: 'area-corner', point: { x: 203, y: 203 } });
    expect(snapping.corner({ x: 250, y: 208 }, FREE)).toEqual({ x: 250, y: 203 });
    expect(guide.mark).toMatchObject({ kind: 'area-edge', from: { x: 203, y: 203 }, to: { x: 303, y: 203 } });
    // Out of reach, the point stays under the pointer.
    expect(snapping.corner({ x: 250, y: 260 }, FREE)).toEqual({ x: 250, y: 260 });
    expect(guide.mark).toBeNull();
  });

  it('land on a lasso area\'s corners and on a revealed area\'s as well', () => {
    const { store, snapping } = scene();
    const id = store.getState().addFogArea({ type: 'lasso', points: [{ x: 11, y: 11 }, { x: 91, y: 11 }, { x: 51, y: 81 }] })!;
    store.getState().flipFogArea(id);
    expect(snapping.corner({ x: 53, y: 78 }, FREE)).toEqual({ x: 51, y: 81 });
  });

  it('pass over fog that is no area, areas of another level, and every area while Ctrl or Cmd is held', () => {
    const { store, snapping } = scene();
    store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 203, y: 203, width: 100, height: 100 });
    expect(snapping.corner({ x: 207, y: 199 }, FREE)).toEqual({ x: 207, y: 199 });

    store.setState({ levels: LEVELS, viewedLevel: 'ground' });
    store.getState().addFogArea({ type: 'rectangle', x: 503, y: 503, width: 100, height: 100 });
    expect(snapping.corner({ x: 505, y: 500 }, FREE)).toEqual({ x: 503, y: 503 });
    expect(snapping.corner({ x: 505, y: 500 }, { free: true, shift: false })).toEqual({ x: 505, y: 500 });
    store.getState().setViewedLevel('upper');
    expect(snapping.corner({ x: 505, y: 500 }, FREE)).toEqual({ x: 505, y: 500 });
  });
});
