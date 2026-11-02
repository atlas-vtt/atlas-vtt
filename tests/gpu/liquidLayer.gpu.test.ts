import { Container, Graphics, RenderTexture, Ticker, type TextureSource, type WebGLRenderer } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LiquidLayer, type LiquidLayerDeps } from '../../src/app/pixi/liquids/LiquidLayer';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import type { LiquidKind, LiquidSurface } from '../../src/app/types/liquidTypes';
import type { Point } from '../../src/app/types/visionTypes';
import { pointInPolygon } from '../../src/app/vision/visibility';

/**
 * The liquid layer as a view uses it: it draws nothing outside a surface's outline or inside its
 * holes, asks for renders only while it plays and is in view, gives a picture of the scene the
 * still moment and puts the moment shown back after it, and leaves nothing behind.
 */

const SIZE = 320;
const CELL = 70;
const COLORS = { surface: '#4f86a8', deep: '#1d3f5c', glint: '#e8f7ff' };

/** A lake that bends round on itself, with an island. */
const LAKE: Point[] = Array.from({ length: 90 }, (_, k) => {
  const angle = (k / 90) * Math.PI * 2;
  const radius = 120 * (1 + 0.3 * Math.sin(angle * 3));
  return { x: 160 + Math.cos(angle) * radius, y: 160 + Math.sin(angle) * radius * 0.8 };
});
const ISLAND: Point[] = [{ x: 140, y: 140 }, { x: 185, y: 145 }, { x: 175, y: 185 }, { x: 135, y: 175 }];

function shoreDistance(point: Point): number {
  let nearest = Infinity;
  for (const ring of [LAKE, ISLAND]) {
    ring.forEach((a, index) => {
      const b = ring[(index + 1) % ring.length]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
      nearest = Math.min(nearest, Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t));
    });
  }
  return nearest;
}

/** How many pixels two pictures differ in. */
function differing(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) count++;
  return count;
}

type State = ReturnType<LiquidLayerDeps['store']['getState']>;

function storeOf(liquids: Record<string, LiquidSurface>): LiquidLayerDeps['store'] & { set(liquids: Record<string, LiquidSurface>): void } {
  let state = { objects: { liquids }, levels: undefined, viewedLevel: undefined, grid: { size: CELL } } as unknown as State;
  const listeners = new Set<(state: State) => void>();
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      state = { ...state, objects: { liquids: next } } as unknown as State;
      for (const listener of listeners) listener(state);
    },
  };
}

const lake = (liquid: LiquidKind): LiquidSurface => ({ id: `lake-${liquid}`, kind: 'liquid', liquid, polygon: LAKE, holes: [ISLAND], colors: COLORS, flow: { x: 1, y: 0 } });

interface Harness {
  layer: LiquidLayer;
  ticker: Ticker;
  renders: () => number;
  clock: { now: number };
  store: ReturnType<typeof storeOf>;
}

function harness(liquids: Record<string, LiquidSurface>, inView = (): boolean => true): Harness {
  const ticker = new Ticker();
  ticker.autoStart = false;
  ticker.stop();
  let renders = 0;
  const clock = { now: 0 };
  const store = storeOf(liquids);
  const layer = new LiquidLayer({ store, ticker, requestRender: () => { renders++; }, inView, drawable: true, now: () => clock.now });
  layer.buildPending();
  return { layer, ticker, renders: () => renders, clock, store };
}

/** Runs the layer's ticker over `seconds` at 60 frames a second. */
function play({ ticker, clock }: Harness, seconds: number): void {
  for (let frame = 0; frame < seconds * 60; frame++) {
    clock.now += 1000 / 60;
    ticker.update(clock.now);
  }
}

describe('the liquid layer', () => {
  let renderer: WebGLRenderer;
  beforeAll(async () => { renderer = await createTestRenderer(SIZE); });
  afterAll(() => renderer.destroy());

  /** The scene's pixels with the layer over a striped backdrop, at `zoom` about the lake's middle. */
  function picture(layer: LiquidLayer | null, zoom: number): Uint8ClampedArray {
    const world = new Container();
    const backdrop = new Graphics();
    for (let x = -400; x < 800; x += 20) backdrop.rect(x, -400, 10, 1200).fill(x % 40 === 0 ? 0x8a7f6a : 0x5a6b4c);
    world.addChild(backdrop);
    if (layer) world.addChild(layer.container);
    world.scale.set(zoom);
    world.position.set(SIZE / 2 - 160 * zoom, SIZE / 2 - 160 * zoom);
    const target = RenderTexture.create({ width: SIZE, height: SIZE, antialias: false });
    renderer.render({ container: world, target, clear: true });
    const { pixels } = renderer.extract.pixels({ target });
    target.destroy(true);
    if (layer) world.removeChild(layer.container);
    world.destroy({ children: true });
    return new Uint8ClampedArray(pixels);
  }

  it('draws inside each surface\'s outline only, never on what stands dry in it', () => {
    for (const liquid of ['water', 'lava', 'acid'] as const) {
      const scene = harness({ lake: lake(liquid) });
      scene.layer.setMode('play');
      play(scene, 3);
      for (const zoom of [0.4, 1, 3.5]) {
        const plain = picture(null, zoom);
        const drawn = picture(scene.layer, zoom);
        let changed = 0;
        const strays: string[] = [];
        for (let y = 0; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) {
            const at = (y * SIZE + x) * 4;
            if (plain[at] === drawn[at] && plain[at + 1] === drawn[at + 1] && plain[at + 2] === drawn[at + 2]) continue;
            changed++;
            const world = { x: (x + 0.5 - SIZE / 2) / zoom + 160, y: (y + 0.5 - SIZE / 2) / zoom + 160 };
            // A pixel whose centre lies on the outline to within the rasteriser's rounding may go either way.
            const onOutline = shoreDistance(world) < 0.01 / zoom;
            if (!onOutline && (!pointInPolygon(world, LAKE) || pointInPolygon(world, ISLAND))) strays.push(`${liquid} at zoom ${zoom}: ${x},${y}`);
          }
        }
        expect(changed, `${liquid} draws at zoom ${zoom}`).toBeGreaterThan(1000);
        expect(strays.slice(0, 5)).toEqual([]);
      }
      scene.layer.destroy();
    }
  });

  it('asks for at most 30 renders a second while it plays and a surface is in view, and none otherwise', () => {
    let shown = true;
    const scene = harness({ lake: lake('water') }, () => shown);
    scene.layer.setMode('play');
    const start = scene.renders();
    play(scene, 2);
    const playing = scene.renders() - start;
    expect(playing).toBeGreaterThanOrEqual(55);
    expect(playing).toBeLessThanOrEqual(61);

    shown = false;
    const hidden = scene.renders();
    play(scene, 2);
    expect(scene.renders()).toBe(hidden);
    shown = true;

    for (const mode of ['pause', 'poster'] as const) {
      scene.layer.setMode(mode);
      const before = scene.renders();
      play(scene, 2);
      expect(scene.renders(), mode).toBe(before);
    }
    scene.layer.destroy();

    const empty = harness({});
    empty.layer.setMode('play');
    play(empty, 2);
    expect(empty.renders()).toBe(0);
    empty.layer.destroy();
  });

  it('holds the moment shown while paused, and shows the still moment with animation off and in a picture of the scene', () => {
    const still = harness({ lake: lake('lava') });
    still.layer.setMode('poster');
    const stillPicture = picture(still.layer, 1);

    const scene = harness({ lake: lake('lava') });
    scene.layer.setMode('play');
    play(scene, 4);
    const played = picture(scene.layer, 1);
    expect(differing(played, stillPicture)).toBeGreaterThan(1000);
    scene.layer.setMode('pause');
    play(scene, 2);
    expect(differing(picture(scene.layer, 1), played)).toBe(0);

    const restore = scene.layer.stillFor();
    expect(differing(picture(scene.layer, 1), stillPicture)).toBe(0);
    restore();
    expect(differing(picture(scene.layer, 1), played)).toBe(0);

    scene.layer.setMode('poster');
    expect(differing(picture(scene.layer, 1), stillPicture)).toBe(0);
    still.layer.destroy();
    scene.layer.destroy();
  });

  it('builds a surface anew when it changes, drops it when it goes, and leaves no texture behind', () => {
    const managed = (): number => (renderer.texture as unknown as { managedTextures: (TextureSource | null)[] }).managedTextures.filter(Boolean).length;
    const before = managed();
    const scene = harness({ a: lake('water'), b: { ...lake('acid'), id: 'b' } });
    picture(scene.layer, 1);
    expect(scene.layer.surfaceCount).toBe(2);
    expect(managed()).toBe(before + 2);
    scene.store.set({ a: { ...lake('water'), flow: { x: 0, y: 1 } } });
    scene.layer.buildPending();
    picture(scene.layer, 1);
    expect(scene.layer.surfaceCount).toBe(1);
    expect(managed()).toBe(before + 1);
    scene.layer.destroy();
    expect(scene.layer.container.destroyed).toBe(true);
    expect(managed()).toBe(before);
  });
});
