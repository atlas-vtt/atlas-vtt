import { autoDetectRenderer, Container, type Graphics, type GraphicsPath, type Renderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { CanvasLightingFallback, type CanvasLightingDeps } from '../../src/app/pixi/lighting/CanvasLightingFallback';
import { maskTexel } from '../../src/app/pixi/lighting/SightMask';
import { showsMap } from '../../src/app/gameSystems/senseRules';
import type { Point } from '../../src/app/types/visionTypes';
import type { MapBounds } from '../../src/app/vision/visibility';
import { CanvasLightingFallback as ExactFallback } from '../oracles/sightPolicyBaseline/CanvasLightingFallback';
import { darknessCovers, darknessOf } from './darknessCover';

const VIEW = 512;
const FLOOR = 0x8899aa;
/** The map view's zoom ends here (`clampZoom` in `PixiAppManager`). */
export const MAX_ZOOM = 5;
/**
 * Texels within which something exactly black lies around every black point: a texel is black
 * when it or one of the eight around it is not erased completely, so a point at the far side
 * of its own texel is up to three texels from what made it black.
 */
const BAND = 3;
/**
 * Where around a pixel's middle the exact black must be for the pixel to count as leaked, in
 * texels: the middle with a texel to spare on every side, which is what the mask promises.
 */
const SPARE = [[0, 0], [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
export const KINDS = ['canvas', 'webgl'] as const;
export type Kind = (typeof KINDS)[number];

/** A camera: screen pixels per world pixel, and the world point in the middle of the screen. */
export interface View {
  scale: number;
  centre: Point;
}

/** What a picture shows against the exact black, which is the previous version's drawing read as it was meant. */
interface Tally {
  /** Pixels that are anything but black although the exact black holds their middle with a texel to spare around it. */
  leaked: number;
  /**
   * Black pixels of the map that are exactly open, with no outline of a polygon and no edge of
   * the map within the band, and a pixel, of them: black without a cause.
   */
  lost: number;
  /**
   * Black pixels of the map that are exactly open, away from what is exactly black, with an
   * outline within the band: where two sight polygons end on one line from either side, as at
   * a wall both sides of which are seen, the canvas leaves a trace of black between them.
   */
  seam: number;
  /** Black pixels whose middle lies beyond the map's edge: the black is the map's and no larger. */
  beyond: number;
  /** Pixels that show the floor. */
  open: number;
}

export type Tallies = Record<Kind, Tally>;

/** A shape of the previous version's drawing: a polygon by its corners (`points`), or the map's rectangle. */
interface Primitive {
  x: number;
  y: number;
  width: number;
  height: number;
  points?: number[];
}

function originOf({ scale, centre }: View): Point {
  return { x: VIEW / 2 - centre.x * scale, y: VIEW / 2 - centre.y * scale };
}

function trace(context: OffscreenCanvasRenderingContext2D, path: GraphicsPath): void {
  for (const { shape } of path.shapePath.shapePrimitives) {
    const { x, y, width, height, points } = shape as unknown as Primitive;
    context.beginPath();
    if (!points) context.rect(x, y, width, height);
    else for (let i = 0; i < points.length; i += 2) context.lineTo(points[i]!, points[i + 1]!);
    context.closePath();
    context.fill();
  }
}

/**
 * About how much of each pixel the exact black covers through a camera. Only a first look: a
 * pixel worth asking the polygons about is found by it, never judged. Fills are added up, so
 * two that meet on a line leave no seam.
 */
function exactCoverage(drawing: Graphics, view: View): Uint8ClampedArray {
  const whole = new OffscreenCanvas(VIEW, VIEW).getContext('2d')!;
  whole.globalCompositeOperation = 'lighter';
  const origin = originOf(view);
  for (const instruction of drawing.context.instructions) {
    if (instruction.action !== 'fill') continue;
    const part = new OffscreenCanvas(VIEW, VIEW).getContext('2d')!;
    part.setTransform(view.scale, 0, 0, view.scale, origin.x, origin.y);
    trace(part, instruction.data.path);
    part.globalCompositeOperation = 'destination-out';
    if (instruction.data.hole) trace(part, instruction.data.hole);
    whole.drawImage(part.canvas, 0, 0);
  }
  return whole.getImageData(0, 0, VIEW, VIEW).data.filter((_, index) => index % 4 === 3);
}

/** Every edge of every polygon the previous version filled or cut: the outlines of what is shown and of each darkness. */
function outlineEdges(drawing: Graphics): [number, number, number, number][] {
  const edges: [number, number, number, number][] = [];
  for (const instruction of drawing.context.instructions) {
    if (instruction.action !== 'fill') continue;
    for (const path of [instruction.data.path, instruction.data.hole]) {
      for (const { shape } of path?.shapePath.shapePrimitives ?? []) {
        const { x, y, width, height, points: corners } = shape as unknown as Primitive;
        // The map itself is a rectangle.
        const points = corners ?? [x, y, x + width, y, x + width, y + height, x, y + height];
        for (let i = 0; i < points.length; i += 2) {
          const next = (i + 2) % points.length;
          edges.push([points[i]!, points[i + 1]!, points[next]!, points[next + 1]!]);
        }
      }
    }
  }
  return edges;
}

/** Both renderers, made once for a test file. */
export async function startRenderers(): Promise<{ renderers: Record<Kind, Renderer>; stop: () => void }> {
  const made = await Promise.all(KINDS.map((preference) => autoDetectRenderer({ preference, width: VIEW, height: VIEW, antialias: false, backgroundAlpha: 1, backgroundColor: FLOOR })));
  made.forEach((renderer, index) => {
    if (renderer.name !== KINDS[index]) throw new Error(`PIXI started its ${renderer.name} renderer where ${KINDS[index]} was asked for`);
  });
  return { renderers: { canvas: made[0]!, webgl: made[1]! }, stop: () => made.forEach((renderer) => renderer.destroy()) };
}

/** A scene through the line-of-sight fallback on both renderers, and through the previous version's drawing. */
export interface Pictures {
  bounds: MapBounds;
  /** Where the black has edges worth zooming in on: the tokens that see, corners of what they see, the darknesses. */
  outlines: Point[];
  judge: (view: View) => Tallies;
  /**
   * The black's own make, in a view: `blended` counts pixels that are neither the floor nor
   * black, which a black that is not opaque or not hardened gives; `tight` counts pixels that
   * show the floor with something exactly black within half a texel, which a black hardened
   * without the texels around each one gives. Only for scenes without a hidden sliver, and
   * only pixels a pixel or more inside the map: one on its edge is part map, part not.
   */
  make: (view: View) => Record<Kind, { blended: number; tight: number }>;
  /** Whether the exact black holds a world point. */
  exactlyBlack: (x: number, y: number) => boolean;
  /** What each renderer shows at a world point through a camera: 'black', 'floor' or 'other'. */
  shownAt: (view: View, x: number, y: number) => Record<Kind, string>;
  close: () => void;
}

type SceneDeps = Pick<CanvasLightingDeps, 'store' | 'measurement' | 'rules'> & { bounds: MapBounds };

export function openPictures(renderers: Record<Kind, Renderer>, { bounds, ...deps }: SceneDeps): Pictures {
  const all = { ...deps, bounds: () => bounds };
  const exactViewport = new Container();
  const exact = new ExactFallback({ viewport: exactViewport as unknown as Viewport, ...all });
  // A stage of its own for each renderer: a display object is built for the renderer that drew it first.
  const shown = KINDS.map((kind) => {
    const stage = new Container();
    const viewport = new Container();
    stage.addChild(viewport);
    const fallback = new CanvasLightingFallback({ viewport: viewport as unknown as Viewport, ...all });
    fallback.modeLayer.visible = true;
    return { kind, stage, viewport, fallback };
  });
  const texel = maskTexel(bounds.width, bounds.height);
  const exactDrawing = darknessOf(exactViewport);
  const exactlyBlack = (x: number, y: number): boolean => darknessCovers(exactDrawing, x, y);
  const edges = outlineEdges(exactDrawing);
  const outlineWithin = ({ x, y }: Point, reach: number): boolean => edges.some(([ax, ay, bx, by]) => {
    const [dx, dy] = [bx - ax, by - ay];
    const along = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - ax - along * dx, y - ay - along * dy) <= reach;
  });
  const pixelsOf = (kind: Kind, view: View): Uint8ClampedArray => {
    const { stage, viewport } = shown.find((entry) => entry.kind === kind)!;
    const origin = originOf(view);
    viewport.scale.set(view.scale);
    viewport.position.set(origin.x, origin.y);
    renderers[kind].render({ container: stage });
    const context = new OffscreenCanvas(VIEW, VIEW).getContext('2d')!;
    context.drawImage(renderers[kind].canvas as HTMLCanvasElement, 0, 0);
    return context.getImageData(0, 0, VIEW, VIEW).data;
  };
  const colourAt = (pixels: Uint8ClampedArray, x: number, y: number): number => {
    const i = (y * VIEW + x) * 4;
    return (pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!;
  };

  const judge = (view: View): Tallies => {
    const coverage = exactCoverage(exactDrawing, view);
    const origin = originOf(view);
    const world = (x: number, y: number): Point => ({ x: (x - origin.x) / view.scale, y: (y - origin.y) / view.scale });
    const onMap = ({ x, y }: Point): boolean => x > 0 && y > 0 && x < bounds.width && y < bounds.height;
    const band = BAND * texel * view.scale + 1;
    /** A texel in pixels of this view. */
    const spare = texel * view.scale;
    /** A first look: no pixel around is covered by more than a seam's worth. */
    const mostlyOpenAround = (x: number, y: number): boolean => {
      const reach = Math.ceil(band);
      for (let dy = -reach; dy <= reach; dy += reach) {
        for (let dx = -reach; dx <= reach; dx += reach) {
          const [px, py] = [x + dx, y + dy];
          if (px < 0 || py < 0 || px >= VIEW || py >= VIEW || coverage[py * VIEW + px]! > 96) return false;
        }
      }
      return coverage[y * VIEW + x]! <= 96;
    };
    // Beyond the map's edge nothing is black, where the previous version painted a darkness that spilled over it.
    const blackOnMap = (point: Point): boolean => onMap(point) && exactlyBlack(point.x, point.y);
    const tallies: Tallies = { canvas: { leaked: 0, lost: 0, seam: 0, beyond: 0, open: 0 }, webgl: { leaked: 0, lost: 0, seam: 0, beyond: 0, open: 0 } };
    for (const kind of KINDS) {
      const pixels = pixelsOf(kind, view);
      const tally = tallies[kind];
      for (let y = 0; y < VIEW; y++) {
        for (let x = 0; x < VIEW; x++) {
          const colour = colourAt(pixels, x, y);
          if (colour === FLOOR) tally.open++;
          if (colour !== 0) {
            // Anything but black, the floor or the floor dimmed, where the exact black holds the pixel's middle and a texel around it.
            if (coverage[y * VIEW + x]! > 0 && SPARE.every(([dx, dy]) => blackOnMap(world(x + 0.5 + dx! * spare, y + 0.5 + dy! * spare)))) tally.leaked++;
          } else if (!onMap(world(x + 0.5, y + 0.5))) {
            tally.beyond++;
          } else if (mostlyOpenAround(x, y)) {
            // The exact black changes only across an outline: with none within the band, what holds at the middle holds all around.
            const middle = world(x + 0.5, y + 0.5);
            if (!onMap(middle) || exactlyBlack(middle.x, middle.y)) continue;
            if (outlineWithin(middle, band / view.scale)) tally.seam++;
            else tally.lost++;
          }
        }
      }
    }
    return tallies;
  };

  const HALF = [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
  const make = (view: View): Record<Kind, { blended: number; tight: number }> => {
    const origin = originOf(view);
    const hiddenAt = (wx: number, wy: number): boolean => wx > 0 && wy > 0 && wx < bounds.width && wy < bounds.height && exactlyBlack(wx, wy);
    const found = { canvas: { blended: 0, tight: 0 }, webgl: { blended: 0, tight: 0 } };
    for (const kind of KINDS) {
      const pixels = pixelsOf(kind, view);
      for (let i = 0; i < VIEW * VIEW; i++) {
        const [x, y] = [i % VIEW, Math.floor(i / VIEW)];
        const [wx, wy, edge] = [(x + 0.5 - origin.x) / view.scale, (y + 0.5 - origin.y) / view.scale, 1 / view.scale];
        if (wx < edge || wy < edge || wx > bounds.width - edge || wy > bounds.height - edge) continue;
        const colour = colourAt(pixels, x, y);
        if (colour !== 0 && colour !== FLOOR) found[kind].blended++;
        else if (colour === FLOOR && HALF.some(([dx, dy]) => hiddenAt(wx + dx! * texel, wy + dy! * texel))) found[kind].tight++;
      }
    }
    return found;
  };

  const seeing = shown[0]!.fallback.currentSight().regions.filter((region) => showsMap(region.sense) && region.polygon);
  const everyNth = (polygon: readonly Point[], count: number): Point[] => polygon.filter((_, index) => index % Math.max(1, Math.floor(polygon.length / count)) === 0).slice(0, count);
  return {
    bounds,
    outlines: [
      ...seeing.flatMap((region) => [region.origin, ...everyNth(region.polygon!, 3)]),
      ...shown[0]!.fallback.lightReaches().flatMap((reach) => [reach.origin, ...everyNth(reach.polygon, 4)]),
    ],
    judge,
    make,
    exactlyBlack,
    shownAt: (view, x, y) => {
      const origin = originOf(view);
      const [px, py] = [Math.floor(x * view.scale + origin.x), Math.floor(y * view.scale + origin.y)];
      const name = (colour: number): string => (colour === 0 ? 'black' : colour === FLOOR ? 'floor' : 'other');
      return { canvas: name(colourAt(pixelsOf('canvas', view), px, py)), webgl: name(colourAt(pixelsOf('webgl', view), px, py)) };
    },
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

/** Cameras at zoom 1 that between them show the whole map. */
export function tiles({ width, height }: MapBounds): View[] {
  const views: View[] = [];
  for (let y = VIEW / 2; y < height + VIEW / 2; y += VIEW) {
    for (let x = VIEW / 2; x < width + VIEW / 2; x += VIEW) views.push({ scale: 1, centre: { x, y } });
  }
  return views;
}

/** Cameras at the map's maximum zoom on the corners and edges of the map and on the places given. */
export function closeUps({ width, height }: MapBounds, places: readonly Point[], most = 40): View[] {
  const border = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]].map(([fx, fy]) => ({ x: fx! * width, y: fy! * height }));
  const spread = places.filter((_, index) => index % Math.max(1, Math.ceil(places.length / (most - border.length))) === 0);
  return [...border, ...spread].map((centre) => ({ scale: MAX_ZOOM, centre }));
}
