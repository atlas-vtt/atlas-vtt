import { Graphics, type Container, type GraphicsPath } from 'pixi.js';

function inPath(path: GraphicsPath, x: number, y: number): boolean {
  return path.shapePath.shapePrimitives.some(({ shape }) => shape.contains(x, y));
}

/** The darkness a line-of-sight fallback added to `viewport`. */
export function darknessOf(viewport: Container): Graphics {
  const darkness = viewport.children[0];
  if (!(darkness instanceof Graphics)) throw new Error('The fallback drew no darkness');
  return darkness;
}

/**
 * Whether the darkness is meant to cover a world point: inside one of its fills and in none of
 * that fill's holes. A renderer shows exactly this only where the holes of a fill lie inside it
 * and apart from each other.
 */
export function darknessCovers(darkness: Graphics, x: number, y: number): boolean {
  return darkness.context.instructions.some((instruction) => {
    if (instruction.action !== 'fill') return false;
    const { path, hole } = instruction.data;
    return inPath(path, x, y) && !(hole && inPath(hole, x, y));
  });
}

/** The stretches of the row at `y` the darkness leaves open, as [first, end) world pixels read at pixel centres. */
export function openSpans(darkness: Graphics, y: number, width: number): [number, number][] {
  const spans: [number, number][] = [];
  let start: number | null = null;
  for (let x = 0; x <= width; x++) {
    const open = x < width && !darknessCovers(darkness, x + 0.5, y);
    if (open && start === null) start = x;
    if (!open && start !== null) {
      spans.push([start, x]);
      start = null;
    }
  }
  return spans;
}
