// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { RefObject } from 'react';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { acceptsLevelDetection } from '../../../src/app/react/components/levels/levelImageAlignment';
import { useGridAutoDetect } from '../../../src/app/react/hooks/useGridAutoDetect';
import type { AlignmentResult } from '../../../src/app/pixi/gridAlignmentMath';
import type { AtlasView } from '../../../src/app/atlas-view';
import type { GridAlignmentController } from '../../../src/app/pixi/GridAlignmentController';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const detection = vi.hoisted(() => ({ result: null as AlignmentResult | null }));
vi.mock('../../../src/app/pixi/spectralEngine/spectralEngineService', () => ({
  detectGridOfMap: vi.fn(async () => ({ result: detection.result, hits: null })),
}));

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'ground.webp' },
  { id: 'exhibit', name: 'Exhibit', elevation: { bottom: 10, top: 20 }, background: 'exhibit.webp' },
];
/** The floors of the Penhew Foundation export: 32 × 40 cells of 100 px, without a grid drawn. */
const IMAGE = { width: 3200, height: 4000 };

/** What auto-detect found on the Exhibit floor's art: the scene's cells, a fifth and two thirds of a cell off its walls. */
const ON_THE_ART: AlignmentResult = { gridType: 'square', cellSize: 100, offsetX: 20.34, offsetY: 66.42, confidence: 0.2 };

function towerScene(): ViewAtlasStore {
  const store = createViewAtlasStore(createInMemoryApp().app, `level-detection-${Math.random()}`);
  store.setState({
    persistenceEnabled: false, levels: LEVELS, viewedLevel: 'exhibit', background: 'ground.webp',
    grid: { enabled: true, visible: true, type: 'square', size: 100, offsetX: 0, offsetY: 0, opacity: 0.5 },
  });
  return store;
}

afterEach(() => { detection.result = null; });

describe('auto-detect on a level that already lines up', () => {
  it('moves the level only by a grid the map\'s lines settle', () => {
    const store = towerScene();

    expect(acceptsLevelDetection(store, 'exhibit', ON_THE_ART, IMAGE)).toBe(false);
    expect(acceptsLevelDetection(store, 'exhibit', { ...ON_THE_ART, confidence: 0.6 }, IMAGE)).toBe(true);
  });

  it('takes a weak grid that leaves the level where it lies, whole cells away included', () => {
    const store = towerScene();

    expect(acceptsLevelDetection(store, 'exhibit', { ...ON_THE_ART, offsetX: 0, offsetY: 0 }, IMAGE)).toBe(true);
    expect(acceptsLevelDetection(store, 'exhibit', { ...ON_THE_ART, offsetX: 300, offsetY: -200 }, IMAGE)).toBe(true);
    expect(acceptsLevelDetection(store, 'exhibit', { ...ON_THE_ART, cellSize: 50, offsetX: 0, offsetY: 0 }, IMAGE)).toBe(false);
  });

  it('says no grid was found instead of offering a weak one', async () => {
    const store = towerScene();
    detection.result = ON_THE_ART;
    const view = { renderer: { getMapImage: () => ({ imageSize: IMAGE }), cancelGridAlignment: vi.fn() } } as unknown as AtlasView;
    const controller = { current: null } as RefObject<GridAlignmentController | null>;
    const listener = { status: vi.fn(), found: vi.fn(), none: vi.fn(), accepts: (grid: AlignmentResult) => acceptsLevelDetection(store, 'exhibit', grid, IMAGE) };

    renderHook(() => useGridAutoDetect(view, controller, true, listener));

    await waitFor(() => expect(listener.none).toHaveBeenCalled());
    expect(listener.found).not.toHaveBeenCalled();
  });
});
