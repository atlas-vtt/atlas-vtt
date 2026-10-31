import { Container, RenderTexture, Sprite, Texture, Ticker, type WebGLRenderer } from 'pixi.js';
import { commands } from 'vitest/browser';
import type { DungeonModel } from '../../src/app/dungeons/model';
import { generateDungeon } from '../../src/app/dungeons/generate';
import { DEFAULT_PX_PER_CELL, mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { dungeonScene } from '../../src/app/dungeons/scene/toScene';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { LiquidLayer, type LiquidLayerDeps } from '../../src/app/pixi/liquids/LiquidLayer';
import type { LiquidDetail } from '../../src/app/pixi/liquids/liquidShader';
import { deepPoint } from './liquidHarness';

export const WATER_OUT = 'out/liquids-water';
export const WATER_SIZE = { width: 960, height: 640 };
export const WATER_CELL = DEFAULT_PX_PER_CELL;
export const WATER_PLAY_CELL = 100;
export const WATER_PHASE = String(import.meta.env.VITE_WATER_PHASE ?? 'check');
export const WATER_CAPTURE = import.meta.env.VITE_WATER_CAPTURE === '1';

/** Real generator → scene writer → reader → LiquidLayer; no substituted outlines or colours. */
/** Where the water comes from: a cave's pools, a generated channel, or a Forest's river, which flows along its course. */
export type WaterSource = 'pool' | 'channel' | 'river';

export async function waterScene(look: DungeonStyleId, monochrome: boolean, source: WaterSource = 'pool'): Promise<{
  world: Container; layer: LiquidLayer; map: Sprite; target: RenderTexture;
  step: (seconds: number) => void; quality: (detail: LiquidDetail) => void; destroy: () => void;
}> {
  const view = { ...DEFAULT_VIEW, monochrome };
  const model = source === 'channel' ? channelDungeon()
    : source === 'river' ? generateDungeon({ seed: 404, theme: 'forest', tags: ['medium'], floors: 1 })
    : generateDungeon({ seed: 909, theme: 'cavern', tags: ['small', 'wet'], floors: 1 });
  const style = dungeonStyle(look);
  const layout = mapLayout(model, WATER_CELL, view);
  const scene = dungeonScene(model, style, view, { originCell: layout.originCell, pxPerCell: WATER_CELL }, { width: layout.widthPx, height: layout.heightPx }, { unitType: 'feet', ruleDistance: 5 })!.scene;
  const water = Object.fromEntries(Object.entries(scene.liquids ?? {}).filter(([, s]) => s.liquid === 'water'));
  const largest = Object.values(water).filter(s => source === 'pool' || s.flow).sort((a, b) => area(b.polygon) - area(a.polygon))[0];
  if (!largest) throw new Error(`Seed ${model.seed} has no water`);
  const centre = deepPoint(largest.polygon, WATER_CELL);
  // Render a real window of the map at scene resolution, keeping the generator's world origin.
  const zoom = WATER_PLAY_CELL / WATER_CELL;
  const canvas = new OffscreenCanvas(WATER_SIZE.width / zoom, WATER_SIZE.height / zoom);
  const left = centre.x - canvas.width / 2;
  const top = centre.y - canvas.height / 2;
  renderMap(canvas.getContext('2d')!, model, style, view, { pxPerCell: WATER_CELL, floor: 0, window: {
    originCell: { x: layout.originCell.x + left / WATER_CELL, y: layout.originCell.y + top / WATER_CELL }, widthPx: canvas.width, heightPx: canvas.height,
  } });
  const bitmap = await createImageBitmap(canvas);
  const texture = Texture.from(bitmap);
  const map = new Sprite(texture);
  map.position.set(left, top);
  const state: ReturnType<LiquidLayerDeps['store']['getState']> = { objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, audios: {}, liquids: water }, grid: { ...scene.grid, enabled: true, opacity: 0.5 } };
  let now = 0;
  let detail: LiquidDetail = 2;
  const ticker = new Ticker();
  ticker.autoStart = false;
  const layer = new LiquidLayer({ store: { getState: () => state, subscribe: () => (): void => {} }, ticker,
    drawable: true, inView: () => true, requestRender: (): void => {}, now: () => now,
    fps: () => detail === 2 ? 30 : detail === 1 ? 15 : 10, detail: () => detail,
  });
  layer.buildPending();
  const world = new Container();
  world.addChild(map, layer.container);
  world.scale.set(zoom);
  world.position.set(-left * zoom, -top * zoom);
  const target = RenderTexture.create({ ...WATER_SIZE, antialias: false });
  layer.setMode('play');
  ticker.update(now);
  return { world, layer, map, target,
    step: (seconds): void => {
      const end = now + seconds * 1000;
      while (now < end - 0.001) { now = Math.min(end, now + 1000 / 60); ticker.update(now); }
    },
    quality: (value): void => { detail = value; },
    destroy: (): void => { layer.destroy(); ticker.destroy(); world.destroy({ children: true }); texture.destroy(true); bitmap.close(); target.destroy(true); },
  };
}

/** Pick a real generated channel, without replacing its terrain or inventing a flow. */
function channelDungeon(): DungeonModel {
  for (let seed = 1; seed <= 100; seed++) {
    const model = generateDungeon({ seed, tags: ['small', 'wet'], floors: 1 });
    if (model.floors[0]!.terrain.some(t => t.kind === 'channel' && t.traits.hazard === 'deep-water' && t.facing)) return model;
  }
  throw new Error('No generated water channel');
}

function area(polygon: readonly { x: number; y: number }[]): number {
  return Math.abs(polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]!; return sum + p.x * q.y - p.y * q.x; }, 0));
}

export function waterPicture(renderer: WebGLRenderer, scene: Awaited<ReturnType<typeof waterScene>>): Uint8ClampedArray {
  renderer.render({ container: scene.world, target: scene.target, clear: true });
  return renderer.extract.pixels({ target: scene.target }).pixels;
}

export async function waterPng(pixels: Uint8ClampedArray, path: string): Promise<void> {
  const canvas = new OffscreenCanvas(WATER_SIZE.width, WATER_SIZE.height);
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), canvas.width, canvas.height), 0, 0);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  await commands.writeFile(`${WATER_OUT}/${WATER_PHASE}/${path}.png`, btoa(binary), 'base64');
}

export function meanChange(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(a[i + c]! - b[i + c]!);
  return sum / (a.length * 0.75);
}

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

/** Bounded query wait; disjoint samples are discarded, never presented as timing evidence. */
export async function waterGpuCost(renderer: WebGLRenderer, draw: () => void): Promise<{ samples: number[]; median: number | null; gpu: string }> {
  const gl = renderer.gl as WebGL2RenderingContext;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER));
  const samples: number[] = [];
  if (ext) {
    for (let i = 0; i < 20; i++) draw();
    gl.finish();
    for (let i = 0; i < 15; i++) {
      gl.getParameter(ext.GPU_DISJOINT_EXT);
      const query = gl.createQuery()!;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      // Amortise query / command buffer overhead over several identical layer draws.
      for (let k = 0; k < 12; k++) draw();
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      gl.flush();
      const deadline = performance.now() + 5000;
      while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && performance.now() < deadline) await new Promise(resolve => window.setTimeout(resolve, 4));
      const ready = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      if (ready && !disjoint) samples.push(Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 12e6);
      gl.deleteQuery(query);
    }
  }
  samples.sort((a, b) => a - b);
  return { samples, median: samples.length ? samples[Math.floor(samples.length / 2)]! : null, gpu };
}
