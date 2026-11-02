import { describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { FogOperation } from '../../../src/app/types/fogTypes';
import type { DrawingStroke } from '../../../src/app/types';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { WallInteraction } from '../../../src/app/pixi/vision/WallInteraction';
import type { WallRenderer } from '../../../src/app/pixi/vision/WallRenderer';
import type { WallSegment } from '../../../src/app/types/wallTypes';

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];

const fog = (id: string, level?: string): FogOperation => ({ id, kind: 'fog', timestamp: 1, type: 'rectangle', isErasing: false, x: 0, y: 0, width: 10, height: 10, ...(level && { level }) });
const drawing = (id: string, level?: string): DrawingStroke => ({ id, kind: 'drawing', points: [0, 0, 1, 1], color: '#fff', width: 2, ...(level && { level }) }) as unknown as DrawingStroke;

/** A store holding a scene of two floors, showing `viewed`, with fog and a drawing on each. */
function twoFloorStore(viewed: string): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `level-store-edits-${Math.random()}`);
  store.setState({
    persistenceEnabled: false,
    levels: LEVELS,
    viewedLevel: viewed,
    objects: {
      ...store.getState().objects,
      fog: { low: fog('low'), high: fog('high', 'upper') },
      drawings: { low: drawing('low'), high: drawing('high', 'upper') },
    },
  });
  getHistoryStore(store)?.getState().clear();
  return store;
}

describe('clearing a floor', () => {
  it('takes the fog and drawings of the floor shown, and leaves the other floors theirs', () => {
    const store = twoFloorStore('upper');

    store.getState().clearFog();
    store.getState().clearDrawings();

    expect(Object.keys(store.getState().objects.fog)).toEqual(['low']);
    expect(Object.keys(store.getState().objects.drawings)).toEqual(['low']);
  });

  it('takes everything in a scene without floors', () => {
    const store = twoFloorStore('upper');
    store.setState({ levels: undefined });

    store.getState().clearFog();

    expect(store.getState().objects.fog).toEqual({});
  });
});

describe('walls selected on a floor the GM left', () => {
  const wall = (id: string, levels: WallSegment['levels']): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, levels });

  it('are let go of, so Delete and the wall menu never reach a floor nobody sees', () => {
    const store = twoFloorStore('upper');
    store.setState({ objects: { ...store.getState().objects, walls: { up: wall('up', ['upper']), tower: wall('tower', 'all') } } });
    const renderer = { setSelectedWalls: vi.fn(), forceRedraw: vi.fn() } as unknown as WallRenderer;
    const interaction = new WallInteraction(store, renderer);
    interaction.selectWallChain('up', false);
    interaction.selectWallChain('tower', true);

    store.getState().setViewedLevel('ground');
    expect(interaction.getSelectedWallIds()).toEqual(['tower']);
    interaction.deleteSelected();

    expect(Object.keys(store.getState().objects.walls)).toEqual(['up']);
  });
});
