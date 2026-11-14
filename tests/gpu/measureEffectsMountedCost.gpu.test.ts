import { RenderTexture, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { LIGHTING_QUALITY } from '../../src/app/lighting/lightingQuality';
import { MEASURE_EFFECTS, type MeasureEffect } from '../../src/app/measure/measureEffects';
import { toolLook } from '../../src/app/measure/measureLights';
import { viewPlayback } from '../../src/app/pixi/liquids/viewLiquids';
import { MeasureRenderer, type MeasureGrid } from '../../src/app/pixi/measure/MeasureRenderer';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { requestRender } from '../../src/app/pixi/RenderScheduler';
import { openLitView } from '../helpers/litView';
import { gpuMs } from './measureEffectsHarness';

vi.mock('events', async () => import('eventemitter3'));

/**
 * What kept areas with effects and lights cost on a lit map with the players' frame rendered
 * beside the GM's: eight circles six cells across in a 1440 × 900 view of a walled map, at the
 * Balanced quality. A frame is one display frame of the GM's window: the lighting's own work in
 * its tick, the stage's render, and the players' frame of the same size. Printed for the scene
 * without measurements, with plain areas, with effects alone, with lights alone and with both;
 * and, left alone, how many renders a second the areas ask for. Not held to a budget: CI has no
 * graphics card.
 */

const PANE = { width: 1440, height: 900 };
const MAP = 2048;
const CELL = 56;
const FRAMES = 30;
const SCALE = { unitDistance: 5, cellSize: CELL };
const GRID: MeasureGrid = {
  getOptions: () => ({ type: 'square', size: CELL, offsetX: 0, offsetY: 0 }),
  snapToCellCenter: (x, y) => ({ x: Math.floor(x / CELL) * CELL + CELL / 2, y: Math.floor(y / CELL) * CELL + CELL / 2 }),
};
type Variant = 'no measurements' | 'eight plain areas' | 'effects' | 'lights' | 'effects and lights';
const VARIANTS: readonly Variant[] = ['no measurements', 'eight plain areas', 'effects', 'lights', 'effects and lights'];

const median = (samples: number[]): number | null => (samples.length ? [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)]! : null);

describe('the cost of kept areas with effects and lights on a lit map', () => {
  async function measure(variant: Variant): Promise<string> {
    const view = await openLitView({ pane: PANE, map: MAP, floor: 0x8a8272, grid: CELL, quality: LIGHTING_QUALITY.balanced });
    const { app, viewport, store, controller, displayFrames } = view;
    const renderer = app.renderer as WebGLRenderer;
    const areas = new MeasureRenderer(viewport, store, GRID, undefined, viewPlayback(app, viewport, store, { current: () => LIGHTING_QUALITY.balanced, onChange: () => () => undefined }));
    areas.mapBounds = () => ({ width: MAP, height: MAP });
    areas.effects.setMode('play');
    const state = store.getState();
    state.setSceneLighting({ enabled: true, ambient: 0.15 });
    // Rooms around the view's middle: walls for every light to be traced through.
    for (let i = 0; i < 6; i++) {
      const x = 400 + i * 250;
      state.addWall({ type: 'solid', p1: { x, y: 560 }, p2: { x, y: 800 } });
      state.addWall({ type: 'solid', p1: { x, y: 1250 }, p2: { x, y: 1490 } });
      state.addWall({ type: 'solid', p1: { x: x + 40, y: 1024 }, p2: { x: x + 170, y: 1024 } });
    }
    if (variant !== 'no measurements') {
      for (let i = 0; i < 8; i++) {
        const origin = { x: 1024 + ((i % 4) - 1.5) * 340, y: 1024 + (i < 4 ? -230 : 230) };
        const area = { shape: 'circle' as const, points: [origin, { x: origin.x + 3 * CELL, y: origin.y }] };
        // Fire, lightning and radiance give light, shadow a darkness; where lights alone are measured, every area gives one.
        const effect: MeasureEffect = MEASURE_EFFECTS[i % MEASURE_EFFECTS.length]!;
        const look = toolLook(area, { color: null, effect }, { scale: SCALE, lit: true, accent: '#7f6df2' });
        const light = look.light ?? toolLook(area, { color: null, effect: 'fire' }, { scale: SCALE, lit: true, accent: '#7f6df2' }).light!;
        state.addMeasure({
          ...area,
          ...(variant === 'effects' || variant === 'effects and lights' ? { effect } : {}),
          ...(variant === 'lights' || variant === 'effects and lights' ? { light } : {}),
        });
      }
    }
    displayFrames(90);
    const target = RenderTexture.create({ width: PANE.width, height: PANE.height });
    const players = [...controller.playerLayers(), ...areas.getPlayerViewLayers(() => true)];
    const frame = (): void => {
      requestRender(app);
      displayFrames(1);
      captureWithLayerVisibility(players, () => undefined, () => renderer.render({ container: app.stage, target, clear: true }));
    };
    for (let warm = 0; warm < 10; warm++) frame();
    const gpu: number[] = [];
    const cpu: number[] = [];
    for (let sample = 0; sample < 9; sample++) {
      let spent = 0;
      const ms = await gpuMs(renderer, () => {
        const start = performance.now();
        for (let i = 0; i < FRAMES; i++) frame();
        spent = performance.now() - start;
      });
      if (ms !== null) gpu.push(ms / FRAMES);
      cpu.push(spent / FRAMES);
    }
    // Left alone for a second: the renders the areas ask for by themselves.
    let renders = 0;
    const count = (): void => { renders++; };
    renderer.runners.prerender.add({ prerender: count });
    displayFrames(62);
    renderer.runners.prerender.remove({ prerender: count });
    const middle = median(gpu);
    target.destroy(true);
    areas.destroy();
    view.dispose();
    return `${variant}: ${middle === null ? 'no timer' : `${middle.toFixed(2)} ms GPU`}, ${median(cpu)!.toFixed(2)} ms CPU a frame; left alone ${renders} renders a second`;
  }

  it('prints what a kept area\'s light costs when the area is moved: a circle\'s point light and a line\'s area light', async () => {
    const view = await openLitView({ pane: PANE, map: MAP, floor: 0x8a8272, grid: CELL, quality: LIGHTING_QUALITY.balanced });
    const { app, viewport, store, displayFrames } = view;
    const renderer = app.renderer as WebGLRenderer;
    const areas = new MeasureRenderer(viewport, store, GRID, undefined, viewPlayback(app, viewport, store));
    areas.mapBounds = () => ({ width: MAP, height: MAP });
    const state = store.getState();
    state.setSceneLighting({ enabled: true, ambient: 0.15 });
    for (let i = 0; i < 6; i++) {
      const x = 400 + i * 250;
      state.addWall({ type: 'solid', p1: { x, y: 560 }, p2: { x, y: 800 } });
      state.addWall({ type: 'solid', p1: { x, y: 1250 }, p2: { x, y: 1490 } });
      state.addWall({ type: 'solid', p1: { x: x + 40, y: 1024 }, p2: { x: x + 170, y: 1024 } });
    }
    displayFrames(60);
    const lines: string[] = [];
    const shapes = [
      ['a circle six cells across', { shape: 'circle' as const, points: [{ x: 700, y: 900 }, { x: 700 + 3 * CELL, y: 900 }] }],
      ['a line twelve cells long, one wide', { shape: 'line' as const, points: [{ x: 600, y: 1140 }, { x: 600 + 12 * CELL, y: 1140 }], width: CELL }],
    ] as const;
    for (const [name, area] of shapes) {
      const light = toolLook(area, { color: null, effect: 'fire' }, { scale: SCALE, lit: true, accent: '#7f6df2' }).light!;
      const started = performance.now();
      const id = store.getState().addMeasure({ ...area, points: [...area.points], effect: 'fire', light })!;
      const made = performance.now() - started;
      displayFrames(30);
      const cpu: number[] = [];
      const gpu: number[] = [];
      for (let step = 1; step <= 16; step++) {
        const points = area.points.map(({ x, y }) => ({ x: x + step * 6, y: y + step * 3 }));
        let spent = 0;
        const ms = await gpuMs(renderer, () => {
          const start = performance.now();
          store.getState().updateMeasure(id, { points });
          displayFrames(1);
          spent = performance.now() - start;
        });
        cpu.push(spent);
        if (ms !== null) gpu.push(ms);
      }
      lines.push(`${name}: made in ${made.toFixed(1)} ms CPU; moved, a step ${median(cpu)!.toFixed(2)} ms CPU, ${median(gpu)?.toFixed(2) ?? 'no timer'} ms GPU`);
      store.getState().deleteMeasure(id);
      displayFrames(10);
    }
    console.log(`[measure effects mounted] a lit area made and dragged, 18 walls, Balanced:\n${lines.join('\n')}`);
    areas.destroy();
    view.dispose();
    expect(lines).toHaveLength(2);
  }, 120_000);

  it('prints a frame\'s time with and without eight lit, animated areas at Balanced', async () => {
    const lines: string[] = [];
    for (const variant of VARIANTS) lines.push(await measure(variant));
    console.log(`[measure effects mounted] ${PANE.width}x${PANE.height}, GM's render and the players' frame, Balanced:\n${lines.join('\n')}`);
    expect(lines).toHaveLength(VARIANTS.length);
  }, 240_000);
});
