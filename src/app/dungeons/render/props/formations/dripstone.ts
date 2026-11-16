import { glyphEdges } from '../../art/glyphLight';
import { polyPath, polysPath } from '../../art/paths';
import type { Vec } from '../../geometry';
import type { GlyphPen } from '../../glyphPen';
import type { GlyphFit } from '../../propShapes';
import { drawClump, glint, moundPart } from './cones';
import { calcite, calciteGrain, facing, fillOutline, fillPolys, fineRuns, outlineRuns, splitByLight, type Face, type Finish } from './finish';
import { COLUMN, MOUND_PAD, MOUNDS, SHEET_TOP, closed, curtainFoot, curtainLine, flowLobes, flowSheet, ribbon } from './shapes';

/**
 * Calcite that dripping water built: stalagmites as cones seen from straight above (rings of growth
 * climbing to a wet tip), a column's broad fluted foot, flowstone poured down a wall and a
 * curtain folded along it. Each is drawn once here; the painter's finish lights and shades it.
 */

/** A clump of stalagmites on the calcite they poured. */
export function stalagmites(pen: GlyphPen, _fit: GlyphFit, finish: Finish): void {
  fillOutline(pen, MOUND_PAD, pen.palette.fill);
  drawClump(pen, MOUNDS.map(m => moundPart(pen, m)), finish);
}

/** A column: its rippled skirt, the cones at its foot, its fluted shaft standing round in the light. */
export function columnFormation(pen: GlyphPen, _fit: GlyphFit, finish: Finish): void {
  const { skirt, drips, shaft, core, foot } = COLUMN;
  const centre = { x: 0, y: 0 };
  fillOutline(pen, skirt, pen.palette.fill);
  // Flutes: grooves down the shaft between its swellings.
  const flutes = Array.from({ length: 11 }, (_, k) => {
    const a = (Math.PI * 1.5 - 0.3 + k * Math.PI * 2) / 11;
    return [{ x: Math.cos(a) * 0.14, y: Math.sin(a) * 0.14 }, { x: Math.cos(a) * 0.235, y: Math.sin(a) * 0.235 }];
  });
  const column = {
    cone: { foot: shaft, apex: centre, reach: 0.25 },
    lines: [...flutes, closed(core)],
    glints: [glint(pen, centre, 0.19, 0.9), glint(pen, centre, 0.1, 1.1)],
  };
  fineRuns(pen, drips.map(closed), 0.7);
  drawClump(pen, [...foot.map(m => moundPart(pen, m)), column], finish);
}

/**
 * The faces of a strip between two runs, each facing the way its outer run's segment does; faces
 * in a row that the light falls on alike are joined into one, so a long strip is a few faces.
 */
function strip(pen: GlyphPen, outer: readonly Vec[], inner: readonly Vec[], threshold: number): Face[] {
  const kind = (i: number): number => {
    const a = outer[i]!;
    const b = outer[i + 1]!;
    const f = facing(pen, { x: b.y - a.y, y: -(b.x - a.x) });
    return f > threshold ? 1 : f < -threshold ? -1 : 0;
  };
  const faces: Face[] = [];
  for (let i = 0; i < outer.length - 1;) {
    const k = kind(i);
    let j = i + 1;
    while (j < outer.length - 1 && kind(j) === k) j++;
    if (k !== 0) {
      const a = outer[i]!;
      const b = outer[j]!;
      faces.push({ poly: [...outer.slice(i, j + 1), ...inner.slice(i, j + 1).reverse()], out: { x: b.y - a.y, y: -(b.x - a.x) } });
    }
    i = j;
  }
  return faces;
}

/** Flowstone: a sheet poured down the wall, its tongues rolling over at their lips, its flow lines following the slope. */
export function flowstone(pen: GlyphPen, fit: GlyphFit, finish: Finish): void {
  const sheet = flowSheet(fit);
  const { edge, tips } = flowLobes(fit);
  fillPolys(pen, [sheet], calcite(pen));
  calciteGrain(pen, polyPath(sheet), finish);
  // Bands of stain follow the lip, as each flood laid its film.
  const towardWall = (f: number): Vec[] => edge.map(p => ({ x: p.x, y: p.y + (SHEET_TOP - p.y) * f }));
  finish.stain(pen, polysPath(([[0.18, 0.34], [0.55, 0.72]] as const).map(([from, to]) => [...towardWall(from), ...towardWall(to).reverse()])));
  // Each tongue's lip rolls over: lit where it turns to the light, shaded where it turns away.
  const lip = edge.map(p => ({ x: p.x, y: Math.min(SHEET_TOP, p.y + 0.03) }));
  splitByLight(pen, strip(pen, edge, lip, 0.2), finish, 0.2);
  const lines: Vec[][] = [];
  for (const [i, tip] of tips.entries()) {
    for (const side of [-1, 1]) {
      const spread = side * (0.035 + (i % 2) * 0.012);
      lines.push([{ x: tip.x + spread * 0.4, y: SHEET_TOP - 0.008 }, { x: tip.x + spread, y: (SHEET_TOP + tip.y) / 2 }, { x: tip.x + spread * 0.55, y: tip.y + 0.035 }]);
    }
  }
  fineRuns(pen, [...lines, lip], 0.6);
  finish.sheen(pen, tips.map(t => [{ x: t.x - 0.03, y: t.y + 0.012 }, { x: t.x + 0.015, y: t.y + 0.016 }]));
  pen.hand.line([edge], 'outline');
}

/** A curtain: calcite folded to and fro along the wall, every other fold catching the light, over the flowstone at its foot. */
export function curtain(pen: GlyphPen, fit: GlyphFit, finish: Finish): void {
  const foot = curtainFoot(fit);
  fillPolys(pen, [foot], calcite(pen));
  finish.stain(pen, polyPath(foot));
  outlineRuns(pen, [foot.slice(0, -2)]);
  const line = curtainLine(fit);
  const rib = ribbon(line, 0.072);
  fillPolys(pen, [rib], calcite(pen));
  // Each half fold faces its own way: those towards the light are lit, the others shaded.
  const n = line.length;
  const outer = rib.slice(0, n);
  const inner = rib.slice(n).reverse();
  splitByLight(pen, strip(pen, outer, inner, 0.12), finish, 0.12);
  // Every other fold carries a band of stain across it, the curtain's growth lines.
  const bands: Vec[][] = [];
  for (let f = 0; f * 8 + 7 < n; f += 2) bands.push([...outer.slice(f * 8 + 2, f * 8 + 7), ...inner.slice(f * 8 + 2, f * 8 + 7).reverse()]);
  finish.stain(pen, polysPath(bands));
  // Bands of growth along it, and a crease at each fold.
  const creases: Vec[][] = [];
  for (let i = 4; i < n - 1; i += 4) creases.push([outer[i]!, inner[i]!]);
  fineRuns(pen, [line, ...creases], 0.65);
  if (finish.painter === 'stone') glyphEdges(pen, rib, true);
  else pen.hand.line([rib], 'outline', true);
}
