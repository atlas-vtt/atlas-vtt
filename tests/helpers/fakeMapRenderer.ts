import { vi } from 'vitest';
import type { LoadedMap } from '../../src/app/MapLoader';
import type { MapFile } from '../../src/app/services/MapPersistence';
import type { MapImageSource } from '../../src/app/pixi/mapImage/mapImageTypes';

/** The map image a scene without a background shows: an empty world of 20 × 20 cells of 70 px. */
export const EMPTY_MAP_IMAGE: MapImageSource = { kind: 'none', width: 1400, height: 1400 };

/** What `MapLoader.load` returns for `mapData` in tests that mock it. */
export function loadedMap(mapData: MapFile): LoadedMap {
  return { mapData, image: EMPTY_MAP_IMAGE };
}

/** A map image without a GPU: loads resolve at once and every view is ready. */
export interface FakeMapImage {
  worldRect: { x: number; y: number; width: number; height: number } | null;
  load: ReturnType<typeof vi.fn<(source: MapImageSource) => Promise<void>>>;
  whenCameraReady: ReturnType<typeof vi.fn<(timeoutMs: number) => Promise<void>>>;
  clear: ReturnType<typeof vi.fn<() => void>>;
}

export interface FakeMapRenderer {
  getMapImage: () => FakeMapImage;
  setMapImage: ReturnType<typeof vi.fn>;
  clearMapImage: ReturnType<typeof vi.fn>;
  getGridSystem: () => null;
  initGrid: ReturnType<typeof vi.fn>;
  getViewportInstance: () => null;
}

/** The renderer part of a map load, with a fake map image; `onLoad` hears every image it is asked to show. */
export function fakeMapRenderer(onLoad: (source: MapImageSource) => void = () => undefined): FakeMapRenderer & { mapImage: FakeMapImage } {
  const mapImage: FakeMapImage = {
    worldRect: { x: 0, y: 0, width: 1400, height: 1400 },
    load: vi.fn(async (source: MapImageSource) => onLoad(source)),
    whenCameraReady: vi.fn(() => Promise.resolve()),
    clear: vi.fn(),
  };
  return {
    mapImage,
    getMapImage: () => mapImage,
    setMapImage: vi.fn(),
    clearMapImage: vi.fn(),
    getGridSystem: () => null,
    initGrid: vi.fn(),
    getViewportInstance: () => null,
  };
}
