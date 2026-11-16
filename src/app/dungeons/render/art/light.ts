import { signedArea2, type Vec } from '../geometry';

/** The way shadows fall on screen: down and to the right, the one light standing at the top left. */
export const SHADOW_DIR: Vec = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
/** Towards the light. */
export const TO_LIGHT: Vec = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
/** How far a wall's shadow reaches across the floor, in cells; whatever stands casts its height times this. */
export const WALL_SHADOW = 0.34;

/**
 * The drafter's shade lines: the edges of a raised thing that face away from the light, or of a
 * sunken one that face towards it (its lip's face is the one in shadow), as runs.
 */
export function shadeEdges(poly: readonly Vec[], raised: boolean, threshold = 0.2): Vec[][] {
  const out: Vec[][] = [];
  const turn = signedArea2(poly) > 0 ? 1 : -1;
  let run: Vec[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // Clockwise on screen, the outside lies to the left of the direction of travel.
    const nx = ((b.y - a.y) / len) * turn;
    const ny = (-(b.x - a.x) / len) * turn;
    const facing = (nx * SHADOW_DIR.x + ny * SHADOW_DIR.y) * (raised ? 1 : -1);
    if (facing > threshold) {
      if (!run.length) run.push(a);
      run.push(b);
    } else if (run.length) {
      out.push(run);
      run = [];
    }
  }
  if (run.length) out.push(run);
  return out;
}
