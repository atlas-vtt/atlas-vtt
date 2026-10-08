import '../setup/obsidianDom';
import { autoDetectRenderer, Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { describe, expect, it } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { CanvasLightingFallback } from '../../src/app/pixi/lighting/CanvasLightingFallback';
import { darknessCovers, darknessOf } from '../helpers/darknessCover';
import { sightScene } from '../helpers/sightScenes';

const VIEW = 768;
const FLOOR = 0x8899aa;

/** The players' view of a seeded scene through the fallback, fitted into the canvas. */
interface Picture {
  /** 0 black, 1 floor, 2 anything else, per pixel. */
  kinds: Uint8Array;
  /** World pixels per screen pixel. */
  step: number;
  /** Whether the darkness is meant to cover the middle of a screen pixel. */
  meant: (x: number, y: number) => boolean;
}

async function picture(seed: number, preference: 'webgl' | 'canvas'): Promise<Picture> {
  const scene = sightScene(seed);
  const renderer = await autoDetectRenderer({ preference, width: VIEW, height: VIEW, antialias: false, backgroundAlpha: 1, backgroundColor: FLOOR });
  const stage = new Container();
  const viewport = new Container();
  stage.addChild(viewport);
  const store = createViewAtlasStore(createInMemoryApp().app, `fallback-seeded-${seed}-${preference}`);
  const { state } = scene;
  store.setState({ persistenceEnabled: false, grid: state.grid, lighting: state.lighting, heldTokens: state.heldTokens, objects: { ...store.getState().objects, ...state.objects } });
  const fallback = new CanvasLightingFallback({ viewport: viewport as unknown as Viewport, store, measurement: scene.measurement, bounds: () => scene.bounds, rules: () => scene.rules });
  fallback.modeLayer.visible = true;
  try {
    expect(renderer.name).toBe(preference);
    const scale = VIEW / Math.max(scene.bounds.width, scene.bounds.height);
    viewport.scale.set(scale);
    renderer.render({ container: stage });
    const context = new OffscreenCanvas(VIEW, VIEW).getContext('2d')!;
    context.drawImage(renderer.canvas as HTMLCanvasElement, 0, 0);
    const pixels = context.getImageData(0, 0, VIEW, VIEW).data;
    const kinds = new Uint8Array(VIEW * VIEW);
    for (let i = 0; i < kinds.length; i++) {
      const colour = (pixels[i * 4]! << 16) | (pixels[i * 4 + 1]! << 8) | pixels[i * 4 + 2]!;
      kinds[i] = colour === 0 ? 0 : colour === FLOOR ? 1 : 2;
    }
    // The drawn darkness is read before the fallback goes, at the places asked for later.
    const darkness = darknessOf(viewport);
    const asked = new Map<number, boolean>();
    for (let y = 2; y < VIEW - 2; y += 4) {
      for (let x = 2; x < VIEW - 2; x += 4) asked.set(y * VIEW + x, darknessCovers(darkness, (x + 0.5) / scale, (y + 0.5) / scale));
    }
    return { kinds, step: 1 / scale, meant: (x, y) => asked.get(y * VIEW + x) ?? false };
  } finally {
    fallback.destroy();
    stage.destroy({ children: true });
    renderer.destroy();
  }
}

/** Away from every edge of the Canvas picture, which antialiases: no pixel around this one is a blend or of the other kind. */
function clear(kinds: Uint8Array, x: number, y: number): boolean {
  const kind = kinds[y * VIEW + x];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) if (kinds[(y + dy) * VIEW + x + dx] !== kind) return false;
  }
  return true;
}

/**
 * The clipping library rounds crossings to an eighth of a pixel, so where edges run closer than
 * that an area comes back with an outline or hole that crosses itself. The Canvas renderer
 * fills such an area as it is. PIXI's WebGL renderer triangulates it and can lose a hole, which
 * leaves floor in sight black: never the other way round. The first three scenes are among the
 * worst of 1,500 seeds, of which about one in seventy loses 100 px² or more; the last loses none.
 */
describe('the line-of-sight fallback on scenes whose areas come back with crossing edges', { timeout: 600_000 }, () => {
  // Measured on Metal: 4,929 px², 3,518 px², 561 px² and none; the bounds leave room for another rasteriser.
  it.each([
    { seed: 1118, lost: 6_000 },
    { seed: 922, lost: 4_500 },
    { seed: 307, lost: 800 },
    { seed: 7, lost: 0 },
  ])('seed $seed: Canvas draws what is meant, WebGL shows nothing more and hides at most $lost px² of it', async ({ seed, lost }) => {
    const canvas = await picture(seed, 'canvas');
    const webgl = await picture(seed, 'webgl');
    const tally = { canvasHidden: 0, canvasLeaked: 0, webglLeaked: 0, webglHidden: 0, compared: 0, black: 0 };
    for (let y = 2; y < VIEW - 2; y++) {
      for (let x = 2; x < VIEW - 2; x++) {
        if (!clear(canvas.kinds, x, y)) continue;
        const [onCanvas, onWebgl] = [canvas.kinds[y * VIEW + x]!, webgl.kinds[y * VIEW + x]!];
        tally.compared++;
        if (onCanvas === 0) tally.black++;
        if (onCanvas === 0 && onWebgl !== 0) tally.webglLeaked++;
        if (onCanvas === 1 && onWebgl !== 1) tally.webglHidden++;
        if (x % 4 !== 2 || y % 4 !== 2) continue;
        if (canvas.meant(x, y) && onCanvas !== 0) tally.canvasLeaked++;
        if (!canvas.meant(x, y) && onCanvas !== 1) tally.canvasHidden++;
      }
    }
    expect(tally.compared).toBeGreaterThan(100_000);
    expect(tally.black).toBeGreaterThan(1_000);
    expect({ canvasHidden: tally.canvasHidden, canvasLeaked: tally.canvasLeaked, webglLeaked: tally.webglLeaked }).toEqual({ canvasHidden: 0, canvasLeaked: 0, webglLeaked: 0 });
    expect(tally.webglHidden * canvas.step * canvas.step).toBeLessThanOrEqual(lost);
  });
});
