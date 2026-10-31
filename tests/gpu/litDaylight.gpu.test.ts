import '../setup/obsidianDom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import type { LightEmission } from '../../src/app/types/lightingTypes';
import { openLevelsView, paintedTexture, type LevelsView } from '../helpers/levelsView';

vi.mock('events', async () => import('eventemitter3'));

const MAP = 512;
const PANE = 256;
const CANDLE: LightEmission = { bright: 5, dim: 10, color: '#ffaa55', intensity: 1, animation: 'none' };

/** The report's scene: a ground floor viewed under two upper levels. */
const FLOORS: SceneLevel[] = [
  { id: 'ground', name: 'Ground floor', elevation: { bottom: 0, top: 10 }, background: 'upper.png' },
  { id: 'two', name: 'Level 2', elevation: { bottom: 10, top: 20 }, background: 'ground.png' },
  { id: 'three', name: 'Level 3', elevation: { bottom: 20, top: 30 }, background: 'ground.png' },
];

/** The mean colour of a patch of the canvas, `size` device pixels a side from (`x0`, `y0`). */
function mean(pixels: Uint8ClampedArray, x0: number, y0: number, size: number): number[] {
  const sum = [0, 0, 0];
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) for (let c = 0; c < 3; c++) sum[c]! += pixels[(y * PANE + x) * 4 + c]!;
  return sum.map((v) => v / (size * size));
}

/**
 * The report "Very dark maps with dynamic lighting" (0.10.1): at Day, ambient light 100 % in white,
 * a dark map lit showed far darker than unlit and in gaudy purples, since the tonemap's toe took
 * its offset off every channel of a floor in full daylight. The floor sampled lies clear of the
 * candles, so the ambient light alone lights it. With levels or without, it was the same.
 */
describe('a map in daylight, lit', () => {
  const views: LevelsView[] = [];
  afterEach(() => {
    while (views.length) views.pop()!.dispose();
  });

  const floors: [number, number, number][] = [[48, 34, 37], [27, 26, 26], [96, 70, 52], [150, 140, 120]];
  const scenes = floors.flatMap((floor) => [{ floor, levels: FLOORS, name: 'three levels' }, { floor, levels: FLOORS.slice(0, 1), name: 'one level' }]);

  it.each(scenes)('looks like the map unlit: floor $floor, $name', async ({ floor, levels }) => {
    const view = await openLevelsView({ map: MAP, pane: PANE, viewed: paintedTexture(MAP, MAP, () => floor), levels, viewedLevel: 'ground' });
    views.push(view);
    const { store } = view;
    store.setState({ mapLoaded: true, isMapLoading: false, levels, viewedLevel: 'ground' });
    store.getState().addLight({ x: 100, y: 100, emission: CANDLE });
    store.getState().addLight({ x: 400, y: 400, emission: CANDLE });
    store.getState().setSceneLighting({ enabled: true, ambient: 1, ambientColor: '#ffffff' });
    await view.settle();
    const lit = mean(view.gmCanvas(PANE / MAP, 0, 0), 150, 20, 16);
    store.getState().setSceneLighting({ enabled: false });
    await view.settle();
    const unlit = mean(view.gmCanvas(PANE / MAP, 0, 0), 150, 20, 16);
    expect(unlit.map(Math.round)).toEqual(floor);
    // The GM's floor is screen-blended under the light (`floorColor` in the composite): a little brighter, never darker.
    for (let c = 0; c < 3; c++) {
      const step = lit[c]! - unlit[c]!;
      expect(step, `channel ${c}: lit ${lit.map(Math.round).join(',')}`).toBeGreaterThan(-1);
      expect(step, `channel ${c}: lit ${lit.map(Math.round).join(',')}`).toBeLessThan(4);
    }
  });
});
