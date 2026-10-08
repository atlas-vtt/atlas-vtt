/// <reference types="vite/client" />
import '../setup/obsidianDom';
import type { Renderer } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource } from '../../src/app/types/lightingTypes';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import type { MapBounds } from '../../src/app/vision/visibility';
import { closeUps, KINDS, MAX_ZOOM, openPictures, startRenderers, tiles, type Kind, type Pictures, type Tallies } from '../helpers/fallbackPictures';
import { sightScene } from '../helpers/sightScenes';

const MEASUREMENT: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };
/**
 * Seeded scenes swept at zoom 1 over the whole map and at the maximum zoom on its edges;
 * `VITE_FALLBACK_SEEDS=600` for a long run. 600 seeds (21,123 views) left nothing shown and no
 * black without a cause, on either renderer.
 */
const SEEDS = Number(import.meta.env.VITE_FALLBACK_SEEDS) || 24;
/**
 * Scenes of the long run, on maps of more than 2,048 px, in which a hidden sliver between two
 * tokens' sight, 0.15 to 0.3 texel thick, shows at the maximum zoom: the mask's limit. No
 * part of them has a texel to spare, so they pass, and they are swept in every run.
 */
const SLIVERS = [484, 486, 593];
const CLEAN = { canvas: { leaked: 0, lost: 0, beyond: 0 }, webgl: { leaked: 0, lost: 0, beyond: 0 } };

function token(id: string, x: number, y: number, vision: TokenEntity['vision'] = { enabled: true }): TokenEntity {
  return { id, kind: 'token', imagePath: '', x, y, size: 1, layer: 0, rotation: 0, isHidden: false, vision };
}

function wall(id: string, p1: Point, p2: Point): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1, p2 };
}

function byId<T extends { id: string }>(list: readonly T[] = []): Record<string, T> {
  return Object.fromEntries(list.map((item) => [item.id, item]));
}

/** What must be none in a view: pixels shown that are hidden, and black without a cause or beyond the map. */
function faults(tallies: Tallies): typeof CLEAN {
  const of = ({ leaked, lost, beyond }: Tallies[Kind]): (typeof CLEAN)[Kind] => ({ leaked, lost, beyond });
  return { canvas: of(tallies.canvas), webgl: of(tallies.webgl) };
}

/** The faults of several views, added up. */
function sumOf(list: readonly Tallies[]): typeof CLEAN {
  const sum = structuredClone(CLEAN);
  for (const tallies of list) {
    for (const kind of KINDS) {
      sum[kind].leaked += tallies[kind].leaked;
      sum[kind].lost += tallies[kind].lost;
      sum[kind].beyond += tallies[kind].beyond;
    }
  }
  return sum;
}

/**
 * The picture the line-of-sight fallback gives the players, on PIXI's Canvas renderer and on
 * WebGL, against the exact black: the previous version's drawing read as it was meant, whose
 * polygons are the sweep's own. No pixel shows anything where the exact black holds its middle
 * with a texel of the mask to spare around it, and every black pixel has an outline or the
 * map's edge within three texels of it. Both hold at zoom 1 and at the map's maximum zoom.
 */
describe('the picture of the line-of-sight fallback against the exact black', { timeout: 3_600_000 }, () => {
  let renderers: Record<Kind, Renderer>;
  let stop: () => void;
  beforeAll(async () => {
    ({ renderers, stop } = await startRenderers());
  });
  afterAll(() => stop());

  function custom(bounds: MapBounds, scene: { tokens: TokenEntity[]; walls?: WallSegment[]; lights?: LightSource[] }): Pictures {
    const store: ViewAtlasStore = createViewAtlasStore(createInMemoryApp().app, `fallback-picture-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.setState((state) => ({ objects: { ...state.objects, tokens: byId(scene.tokens), walls: byId(scene.walls), lights: byId(scene.lights) } }));
    store.getState().setSceneLighting({ enabled: true, ambient: 0 });
    return openPictures(renderers, { store, measurement: () => MEASUREMENT, bounds });
  }

  function seeded(seed: number): Pictures {
    const scene = sightScene(seed);
    const store = createViewAtlasStore(createInMemoryApp().app, `fallback-picture-${seed}`);
    const { state } = scene;
    store.setState({ persistenceEnabled: false, grid: state.grid, lighting: state.lighting, heldTokens: state.heldTokens, objects: { ...store.getState().objects, ...state.objects } });
    return openPictures(renderers, { store, measurement: scene.measurement, rules: () => scene.rules, bounds: scene.bounds });
  }

  /** The faults of every view of a scene the sweep looks at: the whole map at zoom 1, and its borders and edges of sight at the maximum zoom. */
  function sweep(pictures: Pictures): typeof CLEAN {
    const views = [...tiles(pictures.bounds), ...closeUps(pictures.bounds, pictures.outlines)];
    return sumOf(views.map((view) => pictures.judge(view)));
  }

  it('keeps a pocket nobody sees black, though one of its corners falls on a corner of another token\'s sight', () => {
    // A clipping library returned the two sight polygons as one ring without the pocket behind the upper end of the second wall.
    const pictures = custom({ width: 974, height: 1177 }, {
      tokens: [token('far', 972, 673.6085550785065), token('near', 4.485724144149572, 2, { enabled: true, range: 58 })],
      walls: [
        wall('first', { x: 434.72649759380147, y: 613.0762529624626 }, { x: 392.9031451377217, y: 424.7449428604441 }),
        wall('second', { x: 208.75308253709227, y: 549.3958777331281 }, { x: 81.6349730713242, y: 932.7019875781273 }),
      ],
    });
    try {
      // Inside the triangle (208.75, 549.4), (236, 619.25), (196.5, 586.25).
      const inside = [{ x: 213.75, y: 585 }, { x: 212.5, y: 576 }, { x: 209.4, y: 585.3 }, { x: 213, y: 581 }];
      expect(inside.map(({ x, y }) => pictures.exactlyBlack(x, y))).toEqual(inside.map(() => true));
      for (const scale of [1, MAX_ZOOM]) {
        const view = { scale, centre: { x: 214, y: 585 } };
        expect(inside.map(({ x, y }) => pictures.shownAt(view, x, y))).toEqual(inside.map(() => ({ canvas: 'black', webgl: 'black' })));
        expect(faults(pictures.judge(view))).toEqual(CLEAN);
      }
      expect(sweep(pictures)).toEqual(CLEAN);
    } finally {
      pictures.close();
    }
  });

  it('shows nothing along the map\'s edge that the exact black hides, zoomed in ten times', () => {
    // The clipping library cut crossings off to a whole eighth of a pixel, which showed 43 pixels along this edge on Canvas.
    const pictures = seeded(32);
    try {
      expect(faults(pictures.judge({ scale: 10, centre: { x: 1683.84, y: 351.93 } }))).toEqual(CLEAN);
      expect(sweep(pictures)).toEqual(CLEAN);
    } finally {
      pictures.close();
    }
  });

  it('shows nothing where a magical darkness ends on the wall sight ends on', () => {
    // As two fills rounded apart, the map's black and the darkness' let a hairline of the map show here.
    const pictures = seeded(86);
    try {
      expect(faults(pictures.judge({ scale: 8, centre: { x: 61, y: 815 } }))).toEqual(CLEAN);
      expect(sweep(pictures)).toEqual(CLEAN);
    } finally {
      pictures.close();
    }
  });

  it('shows what two, three and four tokens see together, and nothing else', () => {
    // Four tokens around a pillar, each seeing 30 ft: where exactly two saw the floor it was black, where three saw it it showed.
    const pillar = [{ x: 150, y: 150 }, { x: 170, y: 150 }, { x: 170, y: 170 }, { x: 150, y: 170 }];
    const pictures = custom({ width: 320, height: 320 }, {
      tokens: [
        token('zorgash', 100, 110, { enabled: true, range: 30, senses: [{ id: 'darkvision', range: 60 }] }),
        token('gyliam', 220, 110, { enabled: true, range: 30 }),
        token('koss', 110, 220, { enabled: true, range: 30 }),
        token('akhmet', 215, 215, { enabled: true, range: 30 }),
      ],
      walls: pillar.map((corner, i) => wall(`pillar${i}`, corner, pillar[(i + 1) % 4]!)),
    });
    try {
      const whole = { scale: 1, centre: { x: 160, y: 160 } };
      const tallies = pictures.judge(whole);
      expect(faults(tallies)).toEqual(CLEAN);
      // Most of the map is seen by two or more of them, and shows.
      expect(Math.min(tallies.canvas.open, tallies.webgl.open)).toBeGreaterThan(60_000);
      // Beside the pillar all four see the floor; inside it nobody does.
      expect(pictures.shownAt(whole, 140, 160)).toEqual({ canvas: 'floor', webgl: 'floor' });
      expect(pictures.shownAt(whole, 160, 160)).toEqual({ canvas: 'black', webgl: 'black' });
      expect(sweep(pictures)).toEqual(CLEAN);
    } finally {
      pictures.close();
    }
  });

  it('shows the sight of a token that sees 150,000 ft, up to the wall that ends it', () => {
    const pictures = custom({ width: 320, height: 320 }, {
      tokens: [token('scout', 60, 160, { enabled: true, range: 150_000 })],
      walls: [wall('screen', { x: 200, y: 60 }, { x: 200, y: 260 })],
    });
    try {
      const whole = { scale: 1, centre: { x: 160, y: 160 } };
      expect(pictures.shownAt(whole, 150, 160)).toEqual({ canvas: 'floor', webgl: 'floor' });
      expect(pictures.shownAt(whole, 260, 160)).toEqual({ canvas: 'black', webgl: 'black' });
      // Past the wall's upper end.
      expect(pictures.shownAt(whole, 250, 10)).toEqual({ canvas: 'floor', webgl: 'floor' });
      expect(sweep(pictures)).toEqual(CLEAN);
    } finally {
      pictures.close();
    }
  });

  it('is opaque black or nothing, with a texel of black around what is hidden', () => {
    // One token and a slanted wall: no sliver, so every edge of the black is an edge of this sight.
    const pictures = custom({ width: 300, height: 220 }, {
      tokens: [token('scout', 80.3, 150.7, { enabled: true, range: 25 })],
      walls: [wall('screen', { x: 130.4, y: 40.2 }, { x: 171.8, y: 190.6 })],
    });
    try {
      const clean = { canvas: { blended: 0, tight: 0 }, webgl: { blended: 0, tight: 0 } };
      for (const view of [{ scale: 1, centre: { x: 150, y: 110 } }, { scale: MAX_ZOOM, centre: { x: 150, y: 115 } }, { scale: 2.3, centre: { x: 120.7, y: 100.3 } }]) {
        // A black written at half strength, or left as the canvas blended it, shows pixels between the floor and black.
        // A black without the texels around each one shows the floor closer than half a texel to what is hidden.
        expect(pictures.make(view)).toEqual(clean);
        const tallies = pictures.judge(view);
        expect(faults(tallies)).toEqual(CLEAN);
        expect(Math.min(tallies.canvas.open, tallies.webgl.open)).toBeGreaterThan(1_000);
      }
    } finally {
      pictures.close();
    }
  });

  it('is the map\'s black and no larger: no frame around a map smaller than the screen, and none inside its edge', () => {
    // A token that sees all of a map without walls, and one that sees 10 ft of it.
    const all = custom({ width: 320, height: 240 }, { tokens: [token('scout', 100.3, 90.7)] });
    const little = custom({ width: 320, height: 240 }, { tokens: [token('mole', 100.3, 90.7, { enabled: true, range: 10 })] });
    try {
      for (const view of [{ scale: 1, centre: { x: 160, y: 120 } }, { scale: 1.37, centre: { x: 151.3, y: 127.9 } }]) {
        const seen = all.judge(view);
        expect(faults(seen)).toEqual(CLEAN);
        // Every pixel is the floor: nothing black along the map's edge, inside or outside it.
        expect([seen.canvas.open, seen.webgl.open]).toEqual([512 * 512, 512 * 512]);
        const dark = little.judge(view);
        expect(faults(dark)).toEqual(CLEAN);
      }
      // Black to the map's edge, the floor from the first pixel past it.
      const whole = { scale: 1, centre: { x: 160, y: 120 } };
      const black = { canvas: 'black', webgl: 'black' }, floor = { canvas: 'floor', webgl: 'floor' };
      expect([little.shownAt(whole, 0.5, 200.5), little.shownAt(whole, 319.5, 200.5), little.shownAt(whole, 300.5, 0.5), little.shownAt(whole, 300.5, 239.5)]).toEqual([black, black, black, black]);
      expect([little.shownAt(whole, -0.5, 200.5), little.shownAt(whole, 320.5, 200.5), little.shownAt(whole, 300.5, -0.5), little.shownAt(whole, 300.5, 240.5)]).toEqual([floor, floor, floor, floor]);
    } finally {
      all.close();
      little.close();
    }
  });

  it.each([
    { name: 'a map of 2,048 px', size: 2048 },
    { name: 'a map of 8,192 px, four pixels to the texel', size: 8192 },
  ])('leaves an open door of one 70 px cell open, in a slanted wall seen from one side and from both: $name', ({ size }) => {
    const middle = { x: size / 2 + 0.37, y: size / 2 + 0.61 };
    const [ux, uy] = [Math.cos((31 * Math.PI) / 180), Math.sin((31 * Math.PI) / 180)];
    const at = (along: number): Point => ({ x: middle.x + ux * along, y: middle.y + uy * along });
    const walls = [
      wall('left', at(-size * 0.3), at(-35)),
      { ...wall('door', at(-35), at(35)), type: 'door' as const, closed: false },
      wall('right', at(35), at(size * 0.3)),
    ];
    const near = token('near', middle.x - uy * 300 + 40, middle.y + ux * 300);
    const far = token('far', middle.x + uy * 260 - 30, middle.y - ux * 260);
    for (const tokens of [[near], [near, far]]) {
      const pictures = custom({ width: size, height: size }, { tokens, walls });
      try {
        const view = { scale: 1, centre: middle };
        // The middle 40 px of the doorway, on the door's line: the black at the jambs reaches two texels into it at most.
        const doorway = [-20, -10, 0, 10, 20].map((along) => pictures.shownAt(view, at(along).x, at(along).y));
        expect(doorway).toEqual(doorway.map(() => ({ canvas: 'floor', webgl: 'floor' })));
        expect(faults(pictures.judge(view))).toEqual(CLEAN);
        expect(faults(pictures.judge({ scale: MAX_ZOOM, centre: at(35) }))).toEqual(CLEAN);
      } finally {
        pictures.close();
      }
    }
  });

  it(`sweeps seeds 1 to ${SEEDS} and ${SLIVERS.join(', ')}: nothing shows that the exact black hides with a texel to spare, and the black stays within its band`, () => {
    const faulty: string[] = [];
    const seams: string[] = [];
    let looked = 0;
    const seeds = [...Array.from({ length: SEEDS }, (_, index) => index + 1), ...SLIVERS.filter((seed) => seed > SEEDS)];
    for (const seed of seeds) {
      const pictures = seeded(seed);
      try {
        // Seam traces are counted where each pixel is one world pixel: over the whole map at zoom 1.
        const whole = tiles(pictures.bounds).map((view) => pictures.judge(view));
        const close = closeUps(pictures.bounds, pictures.outlines).map((view) => pictures.judge(view));
        looked += whole.length + close.length;
        const sum = sumOf([...whole, ...close]);
        if (JSON.stringify(sum) !== JSON.stringify(CLEAN)) faulty.push(`${seed}: ${JSON.stringify(sum)}`);
        const traced = whole.reduce((pixels, tallies) => pixels + tallies.webgl.seam, 0);
        if (traced > 0) seams.push(`${seed}: ${traced}`);
      } finally {
        pictures.close();
      }
    }
    // `VITE_FALLBACK_REPORT=1` fails the sweep with what it measured, which is how its numbers are read.
    if (import.meta.env.VITE_FALLBACK_REPORT) throw new Error(`fallback sweep of ${seeds.length} seeds, ${looked} views: faulty [${faulty.join(', ')}]; seam traces in ${seams.length} scenes, px² at zoom 1: ${seams.join(', ')}`);
    expect(faulty).toEqual([]);
    expect(looked).toBeGreaterThan(seeds.length * 10);
  });
});
