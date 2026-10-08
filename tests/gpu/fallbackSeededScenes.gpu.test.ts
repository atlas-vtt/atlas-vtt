/// <reference types="vite/client" />
import '../setup/obsidianDom';
import { autoDetectRenderer, Container, type Graphics, type GraphicsPath, type Renderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { CanvasLightingFallback } from '../../src/app/pixi/lighting/CanvasLightingFallback';
import type { Point } from '../../src/app/types/visionTypes';
import { CanvasLightingFallback as ExactFallback } from '../oracles/sightPolicyBaseline/CanvasLightingFallback';
import { darknessCovers, darknessOf } from '../helpers/darknessCover';
import { sightScene, type SightScene } from '../helpers/sightScenes';

const VIEW = 512;
const FLOOR = 0x8899aa;
const ZOOM = 8;
/** World pixels within which the current black may lie past the exact one without counting as lost floor: its margin and the rounding it stands in for. */
const REACH = 1;
/** Coverage from which a pixel is worth asking the polygons about. */
const SOLID = 128;
/** Where around a pixel's middle the exact black is asked for, in pixels: nothing a quarter pixel wide slips between. */
const SPARE = Array.from({ length: 9 }, (_, index) => (index - 4) / 4);
/** Seeds 1 to this many are swept as well, with every darkness outline zoomed in on: `VITE_FALLBACK_SEEDS=3000`. */
const SWEEP = Number(import.meta.env.VITE_FALLBACK_SEEDS) || 0;

/** A camera: world pixels per screen pixel inverted, and the world point in the middle of the screen. */
interface View {
  scale: number;
  centre: Point;
}

/** What a picture shows against the black the previous version meant to draw, which is exact. */
interface Tally {
  /** Pixels that are not black where the exact black has a pixel to spare on every side. */
  leaked: number;
  /** Pixels of the map that are not the floor, farther than the black's margin from anything exactly black. */
  lost: number;
}

/** Where a camera puts the world's origin on the screen. */
function originOf({ scale, centre }: View): Point {
  return { x: VIEW / 2 - centre.x * scale, y: VIEW / 2 - centre.y * scale };
}

/** Screen pixels as the world px² a camera shows in them. */
function worldArea(pixels: number, { scale }: View): number {
  return pixels / (scale * scale);
}

function place(viewport: Container, view: View): void {
  const origin = originOf(view);
  viewport.scale.set(view.scale);
  viewport.position.set(origin.x, origin.y);
}

function trace(context: OffscreenCanvasRenderingContext2D, path: GraphicsPath): void {
  for (const { shape } of path.shapePath.shapePrimitives) {
    const { x, y, width, height, points } = shape as unknown as { x: number; y: number; width: number; height: number; points?: number[] };
    context.beginPath();
    if (!points) context.rect(x, y, width, height);
    else for (let i = 0; i < points.length; i += 2) context.lineTo(points[i]!, points[i + 1]!);
    context.closePath();
    context.fill();
  }
}

/**
 * About how much of each pixel the exact black covers through a camera: every fill of the
 * previous version's drawing without the union of its holes, which is what that drawing meant
 * and no renderer drew. Its polygons are the sweep's own, never rounded. Fills are added up, so
 * two that meet on a line leave no seam; 255 or 0 all around a pixel is safely inside or outside.
 */
function exactCoverage(drawing: Graphics, view: View): Uint8ClampedArray {
  const origin = originOf(view);
  const whole = new OffscreenCanvas(VIEW, VIEW).getContext('2d')!;
  whole.globalCompositeOperation = 'lighter';
  for (const instruction of drawing.context.instructions) {
    if (instruction.action !== 'fill') continue;
    const part = new OffscreenCanvas(VIEW, VIEW).getContext('2d')!;
    part.setTransform(view.scale, 0, 0, view.scale, origin.x, origin.y);
    trace(part, instruction.data.path);
    part.globalCompositeOperation = 'destination-out';
    if (instruction.data.hole) trace(part, instruction.data.hole);
    whole.drawImage(part.canvas, 0, 0);
  }
  const pixels = whole.getImageData(0, 0, VIEW, VIEW).data;
  return pixels.filter((_, index) => index % 4 === 3);
}

/** Whether every pixel within `radius` of (x, y) has this coverage. */
function allAround(coverage: Uint8ClampedArray, x: number, y: number, radius: number, value: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) if (coverage[(y + dy) * VIEW + x + dx] !== value) return false;
  }
  return true;
}

function storeOf(scene: SightScene, name: string): ViewAtlasStore {
  const store = createViewAtlasStore(createInMemoryApp().app, name);
  const { state } = scene;
  store.setState({ persistenceEnabled: false, grid: state.grid, lighting: state.lighting, heldTokens: state.heldTokens, objects: { ...store.getState().objects, ...state.objects } });
  return store;
}

describe('the line-of-sight fallback against the exact black, on seeded scenes', { timeout: 3_600_000 }, () => {
  const renderers: Record<'canvas' | 'webgl', Renderer | null> = { canvas: null, webgl: null };
  beforeAll(async () => {
    for (const preference of ['canvas', 'webgl'] as const) {
      renderers[preference] = await autoDetectRenderer({ preference, width: VIEW, height: VIEW, antialias: false, backgroundAlpha: 1, backgroundColor: FLOOR });
      expect(renderers[preference]!.name).toBe(preference);
    }
  });
  afterAll(() => {
    renderers.canvas?.destroy();
    renderers.webgl?.destroy();
  });

  /** A seeded scene through both renderers and through the previous version's drawing. */
  function open(seed: number): { scene: SightScene; darkOutlines: Point[]; judge: (view: View) => Record<'canvas' | 'webgl', Tally>; close: () => void } {
    const scene = sightScene(seed);
    const store = storeOf(scene, `fallback-seeded-${seed}`);
    const deps = { store, measurement: scene.measurement, bounds: () => scene.bounds, rules: () => scene.rules };
    const exactViewport = new Container();
    const exact = new ExactFallback({ viewport: exactViewport as unknown as Viewport, ...deps });
    // A stage of its own for each renderer: a display object is built for the renderer that drew it first.
    const shown = (['canvas', 'webgl'] as const).map((preference) => {
      const stage = new Container();
      const viewport = new Container();
      stage.addChild(viewport);
      const fallback = new CanvasLightingFallback({ viewport: viewport as unknown as Viewport, ...deps });
      fallback.modeLayer.visible = true;
      return { preference, stage, viewport, fallback };
    });
    const judge = (view: View): Record<'canvas' | 'webgl', Tally> => {
      const exactDrawing = darknessOf(exactViewport);
      const black = exactCoverage(exactDrawing, view);
      const origin = originOf(view);
      // The world point in the middle of a screen pixel.
      const world = (x: number, y: number): [number, number] => [(x + 0.5 - origin.x) / view.scale, (y + 0.5 - origin.y) / view.scale];
      // The exact black has a pixel to spare on every side: asked of the polygons themselves, every quarter pixel from the middle of the one before to the middle of the one after.
      const spare = (x: number, y: number): boolean => SPARE.every((dy) => SPARE.every((dx) => darknessCovers(exactDrawing, ...world(x + dx, y + dy))));
      const far = Math.ceil(REACH * view.scale) + 2;
      // Beyond the map nothing is lost: a darkness that spills over its edge is black there with its margin, around what sees into it.
      const onMap = (x: number, y: number): boolean => {
        const [wx, wy] = world(x, y);
        return wx > 0 && wy > 0 && wx < scene.bounds.width && wy < scene.bounds.height;
      };
      const tallies = { canvas: { leaked: 0, lost: 0 }, webgl: { leaked: 0, lost: 0 } };
      for (const { preference, stage, viewport } of shown) {
        const renderer = renderers[preference]!;
        place(viewport, view);
        renderer.render({ container: stage });
        const context = new OffscreenCanvas(VIEW, VIEW).getContext('2d')!;
        context.drawImage(renderer.canvas as HTMLCanvasElement, 0, 0);
        const pixels = context.getImageData(0, 0, VIEW, VIEW).data;
        for (let y = far; y < VIEW - far; y++) {
          for (let x = far; x < VIEW - far; x++) {
            const i = (y * VIEW + x) * 4;
            const colour = (pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!;
            if (colour !== 0 && black[y * VIEW + x]! >= SOLID && spare(x, y)) tallies[preference].leaked++;
            else if (colour !== FLOOR && black[y * VIEW + x] === 0 && onMap(x, y) && allAround(black, x, y, far, 0)) tallies[preference].lost++;
          }
        }
      }
      return tallies;
    };
    return {
      scene,
      // Where shared outlines lie: a darkness ends on the walls sight ends on, and on other darknesses.
      darkOutlines: shown[0]!.fallback.lightReaches().flatMap((reach) => [reach.origin, ...reach.polygon.filter((_, index) => index % Math.max(1, Math.floor(reach.polygon.length / 6)) === 0)]),
      judge,
      close: () => {
        for (const { stage, fallback } of shown) {
          fallback.destroy();
          stage.destroy({ children: true });
        }
        exact.destroy();
        exactViewport.destroy({ children: true });
      },
    };
  }

  function whole(scene: SightScene): View {
    return { scale: VIEW / Math.max(scene.bounds.width, scene.bounds.height), centre: { x: scene.bounds.width / 2, y: scene.bounds.height / 2 } };
  }

  it('shows nothing the exact black hides where a magical darkness ends on the wall sight ends on, zoomed in', () => {
    // While the map's black and the darkness' were two fills rounded apart, this view showed the map along the wall: 150 pixels on WebGL, 397 on Canvas.
    const { judge, close } = open(86);
    try {
      const { canvas, webgl } = judge({ scale: ZOOM, centre: { x: 61, y: 815 } });
      expect({ canvas: canvas.leaked, webgl: webgl.leaked }).toEqual({ canvas: 0, webgl: 0 });
    } finally {
      close();
    }
  });

  // Seeds that showed the map where it must be black before the black was one shape with a margin, and some that never did.
  it.each([86, 156, 166, 286, 476, 355, 893, 1212, 1941, 2920, 7, 307, 922, 1118, 2270])('seed %i: nothing shows that the exact black hides, on either renderer, whole and at every darkness outline', (seed) => {
    const { scene, darkOutlines, judge, close } = open(seed);
    try {
      const views = [whole(scene), ...darkOutlines.map((centre) => ({ scale: ZOOM, centre }))];
      const leaked = views.map((view) => judge(view)).map(({ canvas, webgl }) => canvas.leaked + webgl.leaked);
      expect(leaked).toEqual(views.map(() => 0));
    } finally {
      close();
    }
  });

  /**
   * What the black hides of the map beyond its margin, in world px² of the pixels it touches.
   * Two sight polygons that end on one wall from either side are rounded apart, and each keeps
   * its margin: a black line of up to three quarters of a pixel along that wall. PIXI's WebGL
   * renderer can besides lose a hole of an area whose outline comes back crossing itself. Over
   * seeds 1 to 3,000 Canvas loses at most 1,390 px² and WebGL 443 px², both in seed 2133.
   * Measured on Metal; the bounds leave room for another rasteriser.
   */
  it.each([
    { seed: 2133, canvas: 2_100, webgl: 700 },
    { seed: 2270, canvas: 1_600, webgl: 400 },
    { seed: 1118, canvas: 600, webgl: 150 },
    { seed: 86, canvas: 50, webgl: 50 },
  ])('seed $seed: of the map, Canvas hides at most $canvas px² beyond the margin and WebGL $webgl px²', ({ seed, canvas, webgl }) => {
    const { scene, judge, close } = open(seed);
    try {
      const view = whole(scene);
      const lost = judge(view);
      expect(worldArea(lost.canvas.lost, view)).toBeLessThanOrEqual(canvas);
      expect(worldArea(lost.webgl.lost, view)).toBeLessThanOrEqual(webgl);
    } finally {
      close();
    }
  });

  it.runIf(SWEEP > 0)(`sweep of seeds 1 to ${SWEEP}: nothing shows that the exact black hides`, () => {
    const leaking: string[] = [];
    const losing: string[] = [];
    for (let seed = 1; seed <= SWEEP; seed++) {
      const { scene, darkOutlines, judge, close } = open(seed);
      try {
        const fit = whole(scene);
        const views = [fit, ...darkOutlines.map((centre) => ({ scale: ZOOM, centre }))];
        const tallies = views.map((view) => judge(view));
        const leaked = tallies.reduce((sum, { canvas, webgl }) => sum + canvas.leaked + webgl.leaked, 0);
        if (leaked > 0) leaking.push(`${seed}: ${leaked}`);
        const { canvas, webgl } = tallies[0]!;
        if (canvas.lost > 0) losing.push(`${seed}: Canvas ${Math.round(worldArea(canvas.lost, fit))} px²`);
        if (webgl.lost > 0) losing.push(`${seed}: WebGL ${Math.round(worldArea(webgl.lost, fit))} px²`);
      } finally {
        close();
      }
    }
    // `VITE_FALLBACK_REPORT=1` fails the sweep with what it measured, which is how its numbers are read.
    if (import.meta.env.VITE_FALLBACK_REPORT) throw new Error(`fallback sweep of ${SWEEP} seeds: leaking [${leaking.join(', ')}]; losing floor beyond the margin in ${losing.length}: ${losing.join(', ')}`);
    expect(leaking).toEqual([]);
  });
});
