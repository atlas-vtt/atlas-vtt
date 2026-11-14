import { Container, RenderTexture, Sprite, Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeasureRenderer, type MeasureGrid } from '../../src/app/pixi/measure/MeasureRenderer';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { openLitView, type LitView } from '../helpers/litView';

vi.mock('events', async () => import('eventemitter3'));

const MAP = 256;
const CELL = 32;
const GRID: MeasureGrid = {
  getOptions: () => ({ type: 'square', size: CELL, offsetX: 0, offsetY: 0 }),
  snapToCellCenter: (x, y) => ({ x: Math.floor(x / CELL) * CELL + CELL / 2, y: Math.floor(y / CELL) * CELL + CELL / 2 }),
};
/** A token's stand-in: an opaque disc-sized square in the token layer, in the lit room. */
const TOKEN = { x: 80, y: 128, half: 12 };
/** A point of the body in the lit room, and one in the room no light reaches. */
const LIT = { x: 60, y: 90 };
const DARK = { x: 200, y: 180 };

interface Scene {
  view: LitView;
  measure: MeasureRenderer;
  /** The players' picture and the GM's, as the stage renders them. */
  players(): Uint8ClampedArray;
  gm(): Uint8ClampedArray;
}

describe('the body of a measured area under the lighting', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

  /**
   * A map of two rooms parted by a wall down its middle, a lamp in the left one and none in the
   * right, no light of its own (ambient 0), and a token in the left room. With `area`, a kept area
   * that passes walls lies over both rooms and the token.
   */
  async function open(area: boolean, lit = true): Promise<Scene> {
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
    state.setSceneLighting({ enabled: lit, ambient: 0 });
    state.addWall({ type: 'solid', p1: { x: 128, y: -64 }, p2: { x: 128, y: 320 } });
    state.addLight({ x: 64, y: 128, emission: { bright: 10, dim: 20, color: '#ffffff', intensity: 1, animation: 'none' } });
    if (area) state.addMeasure({ shape: 'circle', points: [{ x: 128, y: 128 }, { x: 128, y: 224 }], color: '#e93147', walls: false });
    displayFrames(30);
    const read = (layers: Parameters<typeof captureWithLayerVisibility>[0]): Uint8ClampedArray => {
      const target = RenderTexture.create({ width: MAP, height: MAP });
      let pixels = new Uint8ClampedArray();
      captureWithLayerVisibility(layers, () => undefined, () => {
        app.renderer.render({ container: app.stage, target, clear: true, clearColor: app.renderer.background.colorRgba });
        pixels = app.renderer.extract.pixels({ target }).pixels;
      });
      target.destroy(true);
      app.renderer.render({ container: app.stage });
      return pixels;
    };
    return {
      view, measure,
      players: () => read([...controller.playerLayers(), ...measure.getPlayerViewLayers(() => true)]),
      gm: () => read([]),
    };
  }

  const at = (pixels: Uint8ClampedArray, { x, y }: { x: number; y: number }): number[] => {
    const i = (y * MAP + x) * 4;
    return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
  };
  const differs = (a: number[], b: number[]): boolean => a.some((value, i) => Math.abs(value - b[i]!) > 2);
  /** How many pixels of the rectangle around `point` differ between two pictures. */
  const differing = (a: Uint8ClampedArray, b: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number): number => {
    let count = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (differs(at(a, { x, y }), at(b, { x, y }))) count++;
    return count;
  };

  it('is lit like the floor: the players see it in the lit room, nothing of it in the dark one, and the token covers it', async () => {
    const withArea = await open(true);
    const without = await open(false);
    const shown = withArea.players();
    const bare = without.players();
    // In the lamp's light the floor takes the area's red.
    expect(differs(at(shown, LIT), at(bare, LIT))).toBe(true);
    expect(at(shown, LIT)[0]).toBeGreaterThan(at(shown, LIT)[2]!);
    // The dark room is as dark with the area as without: no pixel of the body shows there. (Its label, above its
    // origin on the wall, is a mark above the lighting: the rows it stands in are left out.)
    expect(differing(shown, bare, 134, 0, MAP, 72)).toBe(0);
    expect(differing(shown, bare, 134, 132, MAP, MAP)).toBe(0);
    expect(at(shown, { x: 180, y: 70 }).every((value) => value < 8)).toBe(true);
    // The same place holds the body where the scene is seen by the GM in the lamp's room, mirrored.
    expect(differs(at(shown, { x: 76, y: 70 }), at(bare, { x: 76, y: 70 }))).toBe(true);
    // The token lies over the body.
    expect(differing(shown, bare, TOKEN.x - 8, TOKEN.y - 8, TOKEN.x + 8, TOKEN.y + 8)).toBe(0);
  });

  it('is read by the GM in the dark room by its unlit outline, which the players\' picture has not', async () => {
    const { gm, players } = await open(true);
    // The far end of the circle in the dark room, a row away from the handle at its end.
    const edge = { x: 128 + 96, y: 128 };
    const band = (pixels: Uint8ClampedArray): number => {
      let bright = 0;
      for (let x = edge.x - 6; x < edge.x + 6; x++) if (at(pixels, { x, y: edge.y }).some((value) => value > 100)) bright++;
      return bright;
    };
    expect(band(gm())).toBeGreaterThan(0);
    expect(band(players())).toBe(0);
  });

  it('is drawn plainly in both rooms while the scene is not lit', async () => {
    const withArea = await open(true, false);
    const without = await open(false, false);
    const shown = withArea.players();
    const bare = without.players();
    expect(differs(at(shown, LIT), at(bare, LIT))).toBe(true);
    expect(differs(at(shown, DARK), at(bare, DARK))).toBe(true);
    expect(differing(shown, bare, TOKEN.x - 8, TOKEN.y - 8, TOKEN.x + 8, TOKEN.y + 8)).toBe(0);
  });
});
