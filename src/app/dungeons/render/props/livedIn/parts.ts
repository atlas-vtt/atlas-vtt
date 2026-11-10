import { lightInGlyph } from '../../art/glyphLight';
import type { Hand, Material } from '../../art/hand';
import { runsPath, type PathFn } from '../../art/paths';
import type { Vec } from '../../geometry';
import { strokeFine, type GlyphPen } from '../../glyphPen';
import { mixColours, withAlpha } from '../../palette';
import { isDarkColour } from '../../stone/colours';

/**
 * The few strokes a fire pit is made of. Each pass fills or strokes many parts at once, since it is
 * many small things (stones, sticks, crumbs) and every canvas call counts.
 */

type Paint = ReturnType<GlyphPen['paint']>;
// A hand owns one immutable look palette, so its material mixes are kept for every glyph it draws.
const paints = new WeakMap<Hand, Partial<Record<Material, Paint>>>();

/**
 * A material's fill and ink. On a dark floor (night, volcanic) the ink is taken a little further
 * towards black, as a deep shade of a fill that sits close to the floor would otherwise blur into it.
 */
export function colours(pen: GlyphPen, material: Material): Paint {
  let cache = paints.get(pen.hand);
  if (!cache) { cache = {}; paints.set(pen.hand, cache); }
  return cache[material] ??= deepened(pen, pen.paint(material));
}

function deepened(pen: GlyphPen, paint: Paint): Paint {
  const floor = pen.paint('floor').fill;
  return isPainted(pen) && isDarkColour(floor) && !pen.hand.scene.env.view.monochrome ? { fill: paint.fill, ink: mixColours(paint.ink, '#000000', 0.3) } : paint;
}

/** Stone & shadow fills with colour; Engraved leaves the paper and cuts the material in lines. */
export function isPainted(pen: GlyphPen): boolean {
  return pen.hand.scene.env.style.direction === 'stone';
}

/** Whether the look's floor is dark (night, volcanic), where pale things are lit and cloth sinks. */
export function onDarkFloor(pen: GlyphPen): boolean {
  return isDarkColour(pen.paint('floor').fill);
}

/**
 * The line Stone & shadow draws round a raised edge on a dark floor: the look's light ink, a little
 * towards the floor, as a deep shade of a fill close to the floor would sink into it.
 */
export function darkFloorLine(pen: GlyphPen): string {
  return mixColours(pen.hand.scene.env.palette.ink, pen.paint('floor').fill, 0.3);
}

/**
 * Fills `path` with `material` (or `fill`), outlined in that material's ink unless `outlined` is
 * false; `texture` lays the material's grain over it (Engraved's line texture, Stone's tile).
 */
export function surface(pen: GlyphPen, path: PathFn, material: Material, texture = false, outlined = true, fill?: string, line?: string): void {
  const paint = colours(pen, material);
  const { ctx } = pen;
  const ink = ctx.strokeStyle;
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = fill ?? paint.fill;
  ctx.strokeStyle = line ?? paint.ink;
  ctx.fill();
  if (outlined) ctx.stroke();
  if (texture) pen.hand.grain(path, material);
  ctx.strokeStyle = ink;
}

/** Strokes `path` at the fine weight in the glyph's ink, or in `material`'s. */
export function fine(pen: GlyphPen, path: PathFn, material?: Material): void {
  const { ctx } = pen;
  const ink = ctx.strokeStyle;
  if (material) ctx.strokeStyle = colours(pen, material).ink;
  ctx.beginPath();
  path(ctx);
  strokeFine(pen);
  ctx.strokeStyle = ink;
}

/** The edges of `poly` whose outside turns towards (`lit`) or away from the light, in the glyph's frame. */
function facingRuns(poly: readonly Vec[], light: Vec, lit: boolean): Vec[][] {
  const runs: Vec[][] = [];
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  const turn = area > 0 ? 1 : -1;
  let run: Vec[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const facing = (((b.y - a.y) * light.x - (b.x - a.x) * light.y) / len) * turn;
    if (lit ? facing > 0.2 : facing < -0.2) {
      if (!run.length) run.push(a);
      run.push(b);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  // A run that ends where the polygon closes goes on in the first one.
  if (runs.length > 1 && runs[0]![0] === poly[0] && runs[runs.length - 1]!.at(-1) === poly[0]) {
    const last = runs.pop()!;
    runs[0] = [...last, ...runs[0]!.slice(1)];
  }
  return runs;
}

/**
 * The painter's lips round many small raised parts at once, as `glyphEdges` gives one: in Stone a
 * lit lip on the sides that face the light and a shaded one on the others; in Engraved the heavy
 * shade line on the far sides. Outlines are the parts' own. Drawn in two passes whatever the count.
 */
export function lips(pen: GlyphPen, polys: readonly (readonly Vec[])[]): void {
  const light = lightInGlyph(pen);
  const { ctx } = pen;
  const ink = ctx.strokeStyle;
  const width = ctx.lineWidth;
  const far = polys.flatMap(p => facingRuns(p, light, false));
  if (isPainted(pen)) {
    const dark = onDarkFloor(pen);
    const near = polys.flatMap(p => facingRuns(p, light, true));
    const shift = (runs: Vec[][], d: number): Vec[][] => runs.map(r => r.map(p => ({ x: p.x + light.x * d, y: p.y + light.y * d })));
    ctx.beginPath();
    runsPath(shift(near, -0.01))(ctx);
    ctx.strokeStyle = withAlpha(dark ? pen.hand.scene.env.palette.ink : '#ffffff', dark ? 0.22 : 0.6);
    ctx.lineWidth = 0.016 / pen.scale;
    ctx.stroke();
    ctx.beginPath();
    runsPath(shift(far, 0.01))(ctx);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.lineWidth = 0.02 / pen.scale;
    ctx.stroke();
  } else {
    ctx.beginPath();
    runsPath(far)(ctx);
    ctx.lineWidth = pen.hand.weight('heavy') / pen.scale;
    ctx.stroke();
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = width;
}

/** A closed ring of `n` points round (cx, cy) whose radius wanders by `r(angle)`. */
export function ring(cx: number, cy: number, n: number, r: (a: number) => number): Vec[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r(a);
    return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr };
  });
}

/** A stick or plank from `a` to `b`, `w0` wide at `a` and `w1` at `b`, its sides a little uneven. */
export function stick(a: Vec, b: Vec, w0: number, w1 = w0, wobble = 0): Vec[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const wm = (w0 + w1) / 4;
  return [
    { x: a.x + nx * w0 / 2, y: a.y + ny * w0 / 2 },
    { x: mid.x + nx * (wm + wobble), y: mid.y + ny * (wm + wobble) },
    { x: b.x + nx * w1 / 2, y: b.y + ny * w1 / 2 },
    { x: b.x - nx * w1 / 2, y: b.y - ny * w1 / 2 },
    { x: mid.x - nx * (wm - wobble), y: mid.y - ny * (wm - wobble) },
    { x: a.x - nx * w0 / 2, y: a.y - ny * w0 / 2 },
  ];
}
