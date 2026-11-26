import '../setup/obsidianDom';
import { Container, type Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { holdTokens } from '../../src/app/lighting/sightOnDrop';
import { LightingRenderer } from '../../src/app/pixi/lighting/LightingRenderer';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { rng } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

const MAP = 2048;
const STEPS = 40;
const TORCH = { bright: 20, dim: 40, color: '#ffb347', intensity: 1, animation: 'none' as const };
const HERO = { id: 'hero', kind: 'token', imagePath: 'h.png', x: 300, y: 1024, vision: { enabled: true, range: 60 }, light: TORCH } as TokenEntity;

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
}

/**
 * What one step of a drag costs while sight and light follow it: a vision token that carries a
 * torch is dragged across a 2,048 px map of 400 walls and 12 lamps, each position written to
 * the store as a drag writes it, each followed by the stage's render. Measured, not budgeted:
 * the figures are printed for whoever compares them.
 */
describe('the cost of a drag that sight and light follow', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    vi.useRealTimers();
  });

  async function drag(sightOnDrop: boolean | undefined): Promise<{ cpu: number; gpu: number | null; sightMoved: boolean }> {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const renderer = await createTestRenderer(1024);
    const store = createViewAtlasStore(createInMemoryApp().app, `drag-cost-${Math.random()}`);
    store.setState({ persistenceEnabled: false, mapPath: 'maps/drag.atlasmap' });
    const rand = rng(5);
    for (let chain = 0; chain < 50; chain++) {
      let [x, y] = [rand() * MAP, rand() * MAP];
      for (let link = 0; link < 8; link++) {
        const [angle, length] = [rand() * Math.PI * 2, 40 + rand() * 120];
        const [nx, ny] = [x + Math.cos(angle) * length, y + Math.sin(angle) * length];
        store.getState().addObject('walls', { type: 'solid', p1: { x, y }, p2: { x: nx, y: ny }, closed: true });
        [x, y] = [nx, ny];
      }
    }
    for (let lamp = 0; lamp < 12; lamp++) store.getState().addObject('lights', { x: rand() * MAP, y: rand() * MAP, emission: TORCH });
    store.setState((state) => ({ objects: { ...state.objects, tokens: { hero: HERO } } }));
    store.getState().setSceneLighting({ enabled: true, ambient: 0.1, ...(sightOnDrop !== undefined && { sightOnDrop }) });

    const viewport = new Container();
    const ticks: (() => void)[] = [];
    const lighting = new LightingRenderer({
      viewport: viewport as unknown as Viewport,
      app: { renderer, ticker: { add: (tick: () => void) => ticks.push(tick), remove: vi.fn() } } as unknown as Application,
      store,
      measurement: () => ({ unitDistance: 5 }) as unknown as MeasurementSettings,
      bounds: () => ({ width: MAP, height: MAP }),
      albedo: () => null,
    });
    cleanup.push(() => {
      lighting.destroy();
      viewport.destroy({ children: true });
      renderer.destroy();
    });
    const frame = (): void => {
      ticks.forEach((tick) => tick());
      renderer.render({ container: viewport });
    };
    frame();
    renderer.gl.finish();

    const { gl } = renderer;
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
    const origin = lighting.currentSight().regions[0]?.origin;
    holdTokens(store, ['hero']);
    const cpu: number[] = [];
    const gpu: number[] = [];
    for (let step = 1; step <= STEPS; step++) {
      const query = ext && gl.createQuery();
      if (ext && query) {
        gl.getParameter(ext.GPU_DISJOINT_EXT);
        gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      }
      const started = performance.now();
      store.getState().setTokenPositions([{ id: 'hero', x: 300 + step * 30, y: 1024 + Math.sin(step / 4) * 120 }]);
      frame();
      cpu.push(performance.now() - started);
      if (ext && query) {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        vi.useRealTimers();
        while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) await new Promise((resolve) => window.setTimeout(resolve, 2));
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push((gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6);
        gl.deleteQuery(query);
      }
    }
    const moved = lighting.currentSight().regions[0]?.origin;
    holdTokens(store, []);
    return { cpu: median(cpu), gpu: gpu.length ? median(gpu) : null, sightMoved: moved?.x !== origin?.x };
  }

  it('measures a vision token with a torch dragged across a map of 400 walls and 12 lamps', { timeout: 300_000 }, async () => {
    const live = await drag(undefined);
    const explicit = await drag(false);
    const waiting = await drag(true);
    console.info(`live drag cost, ms per step (median of ${STEPS}): ${JSON.stringify({ default: live, sightOnDropOff: explicit, sightOnDropOn: waiting })}`);
    // By default sight follows the drag, as with the option off; with it on, sight waits.
    expect(live.sightMoved).toBe(true);
    expect(explicit.sightMoved).toBe(true);
    expect(waiting.sightMoved).toBe(false);
  });
});
