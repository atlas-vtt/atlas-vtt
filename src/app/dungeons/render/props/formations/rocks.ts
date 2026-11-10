import { glyphEdges, lightInGlyph } from '../../art/glyphLight';
import type { Vec } from '../../geometry';
import type { GlyphPen } from '../../glyphPen';
import { mixColours } from '../../palette';
import type { GlyphFit } from '../../propShapes';
import { facing, fillPolys, fineRuns, outlineRuns, splitByLight, type Face, type Finish } from './finish';
import { BOULDERS, CHIPS, CRYSTALS, MATRIX, closed, crack, type Block, type Crystal } from './shapes';

/**
 * What a cave's rock does by itself: crystals grown out of it, and blocks fallen from its roof.
 * Faces are told apart by where they turn to the one light, so a crystal's facets and a block's
 * fracture faces read in every look and at every turn.
 */

/** A crystal's six facets, those the light falls on alike joined into one face. */
function facets(pen: GlyphPen, c: Crystal): Face[] {
  const out = (k: number): Vec => {
    const p = c.hex[k % 6]!;
    const q = c.hex[(k + 1) % 6]!;
    return { x: (p.x + q.x) / 2 - c.apex.x, y: (p.y + q.y) / 2 - c.apex.y };
  };
  const kind = (k: number): number => Math.sign(Math.round(facing(pen, out(k)) * 1.6));
  // Start where the kind changes, so a run never wraps round the end of the list.
  const start = [0, 1, 2, 3, 4, 5].find(k => kind(k) !== kind(k + 5)) ?? 0;
  const faces: Face[] = [];
  for (let k = start; k < start + 6;) {
    let j = k + 1;
    while (j < start + 6 && kind(j) === kind(k)) j++;
    faces.push({ poly: [c.apex, ...Array.from({ length: j - k + 1 }, (_, i) => c.hex[(k + i) % 6]!)], out: out(Math.floor((k + j - 1) / 2)) });
    k = j;
  }
  return faces;
}

/**
 * Crystals that do not overlap, drawn together: their bodies leaning out of the rock with a lit and
 * a shaded side either side of the ridge, their pointed ends of six facets, their clear,
 * water-tinted hearts. Each part of all of them is one path.
 */
function crystalGroup(pen: GlyphPen, group: readonly Crystal[], finish: Finish): void {
  fillPolys(pen, group.map(c => c.body), mixColours(pen.palette.fill, pen.palette.water, 0.45));
  // The body's sides either side of its ridge and the six facets of its point, each lit or shaded as it turns to the light.
  splitByLight(pen, group.flatMap(c => [...c.sides, ...facets(pen, c)]), finish, 0.15);
  // The long crystals show a clear heart and the edges of their point; the short ones are too small to.
  const long = group.filter(c => c.r >= 0.06);
  fillPolys(pen, long.map(c => c.hex.map(p => ({ x: c.apex.x + (p.x - c.apex.x) * 0.38, y: c.apex.y + (p.y - c.apex.y) * 0.38 }))), pen.palette.water);
  // The ridge down each body, the facets' edges meeting at its point, and its end's rim.
  fineRuns(pen, [...group.flatMap(c => [c.ridge, closed(c.hex)]), ...long.flatMap(c => c.hex.map(p => [c.apex, p]))], 0.85);
  pen.hand.line(group.map(c => c.body), 'outline', true);
}

/** A cluster of crystals growing out of a lump of rock at the wall. */
export function crystals(pen: GlyphPen, _fit: GlyphFit, finish: Finish): void {
  fillPolys(pen, [MATRIX], pen.paint('rock').fill);
  pen.hand.line([MATRIX], 'outline', true);
  crystalGroup(pen, CRYSTALS, finish);
  // Engraved's shade line on the great crystal's far side, which carries its height.
  if (finish.painter === 'engraved') glyphEdges(pen, CRYSTALS[CRYSTALS.length - 1]!.body, true);
}

/** A fallen block: modelled whole, its fracture faces lit or shaded round the flat top it broke along. */
function blockPiece(pen: GlyphPen, b: Block, finish: Finish, great: boolean): void {
  const { outline, top } = b;
  fillPolys(pen, [outline], pen.palette.fill);
  const n = outline.length;
  const faces = outline.map((p, i) => {
    const q = outline[(i + 1) % n]!;
    const mid = { x: (p.x + q.x) / 2 - b.c.x, y: (p.y + q.y) / 2 - b.c.y };
    return { poly: [p, q, top[(i + 1) % n]!, top[i]!], out: mid };
  });
  // The flat top faces the sky and catches the light like the faces turned to it.
  splitByLight(pen, great ? [...faces, { poly: top, out: lightInGlyph(pen) }] : faces, finish, 0.2);
  // The flat top it broke along, and the arrises running from its corners down to the outline's.
  const arrises = outline.map((p, i) => [top[i]!, p]).filter((_, i) => i % 2 === 0 || n < 9);
  const [cracked, ...branches] = great ? crack(b) : [];
  fineRuns(pen, [closed(top), ...arrises, ...branches], 0.8);
  if (!cracked) {
    pen.hand.line([outline], 'outline', true);
    return;
  }
  outlineRuns(pen, [cracked]);
  glyphEdges(pen, outline, true);
}

/** One or two blocks fallen from the roof, with the chips they broke off at their foot. */
export function boulder(pen: GlyphPen, _fit: GlyphFit, finish: Finish): void {
  fillPolys(pen, CHIPS, pen.palette.fill);
  // The chips take the blocks' own outline, so the fallen rock reads whole on a dark floor too.
  pen.hand.line(CHIPS, 'outline', true);
  for (const [i, b] of BOULDERS.entries()) blockPiece(pen, b, finish, i === BOULDERS.length - 1);
}
