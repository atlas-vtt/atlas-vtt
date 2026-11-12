import { Container, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { commands } from 'vitest/browser';
import { areaWithinWalls } from '../../src/app/measure/measureWalls';
import { shapedArea, type AreaShapeRules } from '../../src/app/measure/measureGeometry';
import type { Measurement } from '../../src/app/measure/measureTypes';
import type { MeasureEffectMesh } from '../../src/app/pixi/measure/effects/MeasureEffectMesh';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';

/** Where captured pictures go, under the project root (the browser may write nowhere else); git ignores `out/`. */
export const EFFECT_OUT = 'out/measure-effects';

export type ShapeName = 'circle' | 'cone' | 'line' | 'notched';
export const SHAPE_NAMES: readonly ShapeName[] = ['circle', 'cone', 'line', 'notched'];
export type MapKind = 'dark' | 'bright';

export interface EffectShape {
  name: ShapeName;
  rings: Point[][];
  origin: Point;
}

const RULES = (cell: number): AreaShapeRules => ({ coneAngle: 60, coneEnd: 'round', lineWidth: cell });

const wall = (id: string, p1: Point, p2: Point): WallSegment => ({ id, kind: 'wall', type: 'solid', p1, p2 });

/**
 * The areas the looks are judged on, as the measure rules shape them around `centre`: a circle
 * `across` cells wide, a cone, a line one cell wide, and a circle walls cut (a notch behind a
 * short wall and a straight side along a long one).
 */
export function effectShape(name: ShapeName, cell: number, centre: Point, across = 4): EffectShape {
  const radius = (across / 2) * cell;
  const rules = RULES(cell);
  const area = (measurement: Measurement): Point[][] => (shapedArea(measurement, rules)?.rings ?? []).map((ring) => ring.map((point) => ({ ...point })));
  switch (name) {
    case 'circle':
      return { name, origin: centre, rings: area({ shape: 'circle', points: [centre, { x: centre.x + radius, y: centre.y }] }) };
    case 'cone': {
      const origin = { x: centre.x - radius * 0.85, y: centre.y + radius * 0.6 };
      return { name, origin, rings: area({ shape: 'cone', points: [origin, { x: origin.x + radius * 1.9, y: origin.y - radius * 0.95 }] }) };
    }
    case 'line': {
      const origin = { x: centre.x - radius * 1.05, y: centre.y + radius * 0.45 };
      return { name, origin, rings: area({ shape: 'line', points: [origin, { x: centre.x + radius * 1.05, y: centre.y - radius * 0.45 }] }) };
    }
    case 'notched': {
      const shaped = shapedArea({ shape: 'circle', points: [centre, { x: centre.x + radius, y: centre.y }] }, rules)!;
      const walls = [
        wall('short', { x: centre.x + radius * 0.25, y: centre.y - radius * 0.45 }, { x: centre.x + radius * 0.55, y: centre.y - radius * 0.2 }),
        wall('long', { x: centre.x - radius * 1.2, y: centre.y + radius * 0.55 }, { x: centre.x + radius * 0.4, y: centre.y + radius * 0.8 }),
      ];
      return { name, origin: centre, rings: areaWithinWalls(shaped, walls).rings.map((ring) => ring.map((point) => ({ ...point }))) };
    }
  }
}

/** A small generator of the same numbers every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const MAPS: Readonly<Record<MapKind, { floor: [number, number, number]; ink: string; grid: string; prop: string }>> = {
  dark: { floor: [44, 42, 50], ink: 'rgba(8, 8, 12, 0.85)', grid: 'rgba(210, 210, 230, 0.16)', prop: '#17161b' },
  bright: { floor: [228, 218, 194], ink: 'rgba(52, 40, 28, 0.85)', grid: 'rgba(60, 46, 30, 0.3)', prop: '#b9a988' },
};

/**
 * A picture that stands for a map: flagstones of uneven tone, cracks, a grid, a few things
 * standing on the floor and lettering, on dark stone or on bright parchment. What an effect must
 * leave readable.
 */
export function drawnMap(kind: MapKind, width: number, height: number, cell: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const { floor, ink, grid, prop } = MAPS[kind];
  const random = seeded(kind === 'dark' ? 7 : 11);
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      const tone = (random() - 0.5) * 22;
      ctx.fillStyle = `rgb(${floor.map((c) => Math.round(c + tone)).join(',')})`;
      ctx.fillRect(x, y, cell, cell);
    }
  }
  // Grain, so a look is judged over texture and not over flat colour.
  const grain = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < grain.data.length; i += 4) {
    const speck = (random() - 0.5) * 18;
    grain.data[i] = grain.data[i]! + speck;
    grain.data[i + 1] = grain.data[i + 1]! + speck;
    grain.data[i + 2] = grain.data[i + 2]! + speck;
  }
  ctx.putImageData(grain, 0, 0);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.2;
  for (let k = 0; k < (width * height) / 26000; k++) {
    let x = random() * width;
    let y = random() * height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let step = 0; step < 4; step++) {
      x += (random() - 0.5) * cell * 0.5;
      y += (random() - 0.5) * cell * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= width; x += cell) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, height); }
  for (let y = 0; y <= height; y += cell) { ctx.moveTo(0, y + 0.5); ctx.lineTo(width, y + 0.5); }
  ctx.stroke();
  ctx.fillStyle = prop;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const x = (0.5 + Math.floor(random() * (width / cell))) * cell;
    const y = (0.5 + Math.floor(random() * (height / cell))) * cell;
    ctx.beginPath();
    if (k % 2 === 0) ctx.arc(x, y, cell * 0.3, 0, Math.PI * 2);
    else ctx.rect(x - cell * 0.38, y - cell * 0.24, cell * 0.76, cell * 0.48);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = ink;
  ctx.font = `${Math.round(cell * 0.22)}px serif`;
  ctx.fillText('12', cell * 0.12, cell * 0.3);
  ctx.fillText('Hall', width * 0.5 - cell * 0.2, height - cell * 0.12);
  return canvas;
}

/** Two tokens, as they stand over an area: a ringed disc with a letter each. */
export function drawnTokens(width: number, height: number, cell: number, places: readonly Point[]): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  places.forEach(({ x, y }, index) => {
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = index % 2 === 0 ? '#6f4a3a' : '#3d566b';
    ctx.fill();
    ctx.lineWidth = Math.max(2, cell * 0.05);
    ctx.strokeStyle = index % 2 === 0 ? '#d9c8a0' : '#b8c6d6';
    ctx.stroke();
    ctx.fillStyle = '#f2ead6';
    ctx.font = `bold ${Math.round(cell * 0.4)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(index % 2 === 0 ? 'G' : 'K', x, y + 1);
  });
  return canvas;
}

export interface EffectScene {
  width: number;
  height: number;
  map: Texture | null;
  meshes: readonly MeasureEffectMesh[];
  tokens?: Texture | null;
  /** Screen pixels to a world pixel; unset, 1. */
  zoom?: number;
}

/** The map, the effects over it and the tokens over those, as the layers lie on the stage. */
export function renderEffects(renderer: WebGLRenderer, scene: EffectScene, clearColor: [number, number, number, number] = [0, 0, 0, 1]): Uint8ClampedArray {
  const world = new Container();
  if (scene.map) world.addChild(new Sprite(scene.map));
  for (const mesh of scene.meshes) world.addChild(mesh.view);
  if (scene.tokens) world.addChild(new Sprite(scene.tokens));
  world.scale.set(scene.zoom ?? 1);
  const target = RenderTexture.create({ width: scene.width, height: scene.height, antialias: false });
  renderer.render({ container: world, target, clear: true, clearColor });
  const { pixels } = renderer.extract.pixels({ target });
  target.destroy(true);
  for (const mesh of scene.meshes) world.removeChild(mesh.view);
  world.destroy({ children: true });
  return new Uint8ClampedArray(pixels);
}

/** Pictures side by side, `columns` to a row, with a gap between them. */
export function contactSheet(pictures: readonly Uint8ClampedArray[], width: number, height: number, columns: number): OffscreenCanvas {
  const gap = 6;
  const rows = Math.ceil(pictures.length / columns);
  const out = new OffscreenCanvas(columns * width + (columns - 1) * gap, rows * height + (rows - 1) * gap);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#7a1fa2';
  ctx.fillRect(0, 0, out.width, out.height);
  pictures.forEach((pixels, index) => {
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), (index % columns) * (width + gap), Math.floor(index / columns) * (height + gap));
  });
  return out;
}

export async function savePng(canvas: OffscreenCanvas, name: string): Promise<void> {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  await commands.writeFile(`${EFFECT_OUT}/${name}.png`, btoa(binary), 'base64');
}

/** The mean absolute change between two pictures over the pixels that differ at all: what an eye follows, undiluted by what stands still. */
export function meanStep(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    const step = Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
    if (step === 0) continue;
    sum += step / 3;
    changed++;
  }
  return changed === 0 ? 0 : sum / changed;
}

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

/** The graphics card's time for `work` in ms (`EXT_disjoint_timer_query_webgl2`); null without the timer or when a sample is void. */
export async function gpuMs(renderer: WebGLRenderer, work: () => void): Promise<number | null> {
  const gl = renderer.gl as WebGL2RenderingContext;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  if (!ext) return null;
  gl.getParameter(ext.GPU_DISJOINT_EXT);
  const query = gl.createQuery()!;
  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  work();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  const deadline = performance.now() + 5000;
  while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 4));
  const valid = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT);
  const ns = valid ? (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) : null;
  gl.deleteQuery(query);
  return ns === null ? null : ns / 1e6;
}
