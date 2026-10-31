import '../setup/obsidianDom';
import { CanvasSource, Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
vi.mock('events', async () => import('eventemitter3'));
import { generateDungeon } from '../../src/app/dungeons/generate';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { LIGHTING_QUALITY } from '../../src/app/lighting/lightingQuality';
import type { LightEmission } from '../../src/app/types/lightingTypes';
import { generatedDungeon, openDungeonView, TORCH, type GeneratedDungeon } from '../helpers/generatedDungeonView';
import { savePng } from './dungeonRenderHarness';

const [WIDTH, HEIGHT] = [720, 450];
const RES = 2;
const STEADY: LightEmission = { ...TORCH, animation: 'none' };

function withArt(built: GeneratedDungeon): GeneratedDungeon {
  const model = generateDungeon({ seed: 4, tags: ['lava', 'overgrown', 'wet'], floors: 3 });
  const maps = Object.fromEntries(Object.entries(built.maps).map(([path, map], floor) => {
    const canvas = new OffscreenCanvas(map.width, map.height);
    renderMap(canvas.getContext('2d')!, model, dungeonStyle('parchment'), DEFAULT_VIEW, { pxPerCell: built.pxPerCell, floor });
    return [path, { ...map, texture: new Texture({ source: new CanvasSource({ resource: canvas as unknown as HTMLCanvasElement }) }) }];
  }));
  const torches = Object.fromEntries(Object.entries(built.torches).map(([id, torch]) => [id, { ...torch, emission: STEADY }]));
  return { ...built, maps, torches };
}

async function save(pixels: Uint8ClampedArray, name: string): Promise<void> {
  const w = WIDTH * RES, h = pixels.length / 4 / w;
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), w, h), 0, 0);
  await savePng(canvas, name, 'out/saver-zoom');
}

function differing(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]! - b[i]!) > 40 || Math.abs(a[i + 1]! - b[i + 1]!) > 40 || Math.abs(a[i + 2]! - b[i + 2]!) > 40) n++;
  return n / (a.length / 4);
}

/**
 * The polygon Saver picture on a screen of two device pixels per CSS pixel, at three zooms: the
 * composite is worked out at one device pixel per CSS pixel and drawn up (`CompositeUpscale`), and
 * everything beneath it (the map, the tokens) must lie where High draws it. Lowering the filter's
 * own resolution once drew the input at that ratio while the composite mapped the screen to the
 * world by the render's pixels: the map skewed and slid under the walls and pins while zooming.
 */
describe('saver at resolution 2 while zooming', () => {
  it('is drawn where high is drawn', { timeout: 600_000 }, async () => {
    const built = withArt(generatedDungeon({ pxPerCell: 100 }));
    const shots: Record<string, Uint8ClampedArray> = {};
    for (const level of ['high', 'saver'] as const) {
      const ctx = await openDungeonView(built, { quality: LIGHTING_QUALITY[level], openings: true, pane: WIDTH, paneHeight: HEIGHT, resolution: RES });
      try {
        ctx.view.store.getState().updateTokens([{ id: 'hero', changes: { light: STEADY } }]);
        for (let i = 0; i < 120; i++) { ctx.frame(); await new Promise((r) => setTimeout(r, 0)); }
        const zoom = 70 / built.pxPerCell;
        for (const [name, scale] of [['far', zoom * 0.6], ['near', zoom * 1.6], ['closer', zoom * 2.4]] as const) {
          const camera: [number, number, number] = [scale, WIDTH / 2 - built.hero.x * scale, HEIGHT / 2 - built.hero.y * scale];
          const px = ctx.view.gmCanvas(...camera);
          shots[`${level}-${name}`] = px;
          await save(px, `${level}-${name}`);
          console.log(`${level}-${name}: ${px.length / 4} px`);
        }
      } finally { ctx.destroy(); }
    }
    // Bounce and lit wall faces, which Saver has not, are a few percent of the pixels; a scaled picture was 18 to 39 %.
    for (const name of ['far', 'near', 'closer']) expect(differing(shots[`high-${name}`]!, shots[`saver-${name}`]!), name).toBeLessThan(0.08);
  });
});
