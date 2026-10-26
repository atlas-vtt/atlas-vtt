import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { TurnMarkers, type TurnMarkerState } from '../../src/app/pixi/token-renderer/turnMarker/TurnMarkers';
import { FLASH, TURN_LOOK, rimRadius } from '../../src/app/pixi/token-renderer/turnMarker/turnMarkerShape';
import { LIGHTING_Z_INDEX } from '../../src/app/pixi/lighting/LightingRenderer';
import { TOKEN_UI_Z_INDEX } from '../../src/app/pixi/TokenControlsUI';
import { getTokenRingOuterDiameter } from '../../src/app/pixi/token-renderer/tokenRingMetrics';
import { computeTokenPixelSize, computeTokenStrokeWidth } from '../../src/app/pixi/token-renderer/tokenSizing';
import { copiedPixel } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
import type { TokenEntity } from '../../src/app/types';
import { createDefaultInitiativeState, type InitiativeEntry, type InitiativeState } from '../../src/app/types/initiativeTypes';

const SIZE = 320;
const GRID = 70;
const ZOOM = 2;
const SHOTS = '__screenshots__/turn-spotlight';

const entry = (tokenId: string, order: number, isActive: boolean): InitiativeEntry => ({
  id: `e-${tokenId}`, tokenId, name: tokenId, initiative: 10, initiativeModifier: 0, imagePath: '', isActive, isNPC: true, order,
});
const fight = (active: string): InitiativeState => ({
  ...createDefaultInitiativeState(), isActive: true, round: 1, entries: ['hero', 'ogre'].map((id, index) => entry(id, index, id === active)),
});

/** A figure on a transparent ground, as many tokens are: an opaque disc up and left, the rest of the square empty. */
function figureArt(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#c0392b';
  context.beginPath();
  context.arc(24, 24, 18, 0, 2 * Math.PI);
  context.fill();
  return Texture.from(canvas);
}

/**
 * The flash in the stacking the map gives it: a dark scene (the composite at `LIGHTING_Z_INDEX`,
 * here a veil over the floor and the token as a dark scene lights them), the flash above it, and a
 * token's bar standing over it at `TOKEN_UI_Z_INDEX`.
 */
describe('the turn spotlight on a lit map', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function scene(framed: boolean): Promise<{ app: Application; markers: TurnMarkers; begin: () => void; at: (ms: number) => void; centre: number; size: number; outer: number }> {
    const app = new Application();
    await app.init({ width: SIZE, height: SIZE, preference: 'webgl', antialias: true, autoStart: false, backgroundColor: 0x000000 });
    cleanup.push(() => app.destroy(true, { children: true }));
    document.body.append(app.canvas);
    cleanup.push(() => app.canvas.remove());
    const world = new Container({ sortableChildren: true });
    world.scale.set(ZOOM);
    world.position.set(SIZE / 2 - 80 * ZOOM, SIZE / 2 - 80 * ZOOM);
    app.stage.addChild(world);
    world.addChild(new Graphics({ zIndex: 0 }).rect(0, 0, 160, 160).fill(0x8a5a3c));
    const size = computeTokenPixelSize(GRID, 1);
    const token = { id: 'ogre', kind: 'character', x: 80, y: 80, imagePath: '', showRing: framed } as TokenEntity;
    const group = Object.assign(new Container({ zIndex: 0 }), { tokenId: 'ogre', tokenData: token, tokenSize: size, artPath: '', strokeWidth: 2 }) as TokenGroupContainer;
    group.position.set(80, 80);
    const art = new Sprite({ texture: figureArt(), anchor: 0.5, label: 'tokenSprite' });
    art.width = size;
    art.height = size;
    group.addChild(art);
    world.addChild(group);
    world.addChild(new Graphics({ zIndex: LIGHTING_Z_INDEX }).rect(0, 0, 160, 160).fill({ color: 0x000000, alpha: 0.8 }));
    const outer = framed ? getTokenRingOuterDiameter(size, computeTokenStrokeWidth(GRID)) / 2 : size / 2;
    world.addChild(new Graphics({ zIndex: TOKEN_UI_Z_INDEX }).rect(70, 80 + outer + 6, 20, 4).fill(0xffffff));
    let state: TurnMarkerState = { initiative: fight('hero'), objects: { tokens: { ogre: token, hero: { ...token, id: 'hero', x: 400 } } }, grid: { size: GRID } };
    const listeners = new Set<(next: TurnMarkerState) => void>();
    let time = 0;
    const markers = new TurnMarkers({
      parent: world,
      getState: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      spriteOf: (id) => (id === 'ogre' ? group : null),
      ticker: () => app.ticker,
      reducedMotion: () => false,
      now: () => time,
    });
    cleanup.push(() => markers.destroy());
    const begin = (): void => {
      state = { ...state, initiative: fight('ogre') };
      for (const listener of listeners) listener(state);
    };
    const at = (ms: number): void => {
      time = ms;
      app.ticker.update(ms);
      app.render();
    };
    app.render();
    return { app, markers, begin, at, centre: SIZE / 2, size, outer };
  }

  const pixel = (app: Application, x: number, y: number): number[] => copiedPixel(app.canvas, Math.round(x), Math.round(y));
  const same = (a: number[], b: number[], tolerance = 2): boolean => a.every((value, index) => Math.abs(value - b[index]!) <= tolerance);
  /** Gold laid over `before`: red gains clearly, and more than blue does. */
  const golden = (colour: number[], before: number[]): boolean => colour[0]! - before[0]! >= 8 && colour[0]! - before[0]! > colour[2]! - before[2]! + 5;

  it('lights the floor beside the figure and outside it in gold, over the dark, and leaves the art untouched', async () => {
    const { app, markers, begin, at, centre, size } = await scene(false);
    // A fight met running flashes nothing
    expect(markers.tokenIds).toEqual([]);
    const art = { x: centre + ((24 - 32) / 64) * size * ZOOM, y: centre + ((24 - 32) / 64) * size * ZOOM };
    const empty = { x: centre + (14 / 64) * size * ZOOM, y: centre + (14 / 64) * size * ZOOM };
    const beyond = { x: centre - (size / 2 + 2) * ZOOM, y: centre };
    const rim = { x: centre + rimRadius(size / 2, ZOOM) + 0.5, y: centre };
    const before = [art, empty, beyond, rim].map(({ x, y }) => pixel(app, x, y));

    begin();
    at(FLASH.full.enter + FLASH.full.hold / 2);
    const [onArt, onEmpty, onFloor, onRim] = [art, empty, beyond, rim].map(({ x, y }) => pixel(app, x, y));
    expect(same(onArt!, before[0]!), `art ${onArt} was ${before[0]}`).toBe(true);
    expect(golden(onEmpty!, before[1]!), `beside the figure ${onEmpty}`).toBe(true);
    expect(golden(onFloor!, before[2]!), `outside the token ${onFloor}`).toBe(true);
    expect(golden(onRim!, before[3]!), `rim ${onRim}`).toBe(true);
    // Below the token the bar stands over the flash
    expect(pixel(app, centre, centre + (size / 2 + 8) * ZOOM)).toEqual([255, 255, 255]);
    await page.screenshot({ path: `${SHOTS}/unframed.png`, element: app.canvas });

    // Players who do not see the token see no flash
    for (const { layer, visible } of markers.playerLayers(() => false, true)) layer.visible = visible;
    app.render();
    expect(same(pixel(app, empty.x, empty.y), before[1]!)).toBe(true);
    for (const { layer } of markers.playerLayers(() => true, true)) layer.visible = true;

    // Faded away it is gone, and leaves nothing behind
    at(FLASH.full.enter + FLASH.full.hold + FLASH.full.exit + 16);
    expect(markers.layer.children).toEqual([]);
    expect([art, empty, beyond, rim].map(({ x, y }) => pixel(app, x, y))).toEqual(before);
  });

  it('keeps off a framed token whole, its ring included, and lights the floor around it', async () => {
    const { app, begin, at, centre, outer } = await scene(true);
    const inside = { x: centre + 0.6 * outer * ZOOM, y: centre + 0.6 * outer * ZOOM };
    const edge = { x: centre + (outer - 1) * ZOOM, y: centre };
    const beyond = { x: centre - (outer + 2) * ZOOM, y: centre };
    const before = [inside, edge, beyond].map(({ x, y }) => pixel(app, x, y));
    begin();
    at(FLASH.full.enter + 100);
    const after = [inside, edge, beyond].map(({ x, y }) => pixel(app, x, y));
    expect(same(after[0]!, before[0]!)).toBe(true);
    expect(same(after[1]!, before[1]!, 6)).toBe(true);
    expect(golden(after[2]!, before[2]!)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/framed.png`, element: app.canvas });
  });

  it('measures what a frame with a flash costs', async () => {
    const { app, begin, at } = await scene(false);
    const gl = (app.renderer as unknown as { gl: WebGL2RenderingContext }).gl;
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    const measure = async (frame: (index: number) => void): Promise<{ cpu: number; gpu: number | null }> => {
      const cpu: number[] = [];
      const gpu: number[] = [];
      for (let index = 0; index < 30; index += 1) {
        const query = ext ? gl.createQuery() : null;
        if (ext && query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        const started = performance.now();
        frame(index);
        cpu.push(performance.now() - started);
        if (ext && query) {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) await new Promise((resolve) => setTimeout(resolve, 2));
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push((gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6);
          gl.deleteQuery(query);
        }
      }
      const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
      return { cpu: median(cpu), gpu: gpu.length ? median(gpu) : null };
    };
    const plain = await measure(() => app.render());
    begin();
    const flashing = await measure((index) => at(FLASH.full.enter + index));
    console.info(`turn flash: frame without ${JSON.stringify(plain)} ms, with a flash ${JSON.stringify(flashing)} ms`);
    expect(TURN_LOOK.gold).toBe(0xecb848);
  });
});
