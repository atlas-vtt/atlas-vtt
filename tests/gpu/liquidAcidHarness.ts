import { Container, RenderTexture, Sprite, Texture, Ticker, WebGLRenderer } from 'pixi.js';
import { commands } from 'vitest/browser';
import { generateDungeon } from '../../src/app/dungeons/generate';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { visibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import { floorLiquids } from '../../src/app/dungeons/scene/toLiquids';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { LiquidLayer, type LiquidLayerDeps } from '../../src/app/pixi/liquids/LiquidLayer';
import { centreOf } from './liquidHarness';

export const ACID_SIZE = { width: 800, height: 600 };
export const ACID_CELL = 100;
export const ACID_OUT = 'out/liquids-acid';
export const ACID_REQUEST = { seed: 1, theme: 'cavern', tags: ['acid', 'large'], floors: 1 } as const;

/** The actual generator, painter, scene converter, file reader and runtime layer together. */
export async function acidScene(look: DungeonStyleId, monochrome = false): Promise<{
  renderer: WebGLRenderer; world: Container; layer: LiquidLayer;
  frame: (seconds: number) => Uint8ClampedArray; destroy: () => void;
}> {
  const model = generateDungeon(ACID_REQUEST);
  const view = { ...DEFAULT_VIEW, monochrome };
  const style = dungeonStyle(look);
  const layout = mapLayout(model, ACID_CELL, view);
  const placement = { originCell: layout.originCell, pxPerCell: ACID_CELL };
  const { liquids } = floorLiquids(visibleDungeon(model, view), style, view, placement, { unitType: 'ft', ruleDistance: 5 }, 'acid-proof');
  const acids = Object.fromEntries(Object.entries(liquids).filter(([, surface]) => surface.liquid === 'acid'));
  const largest = Object.values(acids).sort((a, b) => b.polygon.length - a.polygon.length)[0];
  if (!largest) throw new Error('The proof seed must generate real acid terrain');
  const centre = centreOf(largest.polygon);
  const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
  renderMap(canvas.getContext('2d')!, model, style, view, { pxPerCell: ACID_CELL, floor: 0 });
  const bitmap = await createImageBitmap(canvas);
  const texture = Texture.from(bitmap);
  const renderer = new WebGLRenderer();
  await renderer.init({ ...ACID_SIZE, antialias: false });
  const ticker = new Ticker();
  ticker.autoStart = false;
  let now = 0;
  type State = ReturnType<LiquidLayerDeps['store']['getState']>;
  const state = { objects: { liquids: acids }, grid: { size: ACID_CELL } } as State;
  const layer = new LiquidLayer({ store: { getState: () => state, subscribe: () => () => undefined }, ticker, now: () => now, drawable: true, inView: () => true, requestRender: () => undefined });
  layer.buildPending();
  const world = new Container();
  world.addChild(new Sprite(texture), layer.container);
  world.position.set(ACID_SIZE.width / 2 - centre.x, ACID_SIZE.height / 2 - centre.y);
  const target = RenderTexture.create({ ...ACID_SIZE });
  layer.setMode('play');
  ticker.update(0.01);
  const frame = (seconds: number): Uint8ClampedArray => {
    // Advance through real clock ticks; never depend on PNG encode wall time.
    while (now + 0.001 < seconds * 1000) {
      now = Math.min(seconds * 1000, now + 1000 / 60);
      ticker.update(now);
    }
    renderer.render({ container: world, target, clear: true });
    return new Uint8ClampedArray(renderer.extract.pixels({ target }).pixels);
  };
  return { renderer, world, layer, frame, destroy: () => {
    layer.destroy(); ticker.destroy(); world.destroy({ children: true });
    target.destroy(true); texture.destroy(true); bitmap.close(); renderer.destroy();
  } };
}

export async function acidPng(pixels: Uint8ClampedArray, name: string): Promise<void> {
  const canvas = new OffscreenCanvas(ACID_SIZE.width, ACID_SIZE.height);
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), ACID_SIZE.width, ACID_SIZE.height), 0, 0);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let binary = '';
  for (let k = 0; k < bytes.length; k += 0x8000) binary += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  await commands.writeFile(`${ACID_OUT}/${name}.png`, btoa(binary), 'base64');
}

export interface AcidTimer { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
export async function acidGpuMs(gl: WebGL2RenderingContext, ext: AcidTimer, draw: () => void): Promise<number | null> {
  const query = gl.createQuery()!;
  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  draw();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  gl.flush();
  const deadline = performance.now() + 5000;
  while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
    if (performance.now() > deadline) { gl.deleteQuery(query); throw new Error('GPU timer did not finish'); }
    await new Promise(resolve => setTimeout(resolve, 4));
  }
  const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
  gl.deleteQuery(query);
  return gl.getParameter(ext.GPU_DISJOINT_EXT) ? null : ns / 1e6;
}
