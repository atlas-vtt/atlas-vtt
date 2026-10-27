import '../setup/obsidianDom';
import { Application, RenderTexture, Sprite, Texture, Ticker, WebGLRenderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { commands } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { LightEmission, LightSource } from '../../src/app/types/lightingTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { LightingRenderer } from '../../src/app/pixi/lighting/LightingRenderer';
import { readRgba } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { lightLevelAt } from '../../src/app/vision/lightLevels';
import { tokenPerception } from '../../src/app/vision/tokenPerception';
import type { Point } from '../../src/app/types/visionTypes';

vi.mock('events', async () => import('eventemitter3'));

const MAP = 1024;
const MEASUREMENT: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };
const TORCH: LightEmission = { bright: 20, dim: 40, color: '#ffcc88', intensity: 1, animation: 'none', kind: 'torch' };

let wallId = 0;
function wall(x1: number, y1: number, x2: number, y2: number): WallSegment {
  return { id: `w${wallId++}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
}

/** Room A (100..500 × 100..500) with an opening (y 400..480) in its east wall into room B (500..900 × 100..900). */
function rooms(): WallSegment[] {
  return [
    wall(100, 100, 900, 100), wall(100, 100, 100, 500), wall(100, 500, 500, 500),
    wall(500, 100, 500, 400), wall(500, 480, 500, 900),
    wall(900, 100, 900, 900), wall(500, 900, 900, 900),
  ];
}

function token(x: number, y: number, vision: TokenEntity['vision'], id = 'hero'): TokenEntity {
  return { id, kind: 'token', imagePath: '', x, y, size: 1, layer: 0, rotation: 0, isHidden: false, ...(vision && { vision }) };
}

/**
 * Room A (100..500 square) with a corridor leaving its east wall at the south (500..680 ×
 * 420..500), which turns north at its end (600..680) into room B (520..980 × 100..340): a light in
 * room A lights the corridor and the turn's floor, and room B lies round the turn's corner. From
 * room B's south-east a passage (900..980) leads down into room C (700..980 × 520..900), round a
 * second corner.
 */
function cornerRooms(): WallSegment[] {
  return [
    wall(100, 100, 500, 100), wall(100, 100, 100, 500), wall(100, 500, 680, 500), wall(500, 100, 500, 420),
    wall(500, 420, 600, 420), wall(600, 420, 600, 340), wall(680, 500, 680, 340), wall(520, 340, 600, 340),
    wall(680, 340, 900, 340), wall(520, 100, 520, 340), wall(520, 100, 980, 100), wall(980, 100, 980, 900),
    wall(900, 340, 900, 520), wall(700, 520, 900, 520), wall(700, 520, 700, 900), wall(700, 900, 980, 900),
  ];
}

/** Room B next to the turn, where the light round the corner falls. */
const NEAR_TURN = { x0: 560, x1: 760, y0: 230, y1: 335 };
/** Room C, round the second corner. */
const ROOM_C = { x0: 710, x1: 890, y0: 530, y1: 890 };

function light(x: number, y: number, extra: Partial<LightSource> = {}): LightSource {
  return { id: 'light', kind: 'light', x, y, emission: TORCH, ...extra };
}

async function savePng(pixels: Uint8ClampedArray, name: string): Promise<void> {
  const canvas = new OffscreenCanvas(MAP, MAP);
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), MAP, MAP), 0, 0);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  await commands.writeFile(`out/light-reach/${name}.png`, btoa(binary), 'base64');
}

interface Shot {
  pixels: Uint8ClampedArray;
  /** The colour at world pixel (x, y): the camera shows the map at scale 1. */
  at: (x: number, y: number) => readonly [number, number, number];
}

/**
 * A light in one room and a party token in the next, which sees the floor the light reaches
 * through the opening but not the light. The players' picture shows the light the scene has
 * wherever the token sees, as it does with token vision off: sight decides only where the
 * players look, never which light there is (Fabian's report of 2026-10-23, light that seemed to
 * need a token in its room). Pictures in `out/light-reach/`.
 */
describe('light that reaches a room a party token stands in', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  /** The players' picture of the scene through the view's own lighting, as the canvas shows it in session view. */
  async function picture(objects: Partial<ViewAtlasState['objects']>, lighting: Partial<ViewAtlasState['lighting']>): Promise<Shot> {
    return (await scene(objects, lighting)).shot;
  }

  /** `picture`, with the rule as the view has it. */
  async function scene(objects: Partial<ViewAtlasState['objects']>, lighting: Partial<ViewAtlasState['lighting']>): Promise<{ shot: Shot; view: LightingRenderer; tokens: Record<string, TokenEntity> }> {
    const renderer = new WebGLRenderer();
    await renderer.init({ width: MAP, height: MAP, backgroundAlpha: 1, useBackBuffer: true });
    const app = new Application();
    app.renderer = renderer;
    app.ticker = new Ticker();
    const ticks: (() => void)[] = [];
    app.ticker.add = ((tick: () => void) => (ticks.push(tick), app.ticker)) as Ticker['add'];
    const viewport = new Viewport({ screenWidth: MAP, screenHeight: MAP, worldWidth: MAP, worldHeight: MAP, events: renderer.events });
    viewport.sortableChildren = true;
    app.stage.addChild(viewport);
    const floor = new Sprite(Texture.WHITE);
    floor.setSize(MAP, MAP);
    floor.tint = 0x8a857c;
    viewport.addChild(floor);
    const store = createViewAtlasStore(createInMemoryApp().app, `light-reach-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/light-reach.atlasmap');
    store.setState((state) => ({ grid: { ...state.grid, size: 50 }, objects: { ...state.objects, ...objects } }));
    store.getState().setSceneLighting({ enabled: true, ambient: 0, ...lighting });
    const view = new LightingRenderer({ viewport, app, store, measurement: () => MEASUREMENT, bounds: () => ({ width: MAP, height: MAP }), albedo: () => null });
    cleanup.push(() => {
      view.destroy();
      app.ticker.destroy();
      viewport.destroy({ children: true });
      app.stage.destroy();
      renderer.destroy();
    });
    // Builds every tile and the bounce, which the paced view would spread over frames.
    view.renderForFrame({ x: 0, y: 0, resolution: 1 }, () => undefined);
    view.modeLayer.visible = true;
    const target = RenderTexture.create({ width: MAP, height: MAP });
    cleanup.push(() => target.destroy(true));
    for (let i = 0; i < 3; i++) {
      renderer.render({ container: app.stage, target, clear: true });
      ticks.forEach((tick) => tick());
    }
    renderer.render({ container: app.stage, target, clear: true });
    const pixels = readRgba(renderer, target);
    const shot: Shot = { pixels, at: (x, y) => [pixels[(y * MAP + x) * 4]!, pixels[(y * MAP + x) * 4 + 1]!, pixels[(y * MAP + x) * 4 + 2]!] };
    return { shot, view, tokens: store.getState().objects.tokens };
  }

  const sum = (pixel: readonly number[]): number => pixel[0]! + pixel[1]! + pixel[2]!;

  it.each([
    ['point', light(300, 300)],
    ['area', light(300, 300, { area: [{ x: 250, y: 250 }, { x: 350, y: 250 }, { x: 350, y: 350 }, { x: 250, y: 350 }] })],
  ])('shows a %s light in the next room to a token there as with token vision off', async (name, source) => {
    const objects = { walls: Object.fromEntries(rooms().map((w) => [w.id, w])), lights: { light: source }, tokens: { hero: token(800, 800, { enabled: true }) } };
    const seeing = await picture(objects, {});
    const all = await picture(objects, { tokenVision: false });
    await savePng(seeing.pixels, `${name}-vision`);
    await savePng(all.pixels, `${name}-no-vision`);
    let lit = 0;
    // Room B, which the token sees whole; the token's own footprint is left out.
    for (let y = 110; y < 890; y += 2) {
      for (let x = 510; x < 890; x += 2) {
        if (Math.hypot(x - 800, y - 800) < 30) continue;
        const shown = seeing.at(x, y);
        const scene = all.at(x, y);
        // Never darker than the scene's light; where it is brighter than what is remembered, exactly it.
        expect([x, y, sum(shown) >= sum(scene) - 3]).toEqual([x, y, true]);
        if (sum(scene) < 120) continue;
        lit++;
        expect([x, y, shown.every((channel, i) => Math.abs(channel - scene[i]!) <= 2)]).toEqual([x, y, true]);
      }
    }
    // The light reaches into room B through the opening.
    expect(lit).toBeGreaterThan(300);
  });

  /**
   * Reflected light: what a light's lit floor gives back reaches round a corner, as far as what
   * is left of its range; the rule counts it dim, a token standing in it is seen, and a room
   * round a second corner stays dark. The floor there (#8a857c) shows at its brightest 45 (torch)
   * and 96 (lava, 10/30 ft) in the sum of its channels, where it was black before reflected light,
   * fading to nothing where the rule stops counting it; it must show at least 40 and 85.
   */
  it.each([
    ['torch', light(420, 460), 40],
    ['lava', light(555, 465, { emission: { bright: 10, dim: 30, color: '#ff8a3d', intensity: 1, animation: 'none', kind: 'custom' }, area: [{ x: 520, y: 440 }, { x: 590, y: 440 }, { x: 590, y: 490 }, { x: 520, y: 490 }] }), 85],
  ])('lights the room round the corner from a %s, and not the room round two', async (name, source, threshold) => {
    const walls = Object.fromEntries(cornerRooms().map((w) => [w.id, w]));
    const objects = { walls, lights: { light: source }, tokens: { hero: token(820, 200, { enabled: true }) } };
    const { shot: seeing, view, tokens } = await scene(objects, {});
    const all = await picture(objects, { tokenVision: false });
    await savePng(seeing.pixels, `corner-${name}-vision`);
    await savePng(all.pixels, `corner-${name}-no-vision`);
    const reaches = view.lightReaches();
    const ambient = view.ambientLight();
    const direct = reaches.map(({ reflection: _reflection, ...reach }) => reach);
    const level = (p: Point, lights = reaches): string => lightLevelAt(p, ambient, lights);
    // Next to the turn: lit by the reflection alone, as the rule counts it, and as the picture shows it.
    const reflected: Point[] = [];
    let brightest = 0;
    for (let y = NEAR_TURN.y0; y < NEAR_TURN.y1; y += 3) {
      for (let x = NEAR_TURN.x0; x < NEAR_TURN.x1; x += 3) {
        if (level({ x, y }, direct) !== 'dark' || level({ x, y }) !== 'dim') continue;
        reflected.push({ x, y });
        brightest = Math.max(brightest, sum(all.at(x, y)));
        // The party's own picture shows it as the scene has it, or the memory of it where that is brighter.
        expect([x, y, sum(seeing.at(x, y)) >= sum(all.at(x, y)) - 3]).toEqual([x, y, true]);
      }
    }
    expect(reflected.length).toBeGreaterThan(100);
    expect(brightest).toBeGreaterThan(threshold);
    // A goblin standing in it, without vision of its own, is seen by the party in room B, and only by that light.
    const at = reflected[Math.floor(reflected.length / 2)]!;
    const withGoblin = { ...tokens, goblin: token(at.x, at.y, undefined, 'goblin') };
    expect(tokenPerception(view.currentSight(), ambient, reaches, withGoblin)('goblin')).toBe('seen');
    expect(tokenPerception(view.currentSight(), ambient, direct, withGoblin)('goblin')).toBe('unseen');
    // Round the second corner: nothing, by the rule and in the picture.
    for (let y = ROOM_C.y0; y < ROOM_C.y1; y += 5) {
      for (let x = ROOM_C.x0; x < ROOM_C.x1; x += 5) {
        expect([x, y, level({ x, y })]).toEqual([x, y, 'dark']);
        expect([x, y, sum(all.at(x, y)) <= 6]).toEqual([x, y, true]);
      }
    }
  });
});
