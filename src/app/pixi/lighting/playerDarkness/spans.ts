/**
 * Scanline geometry shared by the players' darkness and by extensions that draw fog on cells
 * (`@atlas-vtt/shared/draw`). Pure: no PIXI, Obsidian or store.
 */

/** A point in world pixels. */
interface Point {
  x: number;
  y: number;
}

/** The x ranges of a horizontal line at `y` that lie inside the polygon, by nonzero winding. */
export function insideSpans(points: readonly Point[], y: number): Array<[number, number]> {
  const crossings: Array<{ x: number; winding: number }> = [];
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    if ((a.y <= y) === (b.y <= y)) continue;
    crossings.push({ x: a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x), winding: b.y > a.y ? 1 : -1 });
  }
  crossings.sort((p, q) => p.x - q.x);
  const spans: Array<[number, number]> = [];
  let winding = 0;
  for (let index = 0; index < crossings.length - 1; index++) {
    winding += crossings[index]!.winding;
    if (winding !== 0) spans.push([crossings[index]!.x, crossings[index + 1]!.x]);
  }
  return spans;
}
