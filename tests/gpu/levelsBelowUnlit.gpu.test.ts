import '../setup/obsidianDom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Rectangle, type WebGLRenderer } from 'pixi.js';
import type { TokenEntity } from '../../src/app/types';
import type { FogOperation } from '../../src/app/types/fogTypes';
import type { LevelSurface, SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { BELOW_GM_DIM, BELOW_PLAYER_DIM } from '../../src/app/pixi/lighting/levels/LevelsBelow';
import { watchGl } from '../../src/app/pixi/lighting/engine/__tests__/strictGl';
import { HIDDEN_TOKEN_ALPHA } from '../../src/app/pixi/playerSafeFrame';
import { LEVELS, openLevelsView, paintedRgbaTexture, paintedTexture, worldOf, type FakeMap, type LevelsView } from '../helpers/levelsView';

vi.mock('events', async () => import('eventemitter3'));

const MAP = 512;
const PANE = 256;
const SCALE = PANE / MAP;
/** The transparent part of the upper floor's map, in its pixels, which are the world's. */
const HOLE = { from: 160, to: 352 };
type Rgb = [number, number, number];
/** The ground floor's map, one colour all over, which nothing of the upper floor has. */
const GROUND: Rgb = [220, 30, 220];
/** How translucent the GM sees the committed fog of a level below (`BelowLevel`). */
const GM_FOG_ALPHA = 0.5;
/** The art of every token on the ground floor. */
const TOKEN: Rgb = [30, 200, 200];

const inHole = (x: number, y: number): boolean => x >= HOLE.from && x < HOLE.to && y >= HOLE.from && y < HOLE.to;
const rect = (x: number, y: number, w: number, h: number): LevelSurface['polygon'] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const token = (id: string, x: number, y: number, more: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', x, y, imagePath: 'art.png', level: 'ground', ...more }) as TokenEntity;

/** A map of one colour, transparent where `open` says. */
function holedMap(colour: Rgb, open: (x: number, y: number) => boolean): FakeMap {
  const opaque = new Uint8Array(MAP * MAP);
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) opaque[y * MAP + x] = open(x, y) ? 0 : 1;
  return {
    texture: paintedRgbaTexture(MAP, MAP, (x, y) => (open(x, y) ? [0, 0, 0, 0] : [...colour, 255])),
    width: MAP, height: MAP, alpha: { width: MAP, height: MAP, opaque },
  };
}

/** The upper floor's map: white, with a square of it transparent. */
const holedUpper = (): FakeMap => holedMap([255, 255, 255], inHole);

/** A pixel shows the ground floor's hue: red and blue far above green. */
const magenta = (pixels: Uint8ClampedArray, o: number): boolean => pixels[o]! > pixels[o + 1]! + 60 && pixels[o + 2]! > pixels[o + 1]! + 60;
/** The pixel of the frame that shows world point (`x`, `y`). */
const at = (x: number, y: number): number => (Math.floor(y * SCALE) * PANE + Math.floor(x * SCALE)) * 4;
const rgb = (pixels: Uint8ClampedArray, o: number): Rgb => [pixels[o]!, pixels[o + 1]!, pixels[o + 2]!];
const dimmed = (colour: Rgb, dim: number): Rgb => [colour[0] * dim, colour[1] * dim, colour[2] * dim];

function expectColour(actual: Rgb, expected: Rgb, tolerance = 2): void {
  for (let channel = 0; channel < 3; channel++) expect(Math.abs(actual[channel]! - expected[channel]!), `${actual.join(',')} for ${expected.join(',')}`).toBeLessThanOrEqual(tolerance);
}

/** Which pixels of a frame show the ground floor. */
function shownBelow(pixels: Uint8ClampedArray): Uint8Array {
  const shown = new Uint8Array(pixels.length / 4);
  for (let i = 0; i < shown.length; i++) shown[i] = magenta(pixels, i * 4) ? 1 : 0;
  return shown;
}

/** How many pixels inside the transparent part show the ground floor, of how many, and how many of the floor around it do. */
function holeCount(pixels: Uint8ClampedArray): { inside: number; shown: number; leaked: number } {
  const count = { inside: 0, shown: 0, leaked: 0 };
  for (let sy = 0; sy < PANE; sy++) {
    for (let sx = 0; sx < PANE; sx++) {
      const p = worldOf(sx, sy, 1, SCALE, 0, 0);
      const o = (sy * PANE + sx) * 4;
      // A texel of the stack beside art is floor: the rim of the transparent part is left out of both counts.
      if (inHole(p.x - 4, p.y - 4) && inHole(p.x + 4, p.y + 4)) {
        count.inside++;
        if (magenta(pixels, o)) count.shown++;
      } else if (!inHole(p.x - 4, p.y - 4) && !inHole(p.x + 4, p.y + 4) && !inHole(p.x - 4, p.y + 4) && !inHole(p.x + 4, p.y - 4) && magenta(pixels, o)) {
        count.leaked++;
      }
    }
  }
  return count;
}

interface Scene {
  lit: boolean;
  levels?: SceneLevel[];
  tokens?: Record<string, TokenEntity>;
  surfaces?: Record<string, LevelSurface>;
  fog?: Record<string, FogOperation>;
}

/** Sets the scene, lit by full daylight without a vision token (all of it seen) or with its lighting off, and waits for the level below. */
async function scene(view: LevelsView, { lit, levels = LEVELS, tokens = {}, surfaces = {}, fog = {} }: Scene): Promise<void> {
  const { store } = view;
  store.setState({
    mapLoaded: true, isMapLoading: false, levels, viewedLevel: 'upper',
    objects: { ...store.getState().objects, tokens, levelSurfaces: surfaces, fog },
  });
  store.getState().setSceneLighting({ enabled: lit, ambient: 1 });
  await view.settle();
}

describe('levels below through openings, on a scene without lighting', () => {
  const views: LevelsView[] = [];
  afterEach(() => {
    while (views.length) views.pop()!.dispose();
  });

  /** A view of the upper floor, whose map has a transparent square, over a ground floor of one colour. */
  async function open(options: { holed?: boolean } = {}): Promise<LevelsView> {
    const view = await openLevelsView({
      map: MAP, pane: PANE, below: paintedTexture(MAP, MAP, () => GROUND), tokenArt: paintedTexture(8, 8, () => TOKEN),
      ...(options.holed !== false && { maps: { 'upper.png': holedUpper() } }),
    });
    views.push(view);
    return view;
  }

  it.each([{ lit: true }, { lit: false }])('shows the level below through the transparent part of the upper level\'s map (lit: $lit)', async ({ lit }) => {
    const view = await open();
    await scene(view, { lit });
    for (const frame of [view.playerFrame(SCALE, 0, 0), view.gmCanvas(SCALE, 0, 0)]) {
      const { inside, shown, leaked } = holeCount(frame);
      expect(inside).toBeGreaterThan(7000);
      expect(shown).toBe(inside);
      expect(leaked).toBe(0);
    }
  });

  it('shows it where the lit scene shows it, pixel for pixel, dimmed as there and otherwise as its map is', async () => {
    const lit = await open();
    await scene(lit, { lit: true });
    const unlit = await open();
    await scene(unlit, { lit: false });
    const players = unlit.playerFrame(SCALE, 0, 0).slice();
    const gm = unlit.gmCanvas(SCALE, 0, 0).slice();
    expect([...shownBelow(players)]).toEqual([...shownBelow(lit.playerFrame(SCALE, 0, 0))]);
    expect([...shownBelow(gm)]).toEqual([...shownBelow(lit.gmCanvas(SCALE, 0, 0))]);
    // Without lighting nothing is tonemapped: the level below is its map's own colour, a step darker per picture.
    expectColour(rgb(players, at(256, 256)), dimmed(GROUND, BELOW_PLAYER_DIM));
    expectColour(rgb(gm, at(256, 256)), dimmed(GROUND, BELOW_GM_DIM));
    // The upper floor is untouched around it.
    expectColour(rgb(players, at(80, 80)), [255, 255, 255]);
    expectColour(rgb(gm, at(80, 80)), [255, 255, 255]);
  });

  it('shows the level below through a drawn opening, and nothing where a drawn floor closes the map\'s transparent part', async () => {
    const view = await open({ holed: false });
    await scene(view, { lit: false, surfaces: { hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: rect(HOLE.from, HOLE.from, 192, 192) } } });
    for (const frame of [view.playerFrame(SCALE, 0, 0), view.gmCanvas(SCALE, 0, 0)]) {
      const { inside, shown, leaked } = holeCount(frame);
      expect(shown).toBe(inside);
      expect(leaked).toBe(0);
    }
    const bridged = await open();
    await scene(bridged, { lit: false, surfaces: { bridge: { id: 'bridge', kind: 'level-surface', level: 'upper', open: false, polygon: rect(HOLE.from - 8, HOLE.from - 8, 208, 208) } } });
    for (const frame of [bridged.playerFrame(SCALE, 0, 0), bridged.gmCanvas(SCALE, 0, 0)]) expect(shownBelow(frame).includes(1)).toBe(false);
  });

  it('shows no level the upper level does not see, and none where its transparent parts are not open', async () => {
    const blind = await open();
    await scene(blind, { lit: false, levels: [LEVELS[0]!, { ...LEVELS[1]!, sees: [] }] });
    const closed = await open();
    await scene(closed, { lit: false, levels: [LEVELS[0]!, { ...LEVELS[1]!, openArt: false }] });
    for (const view of [blind, closed]) {
      for (const frame of [view.playerFrame(SCALE, 0, 0), view.gmCanvas(SCALE, 0, 0)]) expect(shownBelow(frame).includes(1)).toBe(false);
    }
  });

  it('shows the second level down through the transparent parts of both above it, dimmed twice', async () => {
    const cellar: Rgb = [30, 200, 200];
    const levels: SceneLevel[] = [{ id: 'cellar', name: 'Cellar', elevation: { bottom: -10, top: 0 }, background: 'cellar.png' }, ...LEVELS];
    const well = (x: number, y: number): boolean => x >= 224 && x < 288 && y >= 224 && y < 288;
    const view = await openLevelsView({
      map: MAP, pane: PANE, levels,
      maps: { 'upper.png': holedUpper(), 'ground.png': holedMap(GROUND, well), 'cellar.png': { texture: paintedTexture(MAP, MAP, () => cellar), width: MAP, height: MAP } },
    });
    views.push(view);
    await scene(view, { lit: false, levels });
    await view.settle();
    const players = view.playerFrame(SCALE, 0, 0).slice();
    const gm = view.gmCanvas(SCALE, 0, 0);
    expectColour(rgb(players, at(256, 256)), dimmed(cellar, BELOW_PLAYER_DIM ** 2));
    expectColour(rgb(players, at(190, 190)), dimmed(GROUND, BELOW_PLAYER_DIM));
    expectColour(rgb(gm, at(256, 256)), dimmed(cellar, BELOW_GM_DIM ** 2));
    expectColour(rgb(gm, at(190, 190)), dimmed(GROUND, BELOW_GM_DIM));
  });

  it('shows the players the tokens of the level below they may see and its fog whole, in their frame and in session view', async () => {
    const view = await open();
    const fog: Record<string, FogOperation> = { f: { id: 'f', kind: 'fog', type: 'rectangle', timestamp: 1, isErasing: false, level: 'ground', x: 288, y: 160, width: 64, height: 192 } };
    await scene(view, { lit: false, tokens: { seen: token('seen', 210, 210), hidden: token('hidden', 210, 300, { isHidden: true }) }, fog });
    await view.settle();
    const players = view.playerFrame(SCALE, 0, 0).slice();
    const gm = view.gmCanvas(SCALE, 0, 0).slice();
    expectColour(rgb(players, at(210, 210)), dimmed(TOKEN, BELOW_PLAYER_DIM));
    // A hidden token is the GM's alone, translucent as on its own level.
    expectColour(rgb(players, at(210, 300)), dimmed(GROUND, BELOW_PLAYER_DIM));
    expectColour(rgb(gm, at(210, 300)), dimmed([0, 1, 2].map((c) => TOKEN[c]! * HIDDEN_TOKEN_ALPHA + GROUND[c]! * (1 - HIDDEN_TOKEN_ALPHA)) as Rgb, BELOW_GM_DIM), 4);
    // The level's own fog hides its map from the players.
    expect(Math.max(...rgb(players, at(320, 256)))).toBeLessThan(40);
    // The GM sees through it, as on the level itself.
    expectColour(rgb(gm, at(320, 200)), dimmed(GROUND, BELOW_GM_DIM * GM_FOG_ALPHA), 6);
    // Session view: the GM's canvas shows what the players' frame shows.
    view.store.setState({ isGMView: false });
    await view.settle();
    const session = view.gmCanvas(SCALE, 0, 0);
    expectColour(rgb(session, at(256, 200)), dimmed(GROUND, BELOW_PLAYER_DIM));
    expectColour(rgb(session, at(210, 300)), dimmed(GROUND, BELOW_PLAYER_DIM));
    expect(Math.max(...rgb(session, at(320, 256)))).toBeLessThan(40);
  });

  it('draws the level below into a picture of the scene', async () => {
    const view = await open();
    await scene(view, { lit: false });
    const renderer = view.app.renderer as WebGLRenderer;
    const frame = { x: 0, y: 0, resolution: SCALE, width: MAP, height: MAP };
    const texture = view.controller.renderer.renderForFrame(frame, () => renderer.generateTexture({ target: view.viewport, frame: new Rectangle(0, 0, MAP, MAP), resolution: SCALE }));
    const picture = renderer.extract.pixels({ target: texture }).pixels;
    texture.destroy(true);
    const { inside, shown, leaked } = holeCount(picture);
    expect(shown).toBe(inside);
    expect(leaked).toBe(0);
    expectColour(rgb(picture, at(256, 256)), dimmed(GROUND, BELOW_GM_DIM));
    // The canvas shows its own afterwards.
    expect(holeCount(view.gmCanvas(SCALE, 0, 0)).shown).toBe(inside);
  });

  it('follows the scene\'s lighting as it is switched off and on, without an error on the graphics device', async () => {
    const view = await open();
    const watch = watchGl((view.app.renderer as WebGLRenderer).gl);
    try {
      await scene(view, { lit: true });
      const lit = view.playerFrame(SCALE, 0, 0).slice();
      view.store.getState().setSceneLighting({ enabled: false });
      await view.settle();
      const { inside, shown } = holeCount(view.playerFrame(SCALE, 0, 0));
      expect(shown).toBe(inside);
      expect(holeCount(view.gmCanvas(SCALE, 0, 0)).shown).toBe(inside);
      view.store.getState().setSceneLighting({ enabled: true });
      await view.settle();
      expect([...(await view.settledPlayerFrame(SCALE, 0, 0))]).toEqual([...lit]);
      expect(watch.findings).toEqual([]);
    } finally {
      watch.stop();
    }
  });

  it('lets a token dropped on the transparent part fall, as the lit scene does', async () => {
    const view = await open();
    await scene(view, { lit: false });
    const floors = view.controller.renderer.artFloors?.();
    expect(floors?.('upper', { x: 256, y: 256 })).toBe(false);
    expect(floors?.('upper', { x: 80, y: 80 })).toBe(true);
  });
});
