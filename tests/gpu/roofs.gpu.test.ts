import '../setup/obsidianDom';
import { RenderTexture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchGl } from '../../src/app/pixi/lighting/engine/__tests__/strictGl';
import { GM_ROOF_ALPHA } from '../../src/app/pixi/lighting/levels/RoofLayer';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { LEVELS, openLevelsView, type LevelsView } from '../helpers/levelsView';
import { token } from '../helpers/levelsFuzz';
import { green, roofMap } from '../helpers/roofsFuzz';

vi.mock('events', async () => import('eventemitter3'));

const MAP = 512;
const PANE = 256;
/** World pixels to screen pixels: the whole map in the pane. */
const SCALE = PANE / MAP;
/** Two roofs: the scout's house over the first, a stranger under the second. */
const HOUSE = [50, 50, 200, 200] as const;
const BARN = [300, 300, 450, 450] as const;

const ROOFED: SceneLevel[] = LEVELS.map((level) => (level.id === 'upper' ? { ...level, foreground: 'roof.png' } : level));

let view: LevelsView | null = null;

afterEach(() => {
  view?.dispose();
  view = null;
});

async function open(): Promise<LevelsView> {
  view = await openLevelsView({ map: MAP, pane: PANE, roofs: true, maps: { 'roof.png': roofMap(MAP, MAP, [HOUSE, BARN], 'green', 1) } });
  const { store } = view;
  store.setState({
    mapLoaded: true, isMapLoading: false, levels: LEVELS, viewedLevel: 'upper',
    objects: {
      ...store.getState().objects,
      tokens: { scout: token('scout', [125, 125], 'upper', { vision: { enabled: true } }), stranger: token('stranger', [375, 375], 'upper') },
      // A dusk zone over the house: the roof reads the ambient light by texel there.
      lightZones: { dusk: { id: 'dusk', kind: 'light-zone', levels: ['upper'], ambient: 0.5, polygon: [{ x: 40, y: 40 }, { x: 220, y: 40 }, { x: 220, y: 220 }, { x: 40, y: 220 }] } },
    },
  });
  store.getState().setSceneLighting({ enabled: true, ambient: 1 });
  await view.settle();
  return view;
}

/** The pixel at world point (`x`, `y`) of a picture of the whole map. */
function at(pixels: Uint8ClampedArray, x: number, y: number): [number, number, number] {
  const o = (Math.floor(y * SCALE) * PANE + Math.floor(x * SCALE)) * 4;
  return [pixels[o]!, pixels[o + 1]!, pixels[o + 2]!];
}

async function withRoof(shown: LevelsView, roofed: boolean, picture: () => Promise<Uint8ClampedArray>): Promise<Uint8ClampedArray> {
  shown.store.setState({ levels: roofed ? ROOFED : LEVELS });
  await shown.settle();
  return (await picture()).slice();
}

describe('a level\'s roof', () => {
  it('is drawn in the players\' frame over the barn and faded over the scout\'s house, under strict GL', async () => {
    const shown = await open();
    const bare = await withRoof(shown, false, () => shown.settledPlayerFrame(SCALE, 0, 0));
    const watch = watchGl((shown.app.renderer as WebGLRenderer).gl);
    const roofed = await withRoof(shown, true, () => shown.settledPlayerFrame(SCALE, 0, 0));
    watch.stop();
    expect(watch.findings).toEqual([]);
    expect(watch.draws()).toBeGreaterThan(0);
    expect(at(roofed, 125, 125)).toEqual(at(bare, 125, 125));
    const barn = at(roofed, 375, 375);
    expect(barn).not.toEqual(at(bare, 375, 375));
    expect(green(Uint8ClampedArray.from([...barn, 255]), 0)).toBe(true);
    // The stranger under the drawn barn is not seen by the players; the scout under its faded house is.
    expect(shown.roofs!.covers({ x: 375, y: 375 })).toBe(true);
    expect(shown.roofs!.covers({ x: 125, y: 125 })).toBe(false);
  });

  it('is translucent in the GM\'s view, faded under the selected token, and gone while the GM hides roofs', async () => {
    const shown = await open();
    const gm = (): Promise<Uint8ClampedArray> => Promise.resolve(shown.gmCanvas(SCALE, 0, 0));
    const bare = await withRoof(shown, false, gm);
    const roofed = await withRoof(shown, true, gm);
    const [floor, drawn] = [at(bare, 125, 125), at(roofed, 125, 125)];
    expect(drawn).not.toEqual(floor);
    // Translucent: the floor beneath still shows through.
    expect(drawn[0]).toBeGreaterThan(Math.round(floor[0] * (1 - GM_ROOF_ALPHA)) - 20);
    shown.store.getState().setSelection(['stranger']);
    await shown.settle();
    const selected = shown.gmCanvas(SCALE, 0, 0).slice();
    expect(at(selected, 375, 375)).toEqual(at(bare, 375, 375));
    expect(at(selected, 125, 125)).toEqual(drawn);
    shown.store.getState().setRoofsHidden(true);
    await shown.settle();
    const hidden = shown.gmCanvas(SCALE, 0, 0);
    expect(hidden.every((value, i) => value === bare[i])).toBe(true);
  });

  it('is whole in a picture of the scene, the house over the scout too', async () => {
    const shown = await open();
    const renderer = shown.app.renderer as WebGLRenderer;
    const target = RenderTexture.create({ width: PANE, height: PANE });
    const picture = (): Uint8ClampedArray => {
      shown.viewport.scale.set(SCALE);
      shown.viewport.position.set(0, 0);
      return shown.roofs!.renderForFrame({ x: 0, y: 0, resolution: SCALE }, () => shown.controller.renderer.renderForFrame({ x: 0, y: 0, resolution: SCALE }, () => {
        renderer.render({ container: shown.app.stage, target, clear: true, clearColor: [0, 0, 0, 1] });
        return renderer.extract.pixels({ target }).pixels.slice();
      }));
    };
    shown.store.getState().setRoofsHidden(true);
    const roofed = await withRoof(shown, true, () => Promise.resolve(picture()));
    expect(green(Uint8ClampedArray.from([...at(roofed, 125, 125), 255]), 0)).toBe(true);
    expect(green(Uint8ClampedArray.from([...at(roofed, 375, 375), 255]), 0)).toBe(true);
    target.destroy(true);
  });

  it('is drawn as its image is on an unlit scene, faded under the party all the same', async () => {
    const shown = await open();
    shown.store.getState().setSceneLighting({ enabled: false });
    await shown.settle();
    const bare = await withRoof(shown, false, () => shown.settledPlayerFrame(SCALE, 0, 0));
    const roofed = await withRoof(shown, true, () => shown.settledPlayerFrame(SCALE, 0, 0));
    expect(at(roofed, 125, 125)).toEqual(at(bare, 125, 125));
    const [r, g, b] = at(roofed, 375, 375);
    // The image's own green, unlit: as bright as it was painted.
    expect(g).toBeGreaterThan(195);
    expect(r).toBeLessThan(60);
    expect(b).toBeLessThan(50);
    expect(shown.roofs!.covers({ x: 375, y: 375 })).toBe(true);
  });
});
