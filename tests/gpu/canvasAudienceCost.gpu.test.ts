import { Container } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { rng } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import type { DrawingStroke, TokenEntity } from '../../src/app/types';
import type { KeptMeasure } from '../../src/app/measure/measureTypes';
import type { PlayerFrame } from '../../src/app/types/playerFrame';
import { fogRectangle } from '../helpers/fogOperations';
import { openMapView, type MapView } from '../helpers/mapView';

const SIZE = 512;
const STEPS = 60;
const WARM_UP = 10;
const TORCH = { bright: 20, dim: 40, color: '#ffb347', intensity: 1, animation: 'none' as const };
const FRAME: PlayerFrame = { width: SIZE, height: SIZE, resolution: 1, antialias: false, centerX: SIZE / 2, centerY: SIZE / 2, scale: 1 };

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
}

/** A lit floor of a dungeon: 25 chains of walls, 8 lamps, a party of four with vision and torches, 24 monsters (6 hidden), fog, drawings and a kept ruler. */
async function dungeon(): Promise<MapView> {
  const scene = await openMapView({ size: SIZE, floor: 0x6a6a6a, cell: 32 });
  const { store } = scene;
  const rand = rng(11);
  for (let chain = 0; chain < 25; chain++) {
    let [x, y] = [rand() * SIZE, rand() * SIZE];
    for (let link = 0; link < 6; link++) {
      const [angle, length] = [rand() * Math.PI * 2, 20 + rand() * 60];
      const [nx, ny] = [x + Math.cos(angle) * length, y + Math.sin(angle) * length];
      store.getState().addObject('walls', { type: 'solid', p1: { x, y }, p2: { x: nx, y: ny }, closed: true });
      [x, y] = [nx, ny];
    }
  }
  for (let lamp = 0; lamp < 8; lamp++) store.getState().addObject('lights', { x: rand() * SIZE, y: rand() * SIZE, emission: TORCH });
  const tokens: Record<string, TokenEntity> = {};
  const token = (id: string, more: Partial<TokenEntity>): void => {
    tokens[id] = { id, kind: 'token', imagePath: '', size: 1, x: 16 + Math.floor(rand() * 15) * 32, y: 16 + Math.floor(rand() * 15) * 32, ...more } as TokenEntity;
  };
  for (let hero = 0; hero < 4; hero++) token(`hero-${hero}`, { vision: { enabled: true, range: 60 }, light: TORCH } as Partial<TokenEntity>);
  for (let monster = 0; monster < 24; monster++) token(`monster-${monster}`, { isHidden: monster % 4 === 0 });
  const drawings: Record<string, DrawingStroke> = {};
  for (let index = 0; index < 5; index++) {
    drawings[`d${index}`] = { id: `d${index}`, kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: rand() * SIZE, y: rand() * SIZE }, { x: rand() * SIZE, y: rand() * SIZE }], color: '#ffffff', width: 4, opacity: 1, hidden: index % 2 === 0 };
  }
  const ruler: KeptMeasure = { id: 'kept', kind: 'measure', shape: 'ruler', points: [{ x: 48, y: 48 }, { x: 400, y: 48 }] };
  store.setState((state) => ({
    lighting: { ...state.lighting, enabled: true, ambient: 0.1 },
    objects: { ...state.objects, tokens, drawings, measures: { kept: ruler }, fog: { hall: fogRectangle({ id: 'hall', x: 0, y: 400, width: SIZE, height: 112 }) } },
  }));
  await expect.poll(() => Object.keys(tokens).every((id) => scene.view.getTokenRenderer()?.getTokenSprites()[id] instanceof Container), { timeout: 20_000 }).toBe(true);
  return scene;
}

/**
 * What one step of a token drag costs on a map view whose players are shown a lit scene: each
 * step writes the store as a drag does, mirrors the players' frame as the player window's capture
 * does (`withPlayerSafeFrame`, which renders the GM's canvas after it) and waits for the graphics
 * device. Measured, not budgeted: the figures are printed for whoever compares them.
 */
describe('the cost of a drag on a lit map view mirrored to the player window', () => {
  const cleanup: Array<() => void> = [];
  // Taking down a lit view of this size takes tens of seconds in the headless browser, on a busy machine more.
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  }, 120_000);

  it.each([
    ['in the GM view', true],
    ['in session view', false],
  ])('costs a step %s', async (name, gmView) => {
    const scene = await dungeon();
    cleanup.push(scene.destroy);
    const { view, app, store, settings } = scene;
    store.getState().setGMView(gmView);
    const gl = (app.renderer as unknown as { gl: WebGL2RenderingContext }).gl;
    const players = settings.getLocalPlayerViewSettings();
    let time = performance.now();
    const step = (index: number): number => {
      const start = performance.now();
      store.getState().moveToken('hero-0', 16 + (index % 15) * 32, 240);
      app.ticker.update((time += 16));
      view.withPlayerSafeFrame(() => undefined, players, FRAME);
      gl.finish();
      return performance.now() - start;
    };
    const costs: number[] = [];
    for (let index = 0; index < WARM_UP + STEPS; index++) {
      const cost = step(index);
      if (index >= WARM_UP) costs.push(cost);
    }
    const moved = view.getTokenRenderer()!.getTokenSprites()['hero-0']!;
    expect(moved.y).toBe(240);
    console.info(`[canvasAudienceCost] ${name}: median ${median(costs).toFixed(2)} ms a step over ${STEPS} steps`);
  });
});
