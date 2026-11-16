import { Container, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { commands } from 'vitest/browser';
import { generateDungeon } from '../../src/app/dungeons/generate';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { visibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import { floorLiquids } from '../../src/app/dungeons/scene/toLiquids';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { LiquidMesh } from '../../src/app/pixi/liquids/LiquidMesh';
import { liquidList } from '../../src/app/liquids/liquids';
import { centreOf } from './liquidHarness';

export const LAVA_OUT = 'out/liquids-lava';
export const LAVA_CELL = 90;
export const LAVA_SIZE = { width: 720, height: 540 };

function lavaModel(): ReturnType<typeof generateDungeon> {
  for (let seed = 1; seed < 200; seed++) {
    const model = generateDungeon({ seed, tags: ['dry', 'lava'], floors: 1 });
    if (model.floors[0]!.terrain.some(t => t.traits.hazard === 'lava')) return model;
  }
  throw new Error('No generated lava in the seed range');
}

/** Real generated lava, including its bridge cutouts and scene reader, at a playable 90px/cell. */
export function lavaDungeon(look: DungeonStyleId, monochrome = false): { world: Container; meshes: LiquidMesh[]; destroy(): void } {
  const model = lavaModel();
  const style = dungeonStyle(look);
  const view = { ...DEFAULT_VIEW, monochrome };
  const dungeon = visibleDungeon(model, view, 0);
  const initial = floorLiquids(dungeon, style, view, { originCell: { x: 0, y: 0 }, pxPerCell: 1 }, { unitType: 'feet', ruleDistance: 5 }, 'lava-proof');
  const surfaces = Object.values(initial.liquids).filter(s => s.liquid === 'lava');
  if (!surfaces.length) throw new Error('Generated fixture has no lava');
  // The largest lava: a floor's channels may lie rooms apart, with only rock between them.
  const largest = surfaces.sort((a, b) => b.polygon.length - a.polygon.length)[0]!;
  const centre = centreOf(largest.polygon);
  const originCell = { x: centre.x - LAVA_SIZE.width / LAVA_CELL / 2, y: centre.y - LAVA_SIZE.height / LAVA_CELL / 2 };
  const canvas = new OffscreenCanvas(LAVA_SIZE.width, LAVA_SIZE.height);
  renderMap(canvas.getContext('2d')!, model, style, view, { pxPerCell: LAVA_CELL, window: { originCell, widthPx: canvas.width, heightPx: canvas.height } });
  const texture = Texture.from(canvas);
  const world = new Container();
  world.addChild(new Sprite(texture));
  const generated = floorLiquids(dungeon, style, view, { originCell, pxPerCell: LAVA_CELL }, { unitType: 'feet', ruleDistance: 5 }, 'lava-proof');
  const meshes = liquidList(generated.liquids).filter(s => s.liquid === 'lava').map(s => new LiquidMesh(s, LAVA_CELL));
  for (const mesh of meshes) world.addChild(mesh.mesh);
  return { world, meshes, destroy: () => { for (const mesh of meshes) mesh.destroy(); world.destroy({ children: true }); texture.destroy(true); } };
}

export async function lavaPng(pixels: Uint8ClampedArray, name: string): Promise<void> {
  const canvas = new OffscreenCanvas(LAVA_SIZE.width, LAVA_SIZE.height);
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  await commands.writeFile(`${LAVA_OUT}/${name}.png`, btoa(binary), 'base64');
}

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

/** Bounded elapsed query; unavailable/disjoint samples are reported as missing, never CPU times. */
export async function lavaGpuMs(renderer: WebGLRenderer, draw: () => void): Promise<number | null> {
  const gl = renderer.gl as WebGL2RenderingContext;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  if (!ext) return null;
  const query = gl.createQuery()!;
  gl.getParameter(ext.GPU_DISJOINT_EXT);
  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  draw();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  const deadline = performance.now() + 5000;
  while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 4));
  const valid = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT);
  const ns = valid ? gl.getQueryParameter(query, gl.QUERY_RESULT) as number : null;
  gl.deleteQuery(query);
  return ns === null ? null : ns / 1e6;
}
