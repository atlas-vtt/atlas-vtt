import '../setup/obsidianDom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NO_STRETCH, type MapStretch } from '../../src/app/grid/mapStretch';
import { alignmentPlacement } from '../../src/app/levels/levelAlignment';
import type { LevelAlignment } from '../../src/app/types/sceneLevelTypes';
import { LEVELS, openLevelsView, paintedRgbaTexture, paintedTexture, type FakeMap, type LevelsView } from '../helpers/levelsView';

vi.mock('events', async () => import('eventemitter3'));

const MAP = 512;
const PANE = 256;
const SCALE = PANE / MAP;
/** Where the GM placed the upper floor (Position floor): four cells of 32 px right and down of the world's corner. */
const PLACED: LevelAlignment = { offset: { x: 128, y: 128 }, scale: 1, stretch: NO_STRETCH };
/** The transparent part of the upper floor's map, in its own pixels. */
const HOLE = { from: 160, to: 352 };
type Rgb = [number, number, number];
const GROUND: Rgb = [220, 30, 220];

const inHole = (x: number, y: number): boolean => x >= HOLE.from && x < HOLE.to && y >= HOLE.from && y < HOLE.to;

/** The upper floor's map: white, with a square of it transparent. */
function holedUpper(): FakeMap {
  const opaque = new Uint8Array(MAP * MAP);
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) opaque[y * MAP + x] = inHole(x, y) ? 0 : 1;
  return {
    texture: paintedRgbaTexture(MAP, MAP, (x, y) => (inHole(x, y) ? [0, 0, 0, 0] : [255, 255, 255, 255])),
    width: MAP, height: MAP, alpha: { width: MAP, height: MAP, opaque },
  };
}

const at = (x: number, y: number): number => (Math.floor(y * SCALE) * PANE + Math.floor(x * SCALE)) * 4;
const rgb = (pixels: Uint8ClampedArray, o: number): Rgb => [pixels[o]!, pixels[o + 1]!, pixels[o + 2]!];
const magenta = (pixels: Uint8ClampedArray, o: number): boolean => pixels[o]! > pixels[o + 1]! + 60 && pixels[o + 2]! > pixels[o + 1]! + 60;

function countMagenta(pixels: Uint8ClampedArray): number {
  let count = 0;
  for (let o = 0; o < pixels.length; o += 4) if (magenta(pixels, o)) count++;
  return count;
}

describe('a floor\'s map drawn elsewhere for a moment (fitting its grid, placing the floor)', () => {
  const views: LevelsView[] = [];
  afterEach(() => {
    while (views.length) views.pop()!.dispose();
  });

  async function placedUpper(lit: boolean): Promise<LevelsView> {
    const placement: MapStretch = alignmentPlacement(PLACED);
    const view = await openLevelsView({
      map: MAP, pane: PANE, below: paintedTexture(MAP, MAP, () => GROUND), maps: { 'upper.png': holedUpper() }, viewedPlacement: placement,
    });
    views.push(view);
    const { store } = view;
    store.setState({ mapLoaded: true, isMapLoading: false, levels: LEVELS, viewedLevel: 'upper', levelAlignments: { upper: PLACED } });
    store.getState().setSceneLighting({ enabled: lit, ambient: 1 });
    await view.settle();
    return view;
  }

  it.each([{ lit: true }, { lit: false }])('shows that map whole while it is drawn elsewhere, and the floor below through it again once it is back (lit: $lit)', async ({ lit }) => {
    const view = await placedUpper(lit);
    const pictures = [(): Uint8ClampedArray => view.playerFrame(SCALE, 0, 0).slice(), (): Uint8ClampedArray => view.gmCanvas(SCALE, 0, 0).slice()];
    // Where the scene places the floor, the ground shows through its transparent part; the floor's art is white as lit.
    const white = pictures.map((picture) => {
      const frame = picture();
      expect(magenta(frame, at(128 + 256, 128 + 256))).toBe(true);
      return rgb(frame, at(128 + 40, 128 + 40));
    });

    // The grid panel fits the floor's image on its own, from the world's corner: its map is drawn there, the scene unchanged.
    view.previewViewedMap(NO_STRETCH);
    pictures.forEach((picture, i) => {
      const frame = picture();
      // Where the scene places nothing of the floor, and where its transparent part lies, the map drawn there shows as lit.
      for (const [x, y] of [[40, 40], [400, 60], [60, 400], [140, 300], [480, 480]] as const) expect(rgb(frame, at(x, y)), `${x},${y}`).toEqual(white[i]);
      // The openings belong to the floor where the scene places it: nothing below shows through a map drawn elsewhere.
      expect(countMagenta(frame)).toBe(0);
    });

    // Back where the scene has it, the ground shows through it again.
    await view.showViewedMap('upper.png', alignmentPlacement(PLACED));
    await view.settle();
    for (const picture of pictures) expect(magenta(picture(), at(128 + 256, 128 + 256))).toBe(true);
  });
});
