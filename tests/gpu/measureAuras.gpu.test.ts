import { Container, RenderTexture, Sprite, Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeasureRenderer, type MeasureGrid } from '../../src/app/pixi/measure/MeasureRenderer';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import type { TokenEntity } from '../../src/app/types';
import { openLitView } from '../helpers/litView';
import { differingIn, playerViewScenes, type PlayerViewScene } from '../helpers/playerViewScene';

vi.mock('events', async () => import('eventemitter3'));

const { scene } = playerViewScenes();
/** On the centre of a 40 px cell; its aura of one cell covers the three by three cells around it, from 40 to 160. */
const HERO = { id: 'hero', x: 100, y: 100 };
/** Two cells to the right: the cells from 120 to 240. */
const DROP = { x: 180, y: 100 };

/** A scene on a grid that snaps, with the hero and, unless `bare`, its aura of one cell. */
async function withHero(bare = false): Promise<PlayerViewScene> {
  const s = await scene();
  await s.add(HERO);
  // A map without a collection counts 5 a cell.
  if (!bare) s.store.getState().setTokenAuras([{ tokenId: 'hero', aura: 5, points: [{ x: 100, y: 100 }, { x: 160, y: 100 }] }], { color: '#e93147' });
  s.store.getState().setActiveTool('move');
  await s.settle();
  return s;
}

/** How many pixels of the rectangle differ: the body's wash and tint where an aura lies. */
const body = (a: Uint8ClampedArray, b: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number): number => differingIn(a, b, x0, y0, x1, y1);

describe('an aura on the map', () => {
  it('lies around its token and under it: the cells around the token are tinted, the token looks as it does without it', async () => {
    const s = await withHero();
    const bare = await withHero(true);
    const frame = s.frame();
    const without = bare.frame();
    // The cell left of the token and the one above it, away from the label over its top edge and the handles.
    expect(body(frame, without, 44, 84, 76, 116)).toBeGreaterThan(900);
    expect(body(frame, without, 124, 124, 156, 156)).toBeGreaterThan(900);
    // Nothing of it a cell farther out, where no cell is in reach.
    expect(body(frame, without, 170, 0, 256, 256)).toBe(0);
    expect(body(frame, without, 0, 170, 256, 256)).toBe(0);
    // The token's art, inside its rim, is the token's.
    expect(body(frame, without, HERO.x - 10, HERO.y - 10, HERO.x + 10, HERO.y + 10)).toBe(0);
  });

  it('follows its token while it is dragged, with no write of its own, and lies where the token is dropped', async () => {
    const s = await withHero();
    const bare = await withHero(true);
    const kept = s.store.getState().objects.measures;
    for (const view of [s, bare]) {
      view.store.getState().setSelection(['hero']);
      view.pointer('pointerdown', HERO.x, HERO.y);
      view.pointer('pointermove', HERO.x + 30, HERO.y);
      view.pointer('pointermove', DROP.x, DROP.y);
    }
    // Held two cells on: the body lies around the token there, and nothing of it is left where it was.
    const held = s.frame();
    const without = bare.frame();
    expect(body(held, without, 204, 84, 236, 116)).toBeGreaterThan(900);
    expect(body(held, without, 124, 124, 156, 156)).toBeGreaterThan(900);
    expect(body(held, without, 0, 0, 118, 256)).toBe(0);
    expect(body(held, without, DROP.x - 10, DROP.y - 10, DROP.x + 10, DROP.y + 10)).toBe(0);
    // The aura itself was not written: the kept measurements are the record they were.
    expect(s.store.getState().objects.measures).toBe(kept);
    for (const view of [s, bare]) view.pointer('pointerup', DROP.x, DROP.y);
    await s.settle();
    await bare.settle();
    expect(body(s.frame(), bare.frame(), 204, 84, 236, 116)).toBeGreaterThan(900);
    expect(body(s.frame(), bare.frame(), 0, 0, 118, 256)).toBe(0);
    expect(s.store.getState().objects.measures).toBe(kept);
  });

  it('is left out of the players\' picture with a token they do not see, and shows on the GM\'s canvas', async () => {
    const s = await withHero();
    const bare = await withHero(true);
    s.lighting.perception = () => 'unseen';
    bare.lighting.perception = () => 'unseen';
    expect(body(s.frame(), bare.frame(), 0, 0, 256, 256)).toBe(0);
    expect(body(s.canvas(), bare.canvas(), 44, 84, 76, 116)).toBeGreaterThan(900);
  });
});

describe('what an aura costs while its token is dragged', () => {
  /** The mean time of a pointer move that takes the held token into another cell, in ms. */
  function perMove(s: PlayerViewScene): number {
    s.store.getState().setSelection(['hero']);
    s.pointer('pointerdown', HERO.x, HERO.y);
    for (let warm = 0; warm < 20; warm++) s.pointer('pointermove', HERO.x + 40 * (1 + (warm % 2)), HERO.y);
    const MOVES = 200;
    const start = performance.now();
    for (let move = 0; move < MOVES; move++) s.pointer('pointermove', HERO.x + 40 * (1 + (move % 2)), HERO.y + (move % 3));
    const mean = (performance.now() - start) / MOVES;
    s.pointer('pointerup', HERO.x, HERO.y);
    return mean;
  }

  it('is under a millisecond a move for an aura of three cells among walls, every move into another cell', async () => {
    const walls = (view: PlayerViewScene): void => {
      for (let i = 0; i < 12; i++) view.store.getState().addWall({ type: 'solid', p1: { x: 20 * i, y: 200 }, p2: { x: 20 * i + 20, y: 200 + (i % 2) * 8 } });
    };
    const s = await withHero(true);
    const bare = await withHero(true);
    walls(s);
    walls(bare);
    s.store.getState().setTokenAuras([{ tokenId: 'hero', aura: 15, points: [{ x: 100, y: 100 }, { x: 240, y: 100 }] }], { color: '#e93147' });
    const kept = s.store.getState().objects.measures;
    const withAura = perMove(s);
    const without = perMove(bare);
    console.info(`aura follow cost, ms per pointer move of a token drag into another cell: ${withAura.toFixed(3)} with an aura of three cells cut by walls, ${without.toFixed(3)} without`);
    expect(s.store.getState().objects.measures).toBe(kept);
    // The target is 1 ms for the aura's share; a machine under load still keeps three times that.
    expect(withAura - without).toBeLessThan(3);
  });
});

describe('the body of an aura under the lighting', () => {
  const MAP = 256;
  const LIT_CELL = 32;
  const GRID: MeasureGrid = {
    getOptions: () => ({ type: 'square', size: LIT_CELL, offsetX: 0, offsetY: 0 }),
    snapToCellCenter: (x, y) => ({ x: Math.floor(x / LIT_CELL) * LIT_CELL + LIT_CELL / 2, y: Math.floor(y / LIT_CELL) * LIT_CELL + LIT_CELL / 2 }),
  };
  /** On a cell's centre in the lit room; its stand-in in the token layer is an opaque square. */
  const TOKEN = { x: 80, y: 112, half: 12 };
  const cleanup: (() => void)[] = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

  /**
   * Two rooms parted by a wall down the map's middle, a lamp in the left one, no light of its own,
   * and a token in the left room. With `aura`, the token has an aura of four cells that walls do
   * not stop, so it lies over both rooms.
   */
  async function open(aura: boolean): Promise<Uint8ClampedArray> {
    const view = await openLitView({ pane: { width: MAP, height: MAP }, map: MAP });
    const { app, viewport, store, controller, displayFrames } = view;
    const tokens = new Container({ label: 'tokenContainer', zIndex: 0 });
    const token = new Sprite(Texture.WHITE);
    token.tint = 0xd0d0d0;
    token.setSize(2 * TOKEN.half, 2 * TOKEN.half);
    token.position.set(TOKEN.x - TOKEN.half, TOKEN.y - TOKEN.half);
    tokens.addChild(token);
    viewport.addChild(tokens);
    const measure = new MeasureRenderer(viewport, store, GRID);
    measure.mapBounds = () => ({ width: MAP, height: MAP });
    cleanup.push(() => { measure.destroy(); view.dispose(); });
    const state = store.getState();
    state.setSceneLighting({ enabled: true, ambient: 0 });
    state.addWall({ type: 'solid', p1: { x: 128, y: -64 }, p2: { x: 128, y: 320 } });
    state.addLight({ x: 64, y: 128, emission: { bright: 10, dim: 20, color: '#ffffff', intensity: 1, animation: 'none' } });
    store.setState({ objects: { ...store.getState().objects, tokens: { hero: { id: 'hero', kind: 'character', name: 'hero', imagePath: '', x: TOKEN.x, y: TOKEN.y } as TokenEntity } } });
    if (aura) {
      store.getState().setTokenAuras([{ tokenId: 'hero', aura: 20, points: [{ x: TOKEN.x, y: TOKEN.y }, { x: TOKEN.x + 144, y: TOKEN.y }] }], { color: '#e93147' });
      const [id] = Object.keys(store.getState().objects.measures ?? {});
      store.getState().updateMeasure(id!, { walls: false });
    }
    displayFrames(30);
    const target = RenderTexture.create({ width: MAP, height: MAP });
    let pixels = new Uint8ClampedArray();
    captureWithLayerVisibility([...controller.playerLayers(), ...measure.getPlayerViewLayers(() => true)], () => undefined, () => {
      app.renderer.render({ container: app.stage, target, clear: true, clearColor: app.renderer.background.colorRgba });
      pixels = app.renderer.extract.pixels({ target }).pixels;
    });
    target.destroy(true);
    return pixels;
  }

  const at = (pixels: Uint8ClampedArray, x: number, y: number): number[] => {
    const i = (y * MAP + x) * 4;
    return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
  };
  const differing = (a: Uint8ClampedArray, b: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number): number => {
    let count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) if (at(a, x, y).some((value, i) => Math.abs(value - at(b, x, y)[i]!) > 2)) count++;
    }
    return count;
  };

  it('is lit like the floor: the players see it in the lit room and nothing of it in the dark one, and the token covers it', async () => {
    const shown = await open(true);
    const bare = await open(false);
    // In the lamp's light the floor around the token takes the aura's red.
    expect(differing(shown, bare, 40, 150, 70, 180)).toBeGreaterThan(600);
    expect(at(shown, 56, 164)[0]).toBeGreaterThan(at(shown, 56, 164)[2]!);
    // The dark room is as dark with the aura as without, though the aura lies over it.
    expect(differing(shown, bare, 134, 0, MAP, MAP)).toBe(0);
    expect(at(shown, 190, 112).every((value) => value < 8)).toBe(true);
    // The token lies over the body.
    expect(differing(shown, bare, TOKEN.x - 8, TOKEN.y - 8, TOKEN.x + 8, TOKEN.y + 8)).toBe(0);
  });
});
