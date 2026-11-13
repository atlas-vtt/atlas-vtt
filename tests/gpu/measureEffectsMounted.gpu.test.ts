import { Container, RenderTexture, Sprite, Texture, type TextureSource } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startingLight } from '../../src/app/measure/measureLights';
import type { MeasureInput } from '../../src/app/measure/measureTypes';
import type { TokenEntity } from '../../src/app/types';
import { viewPlayback } from '../../src/app/pixi/liquids/viewLiquids';
import { MeasureRenderer, type MeasureGrid } from '../../src/app/pixi/measure/MeasureRenderer';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { pointInPolygon } from '../../src/app/vision/visibility';
import { openLitView, type LitView } from '../helpers/litView';
import { contactSheet, savePng } from './measureEffectsHarness';

vi.mock('events', async () => import('eventemitter3'));

/**
 * Effects and lights of kept areas on a real lit view: the effect is drawn in the body's place,
 * only inside the area as walls leave it and only where the players see the floor; a kept area's
 * light lights the floor and stops at walls; a picture of the scene shows the effect's still
 * moment whatever the clock says; nothing is asked of the ticker without an effect, and nothing
 * is left on the graphics card when the measurements go. `VITE_EFFECT_MOUNTED_CAPTURE=1` writes
 * the GM's and the players' picture of a fire circle that gives light to `out/measure-effects/mounted/`.
 */

const capture = import.meta.env.VITE_EFFECT_MOUNTED_CAPTURE === '1';
const MAP = 512;
const CELL = 64;
const WALL_X = 320;
const SCALE = { unitDistance: 5, cellSize: CELL };
const GRID: MeasureGrid = {
  getOptions: () => ({ type: 'square', size: CELL, offsetX: 0, offsetY: 0 }),
  snapToCellCenter: (x, y) => ({ x: Math.floor(x / CELL) * CELL + CELL / 2, y: Math.floor(y / CELL) * CELL + CELL / 2 }),
};
/** A circle two cells wide whose right side a wall cuts off. */
const CIRCLE: MeasureInput = { shape: 'circle', points: [{ x: 224, y: 256 }, { x: 352, y: 256 }], color: '#ec7500' };
const LAMP = { bright: 10, dim: 20, color: '#ffffff', intensity: 1, animation: 'none' as const };

interface Scene {
  view: LitView;
  measure: MeasureRenderer;
  players(): Uint8ClampedArray;
  gm(): Uint8ClampedArray;
}

describe('effects and lights of kept areas, mounted', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

  /** A dark map with a wall from top to bottom at `WALL_X`, a token in the left room, and the view's playback playing. */
  async function open(options: { lamp?: boolean; ambient?: number } = {}): Promise<Scene> {
    const view = await openLitView({ pane: { width: MAP, height: MAP }, map: MAP, floor: 0x9a8f80, grid: CELL });
    const { app, viewport, store, controller, displayFrames } = view;
    const tokens = new Container({ label: 'tokenContainer', zIndex: 0 });
    const token = new Sprite(Texture.WHITE);
    token.tint = 0x4d6a8a;
    token.setSize(40, 40);
    token.position.set(172, 300);
    tokens.addChild(token);
    viewport.addChild(tokens);
    const measure = new MeasureRenderer(viewport, store, GRID, undefined, viewPlayback(app, viewport, store));
    measure.mapBounds = () => ({ width: MAP, height: MAP });
    measure.effects.setMode('play');
    cleanup.push(() => { measure.destroy(); view.dispose(); });
    const state = store.getState();
    state.setSceneLighting({ enabled: true, ambient: options.ambient ?? 0 });
    state.addWall({ type: 'solid', p1: { x: WALL_X, y: -64 }, p2: { x: WALL_X, y: MAP + 64 } });
    if (options.lamp) state.addLight({ x: 96, y: 256, emission: LAMP });
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
    return { view, measure, players: () => read([...controller.playerLayers(), ...measure.getPlayerViewLayers(() => true)]), gm: () => read([]) };
  }

  const at = (pixels: Uint8ClampedArray, x: number, y: number): number[] => {
    const i = (y * MAP + x) * 4;
    return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
  };
  const brightness = (pixels: Uint8ClampedArray, x: number, y: number): number => Math.max(...at(pixels, x, y));
  const differs = (a: Uint8ClampedArray, b: Uint8ClampedArray, x: number, y: number): boolean => at(a, x, y).some((value, i) => Math.abs(value - at(b, x, y)[i]!) > 2);
  const same = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => a.length === b.length && a.every((value, i) => value === b[i]);

  it('lights the floor around a kept circle that gives light, and not past the wall', async () => {
    const { view, players } = await open();
    const dark = players();
    view.store.getState().addMeasure({ ...CIRCLE, points: [{ x: 224, y: 256 }, { x: 288, y: 256 }], light: startingLight({ shape: 'circle', points: [{ x: 224, y: 256 }, { x: 288, y: 256 }] }, null, SCALE, '#ffffff') });
    view.displayFrames(30);
    const lit = players();
    // Unlit, the players see nothing at all; the circle's light shows the floor to its edge and dimly as far again.
    expect(brightness(dark, 120, 200)).toBeLessThan(8);
    expect(brightness(lit, 190, 200)).toBeGreaterThan(60);
    expect(brightness(lit, 120, 200)).toBeGreaterThan(20);
    expect(brightness(lit, 190, 200)).toBeGreaterThan(brightness(lit, 120, 200));
    // Nothing of it past the wall, a cell from the circle's centre and well inside its bright range.
    for (let y = 16; y < MAP; y += 16) for (let x = WALL_X + 8; x < MAP; x += 8) expect(brightness(lit, x, y), `${x},${y}`).toBeLessThan(8);
    // A measurement that only changes in what is no light builds no lighting anew: the picture stays lit.
    expect(view.controller.playerSight()).toBeTruthy();
  });

  it('draws an effect only inside the area as walls leave it, and nothing of it where the players do not see the floor', async () => {
    const { view, players, measure } = await open({ lamp: true });
    const id = view.store.getState().addMeasure({ ...CIRCLE, walls: false })!;
    view.displayFrames(4);
    const washed = players();
    view.store.getState().updateMeasure(id, { effect: 'fire' });
    view.displayFrames(4);
    const fire = players();
    // The lamp's room shows the fire in the wash's place.
    let changed = 0;
    for (let y = 160; y < 352; y += 4) for (let x = 100; x < 300; x += 4) if (differs(fire, washed, x, y)) changed++;
    expect(changed).toBeGreaterThan(200);
    // The room behind the wall is dark for the players: fire or wash, they see neither there.
    for (let y = 0; y < MAP; y += 4) for (let x = WALL_X + 6; x < MAP; x += 4) expect(differs(fire, washed, x, y), `${x},${y}`).toBe(false);
    // Stopping at walls, the effect ends at the wall for the GM too: lit by a lamp past the wall, nothing of it shows there.
    view.store.getState().addLight({ x: 416, y: 256, emission: LAMP });
    view.store.getState().updateMeasure(id, { walls: undefined, effect: undefined });
    view.displayFrames(30);
    const cutWash = players();
    view.store.getState().updateMeasure(id, { effect: 'fire' });
    view.displayFrames(4);
    const cutFire = players();
    const ring = Array.from({ length: 64 }, (_, i) => ({ x: 224 + 128 * Math.cos((i / 64) * 2 * Math.PI), y: 256 + 128 * Math.sin((i / 64) * 2 * Math.PI) }));
    let inside = 0;
    for (let y = 0; y < MAP; y += 2) {
      for (let x = 0; x < MAP; x += 2) {
        if (!differs(cutFire, cutWash, x, y)) continue;
        // Within the circle and on its side of the wall, a pixel of filtering allowed.
        expect(x, `${x},${y}`).toBeLessThanOrEqual(WALL_X + 1);
        expect([[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => pointInPolygon({ x: x + dx!, y: y + dy! }, ring)), `${x},${y}`).toBe(true);
        inside++;
      }
    }
    expect(inside).toBeGreaterThan(500);
    expect(measure.effects.playing).toBe(true);
  });

  it('moves while the map plays, and shows its still moment in a picture of the scene whatever the clock says', async () => {
    const { view, gm, measure } = await open({ ambient: 1 });
    view.store.getState().addMeasure({ ...CIRCLE, effect: 'mist', color: '#ffffff' });
    view.displayFrames(4);
    const first = gm();
    view.displayFrames(20);
    expect(same(first, gm())).toBe(false);
    const still = (): Uint8ClampedArray => {
      const restore = measure.effects.stillFor();
      try {
        return gm();
      } finally {
        restore();
      }
    };
    const picture = still();
    view.displayFrames(20);
    expect(same(picture, still())).toBe(true);
    // Maps not animated: the canvas holds the same still moment, and asks for no frame.
    measure.effects.setMode('poster');
    view.displayFrames(2);
    const poster = gm();
    view.displayFrames(20);
    expect(same(poster, gm())).toBe(true);
    expect(same(poster, picture)).toBe(true);
  });

  it('moves an aura\'s effect and its light with its token, building no field anew', async () => {
    const { view, players } = await open();
    const { store, displayFrames } = view;
    /** The mesh of the one effect drawn: built anew, it is another object. */
    const piece = (): Container => view.viewport.getChildByLabel('measure-effect-piece', true)!;
    const place = (x: number): void => store.setState((state) => ({ objects: { ...state.objects, tokens: { hero: { id: 'hero', kind: 'token', imagePath: '', x, y: 224, size: 1 } as TokenEntity } } }));
    place(96);
    store.getState().setTokenAuras([{ tokenId: 'hero', aura: 5, points: [{ x: 96, y: 224 }, { x: 192, y: 224 }] }], { color: '#e0ac00' });
    const [aura] = Object.keys(store.getState().objects.measures ?? {});
    store.getState().updateMeasure(aura!, { effect: 'radiance', light: startingLight({ shape: 'circle', points: [{ x: 96, y: 224 }, { x: 192, y: 224 }] }, 'radiance', SCALE, '#e0ac00') });
    displayFrames(30);
    const before = players();
    const drawn = piece();
    const at = drawn.parent!.position.x;
    const kept = store.getState().objects.measures;
    // Lit around the token, dark two cells on.
    expect(brightness(before, 96, 300)).toBeGreaterThan(40);
    expect(brightness(before, 224, 380)).toBeLessThan(20);
    place(224);
    displayFrames(30);
    const after = players();
    expect(brightness(after, 224, 300)).toBeGreaterThan(40);
    expect(brightness(after, 224, 380)).toBeGreaterThan(brightness(before, 224, 380) + 10);
    expect(brightness(after, 20, 120)).toBeLessThan(brightness(before, 20, 120));
    // The aura was not written, and the effect that moved with it holds the field it had.
    expect(store.getState().objects.measures).toBe(kept);
    expect(piece()).toBe(drawn);
    expect(drawn.parent!.position.x - at).toBe(128);
  });

  it('asks nothing of the ticker without an effect, and leaves nothing on the graphics card when the measurements go', async () => {
    const { view, measure } = await open({ ambient: 1 });
    const { store, app, displayFrames } = view;
    const managed = (): number => (app.renderer.texture as unknown as { managedTextures: (TextureSource | null)[] }).managedTextures.filter(Boolean).length;
    const first = store.getState().addMeasure(CIRCLE)!;
    const second = store.getState().addMeasure(CIRCLE)!;
    displayFrames(4);
    expect(measure.effects.playing).toBe(false);
    const plain = managed();
    store.getState().updateMeasure(first, { effect: 'fire' });
    store.getState().updateMeasure(second, { effect: 'frost' });
    displayFrames(4);
    expect(measure.effects.playing).toBe(true);
    expect(managed()).toBe(plain + 2);
    // Another look, colour and size use the field they have or build one in its place.
    store.getState().updateMeasure(first, { effect: 'shadow', color: '#7852ee', points: [{ x: 224, y: 256 }, { x: 288, y: 256 }] });
    displayFrames(4);
    expect(managed()).toBe(plain + 2);
    // A look taken away gives its field back, and a measurement deleted with its look leaves what one deleted without leaves.
    store.getState().updateMeasure(first, { effect: undefined });
    displayFrames(4);
    expect(managed()).toBe(plain + 1);
    expect(measure.effects.playing).toBe(true);
    store.getState().updateMeasure(second, { effect: undefined });
    displayFrames(4);
    expect(managed()).toBe(plain);
    expect(measure.effects.playing).toBe(false);
    store.getState().deleteMeasure(second);
    displayFrames(4);
    const withOne = managed();
    const third = store.getState().addMeasure({ ...CIRCLE, effect: 'lightning' })!;
    displayFrames(4);
    expect(measure.effects.playing).toBe(true);
    store.getState().deleteMeasure(third);
    displayFrames(4);
    expect(managed()).toBe(withOne);
    expect(measure.effects.playing).toBe(false);
  });

  it.skipIf(!capture)('writes the GM\'s and the players\' picture of a fire circle that gives light', async () => {
    const { view, gm, players } = await open();
    const state = view.store.getState();
    state.addWall({ type: 'solid', p1: { x: 64, y: 128 }, p2: { x: 192, y: 128 } });
    state.addMeasure({ ...CIRCLE, effect: 'fire', light: startingLight(CIRCLE, 'fire', SCALE, '#ec7500') });
    view.displayFrames(40);
    await savePng(contactSheet([gm(), players()], MAP, MAP, 2), 'mounted/fire-circle-gm-and-players');
    state.setSceneLighting({ ambient: 0.35 });
    state.addMeasure({ shape: 'line', points: [{ x: 96, y: 416 }, { x: 288, y: 416 }], width: CELL, color: '#086ddd', effect: 'lightning', light: startingLight({ shape: 'line', points: [{ x: 96, y: 416 }, { x: 288, y: 416 }], width: CELL }, 'lightning', SCALE, '#086ddd') });
    view.displayFrames(40);
    await savePng(contactSheet([gm(), players()], MAP, MAP, 2), 'mounted/fire-and-lightning-dusk');
  });
});
