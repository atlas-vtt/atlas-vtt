import '../setup/obsidianDom';
import { Application, RenderTexture, Sprite, Texture, Ticker, WebGLRenderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { commands } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { LightEmission, LightSource } from '../../src/app/types/lightingTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { LIGHT_FADE_MIN } from '../../src/app/lighting/lightingConstants';
import type { TokenEntity } from '../../src/app/types';
import { LightingRenderer } from '../../src/app/pixi/lighting/LightingRenderer';
import { readRgba } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';

vi.mock('events', async () => import('eventemitter3'));

const WIDTH = 1400;
const HEIGHT = 1700;
const CELL = 50;
const MEASUREMENT: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };
/** World pixels per foot on this grid. */
const FOOT = CELL / 5;

let wallId = 0;
function wall(x1: number, y1: number, x2: number, y2: number): WallSegment {
  return { id: `w${wallId++}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
}

/** A large dark hall with a square pillar east of where the lights stand, and a wall with a doorway north of them. */
function hall(): WallSegment[] {
  return [
    wall(20, 20, 1380, 20), wall(1380, 20, 1380, 1680), wall(1380, 1680, 20, 1680), wall(20, 1680, 20, 20),
    wall(640, 460, 700, 460), wall(700, 460, 700, 540), wall(700, 540, 640, 540), wall(640, 540, 640, 460),
    wall(200, 250, 420, 250), wall(500, 250, 900, 250),
  ];
}

const LOOKS: Record<string, { emission?: LightEmission; area?: LightSource['area']; rotation?: number }> = {
  torch: { emission: { bright: 20, dim: 40, color: '#ff9a3c', intensity: 1, animation: 'none', kind: 'torch', sourceRadius: 2 } },
  candle: { emission: { bright: 5, dim: 10, color: '#ffb347', intensity: 0.9, animation: 'none', kind: 'candle', sourceRadius: 1 } },
  lantern: { emission: { bright: 30, dim: 60, color: '#ffd28a', intensity: 1, animation: 'none', kind: 'lantern', sourceRadius: 1.5 } },
  beam: { emission: { bright: 30, dim: 60, color: '#ffd28a', intensity: 1, animation: 'none', kind: 'lantern', sourceRadius: 1.5, angle: 53 }, rotation: 135 },
  lava: {
    emission: { bright: 5, dim: 20, color: '#ff8a3d', intensity: 1, animation: 'none', kind: 'custom' },
    area: [{ x: 420, y: 440 }, { x: 560, y: 430 }, { x: 590, y: 520 }, { x: 500, y: 590 }, { x: 410, y: 550 }],
  },
  /** No light: a token with 60 ft of darkvision in the dark, the hall seen in the grey of darkvision. */
  darkvision: {},
};

/** The token of the darkvision scene, where the lights stand. */
const SEER: TokenEntity = { id: 'seer', kind: 'token', imagePath: '', x: 300, y: 500, size: 1, layer: 0, rotation: 0, isHidden: false, vision: { enabled: true, range: 200, darkvision: 60 } };

async function savePng(pixels: Uint8ClampedArray, width: number, height: number, name: string): Promise<void> {
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  await commands.writeFile(`out/light-look/${name}.png`, btoa(binary), 'base64');
}

/**
 * How lights look in a dark hall, in the players' picture with token vision off: from its bright
 * radius every light fades into the dark (`FADE_GLSL`), with no ring where the fade begins, nearly
 * black at its dim radius, where the rules stop counting it, and nothing of it past that; and how
 * a token's darkvision fades towards the edge of its range (`SENSE_FADE`). Pictures in
 * `out/light-look/`, whole at zoom 0.6 and the fade close up at zoom 3.
 */
describe('the look of a light in the dark', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  /** The picture at `zoom` with world point (x, y) in its top-left corner, `width` × `height` screen pixels. */
  async function picture(name: string, zoom: number, x: number, y: number, width: number, height: number): Promise<(sx: number, sy: number) => number> {
    const look = LOOKS[name]!;
    const renderer = new WebGLRenderer();
    await renderer.init({ width, height, backgroundAlpha: 1, useBackBuffer: true });
    const app = new Application();
    app.renderer = renderer;
    app.ticker = new Ticker();
    const ticks: (() => void)[] = [];
    app.ticker.add = ((tick: () => void) => (ticks.push(tick), app.ticker)) as Ticker['add'];
    const viewport = new Viewport({ screenWidth: width, screenHeight: height, worldWidth: WIDTH, worldHeight: HEIGHT, events: renderer.events });
    viewport.sortableChildren = true;
    app.stage.addChild(viewport);
    const floor = new Sprite(Texture.WHITE);
    floor.setSize(WIDTH, HEIGHT);
    floor.tint = 0x8a857c;
    viewport.addChild(floor);
    viewport.scale.set(zoom);
    viewport.position.set(-x * zoom, -y * zoom);
    const store = createViewAtlasStore(createInMemoryApp().app, `light-look-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/light-look.atlasmap');
    const lights: Record<string, LightSource> = look.emission
      ? { light: { id: 'light', kind: 'light', x: 300, y: 500, emission: look.emission, ...(look.area && { x: 495, y: 505, area: look.area }), ...(look.rotation !== undefined && { rotation: look.rotation }) } }
      : {};
    const tokens = look.emission ? {} : { seer: SEER };
    store.setState((state) => ({ grid: { ...state.grid, size: CELL }, objects: { ...state.objects, walls: Object.fromEntries(hall().map((w) => [w.id, w])), lights, tokens } }));
    store.getState().setSceneLighting({ enabled: true, ambient: 0, tokenVision: !look.emission, exploredMemory: false });
    const view = new LightingRenderer({ viewport, app, store, measurement: () => MEASUREMENT, bounds: () => ({ width: WIDTH, height: HEIGHT }), albedo: () => null });
    cleanup.push(() => {
      view.destroy();
      app.ticker.destroy();
      viewport.destroy({ children: true });
      app.stage.destroy();
      renderer.destroy();
    });
    view.renderForFrame({ x: 0, y: 0, resolution: 1 }, () => undefined);
    view.modeLayer.visible = true;
    const target = RenderTexture.create({ width, height });
    cleanup.push(() => target.destroy(true));
    for (let i = 0; i < 3; i++) {
      renderer.render({ container: app.stage, target, clear: true });
      ticks.forEach((tick) => tick());
    }
    renderer.render({ container: app.stage, target, clear: true });
    const pixels = readRgba(renderer, target);
    await savePng(pixels, width, height, `${name}-zoom${zoom}`);
    return (sx, sy) => pixels[(sy * width + sx) * 4]! + pixels[(sy * width + sx) * 4 + 1]! + pixels[(sy * width + sx) * 4 + 2]!;
  }

  it.each(Object.keys(LOOKS))('draws a %s that fades into the dark within what the rules count', async (name) => {
    await picture(name, 0.6, 0, 0, 840, 1020);
    const { emission, area } = LOOKS[name]!;
    if (area || emission?.angle) {
      // The pool's and the beam's fades are looked at in the pictures; the profile below is a round one's.
      await picture(name, 2, 150, 700, 1024, 280);
      return;
    }
    // A light fades from its bright radius (or `LIGHT_FADE_MIN` before its dim radius) to its dim
    // radius; darkvision of 60 ft over the last `SENSE_FADE` of it, with sight ending at 200 px.
    const [from, end] = emission ? [Math.min(emission.bright, emission.dim * (1 - LIGHT_FADE_MIN)) * FOOT, emission.dim * FOOT] : [0.6 * 60 * FOOT, 60 * FOOT];
    // Close up, south of the light, where the floor is open: from the fade's start to past its end.
    const zoom = 3;
    const top = 500 + from - 10;
    const rows = Math.min(1024, Math.ceil((end - from + 40) * zoom));
    const at = await picture(name, zoom, 300 - 50, top, 300, rows);
    const profile = Array.from({ length: rows }, (_, sy) => at(150, sy));
    const sample = (d: number): number => profile[Math.min(profile.length - 1, Math.round((500 + d - top) * zoom))]!;
    const start = sample(from);
    // Lit where the fade begins, still clearly halfway, nearly black at its end, and past it only the floor's bounce.
    expect(start).toBeGreaterThan(60);
    expect(sample((from + end) / 2)).toBeGreaterThan(start * 0.3);
    expect(sample(end - 2)).toBeLessThan(start * 0.2);
    expect(sample(end + 4)).toBeLessThan(start * 0.06);
    // No ring and no step: never brighter outwards, and no screen pixel more than a few levels below the last.
    for (let i = 1; i < profile.length; i++) {
      expect([i, profile[i]! <= profile[i - 1]! + 3]).toEqual([i, true]);
      expect([i, profile[i - 1]! - profile[i]! <= 6]).toEqual([i, true]);
    }
  });
});
