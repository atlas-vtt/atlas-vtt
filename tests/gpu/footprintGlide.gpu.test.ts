import '../setup/obsidianDom';
import { Application, RenderTexture, Sprite, Texture, Ticker, type Container } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { glideWayIsClear } from '../../src/app/lighting/glideWay';
import { ShownPlaces } from '../../src/app/lighting/shownPlaces';
import { followShownPlaces } from '../../src/app/lighting/shownTokens';
import { LightingRenderer } from '../../src/app/pixi/lighting/LightingRenderer';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { TokenGlide } from '../../src/app/pixi/token-renderer/TokenGlide';
import { createViewAtlasStore, type ViewAtlasState } from '../../src/app/storeFactory';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { BOUNDS, MEASUREMENT, SIZE, visionToken } from '../helpers/tableSightScene';

type Step = (ticker: Pick<Ticker, 'deltaMS'>) => void;
const WALL_X = 128;
const WALL: WallSegment = { id: 'wall', kind: 'wall', type: 'solid', p1: { x: WALL_X, y: 0 }, p2: { x: WALL_X, y: SIZE }, closed: true };

/** The centre of the lit pixels of a frame, and the rightmost column that has one; null when nothing is lit. */
function litArea(pixels: Uint8ClampedArray): { x: number; y: number; right: number } | null {
  let [sumX, sumY, count, right] = [0, 0, 0, -1];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      if (pixels[i]! + pixels[i + 1]! + pixels[i + 2]! < 30) continue;
      [sumX, sumY, count, right] = [sumX + x + 0.5, sumY + y + 0.5, count + 1, Math.max(right, x)];
    }
  }
  return count === 0 ? null : { x: sumX / count, y: sumY / count, right };
}

/**
 * A party token in the dark shows only within its footprint. Moved by a store write (a keyboard
 * step, a move from another device, an undo), its sprite glides to the new place; the footprint
 * must glide with it, never arrive first, and never show past a wall on the way.
 */
describe('a footprint that follows its gliding token', () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
    vi.useRealTimers();
  });

  async function scene(x: number, y: number) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const renderer = await createTestRenderer(SIZE);
    const app = new Application();
    app.renderer = renderer;
    app.ticker = new Ticker();
    const viewport = new Viewport({ screenWidth: SIZE, screenHeight: SIZE, worldWidth: SIZE, worldHeight: SIZE, events: renderer.events });
    app.stage.addChild(viewport);
    const floor = new Sprite(Texture.WHITE);
    floor.setSize(SIZE, SIZE);
    floor.tint = 0x6699cc;
    viewport.addChild(floor);
    const store = createViewAtlasStore(createInMemoryApp().app, `footprint-glide-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/glide.atlasmap');
    store.setState((state) => ({ objects: { ...state.objects, tokens: { party: { ...visionToken('party', x), y } }, walls: { wall: WALL } } }));
    store.getState().setSceneLighting({ enabled: true, ambient: 0, exploredMemory: false });
    const shown = new ShownPlaces();
    const lighting = new LightingRenderer({
      viewport, app, store: followShownPlaces<ViewAtlasState>(store, shown), measurement: () => MEASUREMENT, bounds: () => BOUNDS, albedo: () => null,
    });
    lighting.modeLayer.visible = true;
    const steps = new Set<Step>();
    const position = { x, y, set(px: number, py: number): void { this.x = px; this.y = py; } };
    const glide = new TokenGlide({
      getTicker: () => ({ add: (step: Step) => steps.add(step), remove: (step: Step) => steps.delete(step) }) as unknown as Ticker,
      getSprite: () => ({ position }) as unknown as Container,
      onMove: () => undefined,
      reducedMotion: () => false,
      shown,
      clearWay: (from, to) => glideWayIsClear(store.getState(), BOUNDS, from, to),
    });
    const target = RenderTexture.create(BOUNDS);
    cleanups.push(() => {
      glide.destroy();
      lighting.destroy();
      target.destroy(true);
      app.ticker.destroy();
      viewport.destroy({ children: true });
      app.stage.destroy();
      renderer.destroy();
    });
    return {
      sprite: position,
      gliding: (): boolean => steps.size > 0,
      /** The store moves the token, and the token renderer glides its sprite there. */
      move: (tx: number, ty: number): void => {
        store.getState().moveToken('party', tx, ty);
        glide.to('party', tx, ty);
      },
      frame: (): Uint8ClampedArray => {
        for (const step of [...steps]) step({ deltaMS: 16 });
        renderer.render({ container: app.stage, target, clear: true });
        return renderer.extract.pixels({ target }).pixels;
      },
    };
  }

  it('keeps the footprint centred on the sprite through a one-cell step, frame by frame', async () => {
    const h = await scene(40, 128);
    expect(litArea(h.frame())!.x).toBeCloseTo(40, 0);
    h.move(90, 128);
    let frames = 0;
    do {
      const lit = litArea(h.frame())!;
      expect(Math.abs(lit.x - h.sprite.x), `frame ${frames}: footprint at ${lit.x}, sprite at ${h.sprite.x}`).toBeLessThan(1.5);
      expect(Math.abs(lit.y - 128)).toBeLessThan(1.5);
      frames++;
    } while (h.gliding());
    expect(frames).toBeGreaterThan(5);
    expect(h.sprite.x).toBe(90);
  });

  it('follows a place given mid-way, as the next step of a held key or a move from another device does', async () => {
    const h = await scene(40, 60);
    h.move(40, 110);
    h.frame();
    h.frame();
    h.move(40, 160);
    do {
      const lit = litArea(h.frame())!;
      expect(Math.abs(lit.y - h.sprite.y)).toBeLessThan(1.5);
    } while (h.gliding());
    expect(h.sprite.y).toBe(160);
  });

  it('shows nothing past a wall while the token glides along it', async () => {
    const h = await scene(WALL_X - 20, 40);
    h.move(WALL_X - 20, 200);
    do {
      const lit = litArea(h.frame())!;
      expect(lit.right, `lit at x ${lit.right} with the token at y ${h.sprite.y}`).toBeLessThanOrEqual(WALL_X + 1);
    } while (h.gliding());
  });

  it('puts a token whose way crosses a wall in its place at once, with its footprint', async () => {
    const h = await scene(WALL_X - 40, 128);
    h.move(WALL_X + 40, 128);
    expect(h.gliding()).toBe(false);
    expect(h.sprite.x).toBe(WALL_X + 40);
    const lit = litArea(h.frame())!;
    expect(lit.x).toBeCloseTo(WALL_X + 40, 0);
    expect(lit.x - (WALL_X + 40)).toBeLessThan(1.5);
  });
});
