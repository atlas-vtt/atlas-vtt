import { glyphEdges, glyphTone } from '../../art/glyphLight';
import { glyphPainterOf } from '../../../style';
import type { Hand, Material } from '../../art/hand';
import { polyPath, type PathFn } from '../../art/paths';
import { fineLines, inkDot, type GlyphPen } from '../../glyphPen';
import { mixColours } from '../../palette';
import { isDarkColour } from '../../stone/colours';
import type { Bounds, Vec } from '../../geometry';
import { partPath, partPoly, type Part } from './shapes';

type Paint = ReturnType<GlyphPen['paint']>;
// A hand owns one immutable look palette. Reuse its material mixes across parts
// and repeated glyphs; the weak key releases them with the rendered scene.
const paints = new WeakMap<Hand, Partial<Record<Material, Paint>>>();

/** Masonry a look draws towards its light ink on a dark floor, so a fireplace stands pale there as calcite does. */
const PALE_ON_DARK: ReadonlySet<Material> = new Set(['dressed', 'stone']);

function materialPaint(pen: GlyphPen, material: Material): Paint {
  let colours = paints.get(pen.hand);
  if (!colours) {
    colours = {};
    paints.set(pen.hand, colours);
  }
  return colours[material] ??= paleOnDark(pen, material, pen.paint(material));
}

function paleOnDark(pen: GlyphPen, material: Material, paint: Paint): Paint {
  const { env } = pen.hand.scene;
  const dark = env.style.direction === 'stone' && !env.view.monochrome && isDarkColour(pen.paint('floor').fill);
  return dark && PALE_ON_DARK.has(material) ? { fill: mixColours(paint.fill, env.palette.ink, 0.24), ink: paint.ink } : paint;
}

/** A part always uses its own material's ink, including in the dark looks. */
export function surface(pen: GlyphPen, path: PathFn, material: Material, texture = false, outlined = true): void {
  const paint = materialPaint(pen, material);
  const ink = pen.ctx.strokeStyle;
  pen.ctx.beginPath();
  path(pen.ctx);
  pen.ctx.fillStyle = paint.fill;
  pen.ctx.strokeStyle = paint.ink;
  pen.ctx.fill();
  if (outlined) pen.ctx.stroke();
  if (texture) pen.hand.grain(path, material);
  pen.ctx.strokeStyle = ink;
}

export function part(pen: GlyphPen, b: Part, material: Material, raised = true): void {
  surface(pen, partPath(b), material, false, !raised);
  if (raised) glyphEdges(pen, partPoly(b), true);
}

/** Bounded depth: darkening ash in Stone, cross-cut lines in Engraved, and a vector lip in SVG. */
export function recess(pen: GlyphPen, b: Part, painted: boolean): void {
  const box = { minX: b.x - b.w / 2, minY: b.y - b.h / 2, maxX: b.x + b.w / 2, maxY: b.y + b.h / 2 };
  sunk(pen, partPath(b), partPoly(b), box, y => 0.25 + 0.43 * (y - b.y + b.h / 2) / b.h, painted);
}

/**
 * A recess of any outline within `box`, darkening towards +y (into the wall): Stone washes it from
 * top to bottom, Engraved tones it by `depth`, from 0.25 at its top to 0.68 at its bottom.
 */
export function sunk(pen: GlyphPen, path: PathFn, poly: readonly Vec[], box: Bounds, depth: (y: number) => number, painted: boolean): void {
  surface(pen, path, 'stone');
  if (painted) {
    // The depth field is linear: paint its black alpha ramp directly, avoiding a
    // raster layer per basin. Like Stone's tone, this wash is raster-only.
    if (pen.hand.scene.raster) {
      const { ctx } = pen;
      ctx.save();
      const wash = ctx.createLinearGradient(0, box.minY, 0, box.maxY);
      wash.addColorStop(0, 'rgba(0, 0, 0, 0.25)');
      wash.addColorStop(1, 'rgba(0, 0, 0, 0.68)');
      ctx.beginPath();
      path(ctx);
      ctx.fillStyle = wash;
      ctx.fill();
      ctx.restore();
    }
  } else {
    glyphTone(pen, (_x, y) => depth(y), box, path, 'depth');
  }
  glyphEdges(pen, poly, false);
}

/** Two split logs lie low in the firebox; irregular pale ash remains visible between them. */
export function coldFuel(pen: GlyphPen, b: Part): void {
  const at = (x: number, y: number): Vec => inBox(b, x, y);
  surface(pen, polyPath([at(-0.39, -0.31), at(-0.12, -0.4), at(0.05, -0.34), at(0.37, -0.36), at(0.4, 0.16), at(0.15, 0.25), at(-0.32, 0.15)]), 'dressed');
  // Stone's final silhouette grain covers the fuel too; Engraved needs the wood cuts here.
  surface(pen, logsIn(b).logs, 'wood', glyphPainterOf(pen.hand.scene.env.style.direction) === 'engraved');
  fineLines(pen, logGrain(b));
  for (const [x, y] of ASH_DOTS) {
    const p = at(x, y);
    inkDot(pen, p.x, p.y, 0.012);
  }
}

/** The two logs' rows across a firebox, as shares of its depth. */
const LOG_ROWS = [-0.16, 0.14] as const;
/** Crumbs on the ash between the logs, as shares of the firebox. */
export const ASH_DOTS: readonly (readonly [number, number])[] = [[-0.35, 0.3], [0.29, -0.3], [0.1, 0.31]];

/** A point of a firebox `b` given as shares of its width and depth. */
export function inBox(b: Part, x: number, y: number): Vec {
  return { x: b.x + x * b.w, y: b.y + y * b.h };
}

/** A split log lying across firebox `b` in the row `y`. */
function logOutline(b: Part, y: number): Vec[] {
  return [inBox(b, -0.32, y - 0.08), inBox(b, 0.27, y - 0.02), inBox(b, 0.32, y + 0.1), inBox(b, -0.27, y + 0.08)];
}

/** The split along each log, as x0, y0, x1, y1 quadruples. */
function logGrain(b: Part): number[] {
  return LOG_ROWS.flatMap(y => {
    const a = inBox(b, -0.22, y - 0.01);
    const z = inBox(b, 0.21, y + 0.04);
    return [a.x, a.y, z.x, z.y];
  });
}

/** The logs of a firebox `b` as one path, and the splits along them, where a lit fire glows through. */
export function logsIn(b: Part): { logs: PathFn; splits: number[] } {
  const outlines = LOG_ROWS.map(y => polyPath(logOutline(b, y)));
  return { logs: path => { for (const log of outlines) log(path); }, splits: logGrain(b) };
}
