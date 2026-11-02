import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIGHTING_QUALITY, LIGHTING_QUALITY_LEVELS, type LightingQualityLevel } from '../../src/app/lighting/lightingQuality';
import { ENGINE_SHADERS } from '../../src/app/pixi/lighting/engine/engineShaders';
import type { TokenEntity } from '../../src/app/types';
import { openLitView, type LitView } from '../helpers/litView';

vi.mock('events', async () => import('eventemitter3'));

const MAP = 512;
const TORCH = { bright: 4, dim: 8, color: '#ffc080', intensity: 1, animation: 'none' };
/** The line of the composite's upscale that 0.10.1 fixed, and what it read before. */
const FIXED_LINE = 'vec4 counted = e + (1.0 - step(1e-6, w)) * 1e9;';
const LINE_BEFORE_FIX = 'vec4 counted = mix(vec4(1e9), e, step(1e-6, w));';

type Sources = Record<string, { vertex: string; fragment: string }>;
const shaders = ENGINE_SHADERS as unknown as Sources;
const asWritten = structuredClone(shaders);

/** Every `mix(x, y, a)` as ANGLE has Direct3D work it out, HLSL's `lerp`: `x + a * (y - x)`, which drops a small `y` beside a large `x`. */
function mixAsLerp(source: string): string {
  const code = source.replace(/\/\/[^\n]*/g, '');
  const call = /\bmix\s*\(/.exec(code);
  if (!call) return code;
  const args: string[] = [];
  let from = call.index + call[0].length;
  for (let at = from, depth = 1; depth > 0; at++) {
    const char = code[at];
    if (char === '(') depth++;
    if (char === ')') depth--;
    if ((char === ',' && depth === 1) || depth === 0) {
      args.push(code.slice(from, at));
      from = at + 1;
    }
  }
  const [x, y, a] = args.map(mixAsLerp);
  return `${code.slice(0, call.index)}((${x}) + (${a}) * ((${y}) - (${x})))${mixAsLerp(code.slice(from))}`;
}

function compileAsDirect3D(fragmentOf: (fragment: string) => string = (fragment) => fragment): void {
  for (const [name, source] of Object.entries(asWritten)) {
    shaders[name]!.vertex = mixAsLerp(source.vertex);
    shaders[name]!.fragment = mixAsLerp(fragmentOf(source.fragment));
  }
}

function canvasPixels(view: LitView): Uint8ClampedArray {
  const { app } = view;
  app.renderer.render({ container: app.stage });
  const copy = new OffscreenCanvas(app.canvas.width, app.canvas.height).getContext('2d', { willReadFrequently: true })!;
  copy.drawImage(app.canvas, 0, 0);
  return copy.getImageData(0, 0, app.canvas.width, app.canvas.height).data;
}

/** The share of the picture that shows anything. */
function shownShare(pixels: Uint8ClampedArray): number {
  let shown = 0;
  for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!) > 40) shown++;
  return shown / (pixels.length / 4);
}

/** How many pixels of two pictures differ by more than 6 levels over their three colours together. */
function differingPixels(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let differing = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 6) differing++;
  }
  return differing;
}

/**
 * The players' table going black on Windows, as reported in October 2026 (forum thread "Darkness
 * Bug"), with the page then pinned before 0.10.1: the page steps down to Saver when a drag is slow
 * (`FrameWatch`) and keeps that tier on the device, and at more than one device pixel per CSS pixel
 * Saver works the composite out on fewer pixels, whose upscale read `mix(vec4(1e9), e, ...)`: all
 * that it showed goes black, with the marks above the lighting still drawn. Metal and OpenGL hide
 * such a line, so these tests write `lerp`'s arithmetic into every engine shader.
 */
describe('the lighting as Direct3D works out mix', () => {
  const open: LitView[] = [];
  afterEach(() => {
    while (open.length) open.pop()!.dispose();
    for (const [name, source] of Object.entries(asWritten)) Object.assign(shaders[name]!, source);
    vi.restoreAllMocks();
  });

  /** The players' picture of a walled room, its token carrying a torch along the top wall. */
  async function openTable(level: LightingQualityLevel, resolution: number): Promise<LitView> {
    const view = await openLitView({ pane: { width: MAP, height: MAP }, map: MAP, quality: LIGHTING_QUALITY[level], resolution });
    open.push(view);
    const state = view.store.getState();
    state.setSceneLighting({ enabled: true, ambient: 0 });
    state.setGMView(false);
    state.addWall({ type: 'solid', p1: { x: 50, y: 50 }, p2: { x: 460, y: 50 } });
    state.addWall({ type: 'solid', p1: { x: 256, y: 50 }, p2: { x: 256, y: 300 } });
    walk(view, 120, 60);
    return view;
  }

  function walk(view: LitView, x: number, y: number): void {
    const ada = { id: 'ada', kind: 'token', imagePath: '', x, y, size: 1, layer: 0, rotation: 0, isHidden: false, vision: { enabled: true, range: 200 }, light: TORCH } as unknown as TokenEntity;
    view.store.setState((s) => ({ objects: { ...s.objects, tokens: { ada } } }));
    view.displayFrames(30);
  }

  it.each(LIGHTING_QUALITY_LEVELS.flatMap((level) => [1, 1.5].map((resolution) => [level, resolution] as const)))('draws the same picture at %s and resolution %s', async (level, resolution) => {
    const asMetal = canvasPixels(await openTable(level, resolution));
    compileAsDirect3D();
    const asDirect3D = canvasPixels(await openTable(level, resolution));
    expect(shownShare(asMetal)).toBeGreaterThan(0.02);
    expect(differingPixels(asMetal, asDirect3D)).toBe(0);
  });

  it('stays lit when the page steps down to Saver during a walk', async () => {
    compileAsDirect3D();
    const view = await openTable('high', 1.5);
    view.setQuality(LIGHTING_QUALITY.saver);
    walk(view, 150, 60);
    expect(shownShare(canvasPixels(view))).toBeGreaterThan(0.02);
  });

  it('would go black with the upscale as it was before 0.10.1, only where the composite works on fewer pixels', async () => {
    expect(asWritten.compositeUpscale!.fragment).toContain(FIXED_LINE);
    compileAsDirect3D((fragment) => fragment.replace(FIXED_LINE, LINE_BEFORE_FIX));
    expect(shownShare(canvasPixels(await openTable('saver', 1.5)))).toBeLessThan(0.001);
    expect(shownShare(canvasPixels(await openTable('saver', 1)))).toBeGreaterThan(0.02);
    expect(shownShare(canvasPixels(await openTable('high', 1.5)))).toBeGreaterThan(0.02);
  });

  /**
   * The warnings the players' consoles showed are not the fault: a canvas that changes size (opening
   * the console does) makes PIXI's texture pool destroy the textures of the old size, and its filter
   * system's bind group still names the last frame's until the next frame sets new ones.
   */
  it('keeps the picture when the canvas changes size, whatever PIXI warns', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const view = await openTable('saver', 1.5);
    const before = shownShare(canvasPixels(view));
    view.app.renderer.resize(MAP - 60, MAP - 40);
    view.displayFrames(5);
    expect(shownShare(canvasPixels(view))).toBeGreaterThan(before / 2);
    view.app.renderer.resize(MAP, MAP);
    view.displayFrames(5);
    expect(shownShare(canvasPixels(view))).toBeCloseTo(before, 2);
  });
});
