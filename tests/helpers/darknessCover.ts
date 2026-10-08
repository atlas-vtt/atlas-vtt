import { Graphics, type Container, type GraphicsPath } from 'pixi.js';

function inPath(path: GraphicsPath, x: number, y: number): boolean {
  return path.shapePath.shapePrimitives.some(({ shape }) => shape.contains(x, y));
}

/** The darkness the previous version of the line-of-sight fallback (`sightPolicyBaseline`) drew into `viewport`. */
export function darknessOf(viewport: Container): Graphics {
  const darkness = viewport.children[0];
  if (!(darkness instanceof Graphics)) throw new Error('The fallback drew no darkness');
  return darkness;
}

/**
 * Whether that drawing is meant to cover a world point: inside one of its fills and in none of
 * that fill's holes. No renderer drew exactly this, since its holes overlap; its polygons are
 * the sweep's own, so it is the exact black the current version is held to.
 */
export function darknessCovers(darkness: Graphics, x: number, y: number): boolean {
  return darkness.context.instructions.some((instruction) => {
    if (instruction.action !== 'fill') return false;
    const { path, hole } = instruction.data;
    return inPath(path, x, y) && !(hole && inPath(hole, x, y));
  });
}

/** How each fill of that drawing is painted: black at alpha 1, or the players saw through it. */
export function darknessPaint(darkness: Graphics): { color: number; alpha: number }[] {
  return darkness.context.instructions.flatMap((instruction) => (instruction.action === 'fill' ? [{ color: instruction.data.style.color, alpha: instruction.data.style.alpha }] : []));
}
