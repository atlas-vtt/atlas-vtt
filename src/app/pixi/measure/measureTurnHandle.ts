import type { Graphics } from 'pixi.js';
import type { CanvasBadgeTheme } from '../utils/canvasBadgeColors';
import { MEASURE_TURN_HANDLE_RADIUS } from './measureHandle';

const ARROW_RADIUS = 2.5;
const ARROW_WIDTH = 1;
const HEAD = 1.5;
/** The two arrows' arcs, in radians clockwise from the right: one over the top, one under the bottom, a gap between. */
const ARROWS: readonly (readonly [number, number])[] = [[-2.97, -0.5], [0.17, 2.64]];

/** Draws the turn handle: the disc and ring of the end dot, and two arrows chasing each other round it, in the badge's ink. */
export function drawTurnHandle(g: Graphics, ringColor: number, theme: CanvasBadgeTheme): void {
  const radius = MEASURE_TURN_HANDLE_RADIUS;
  g.clear();
  g.circle(0, 0, radius + 0.5).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
  g.circle(0, 0, radius).fill({ color: theme.background, alpha: 0.95 });
  g.circle(0, 0, radius - 0.75).stroke({ width: 1, color: ringColor, alpha: 0.9 });
  for (const [from, to] of ARROWS) {
    const [cos, sin] = [Math.cos(to), Math.sin(to)];
    const end = { x: ARROW_RADIUS * cos, y: ARROW_RADIUS * sin };
    g.moveTo(ARROW_RADIUS * Math.cos(from), ARROW_RADIUS * Math.sin(from));
    g.arc(0, 0, ARROW_RADIUS, from, to).stroke({ width: ARROW_WIDTH, color: theme.stroke });
    // The head lies along the arc's direction of travel at its end.
    g.poly([
      end.x - sin * HEAD, end.y + cos * HEAD,
      end.x + cos * HEAD * 0.7, end.y + sin * HEAD * 0.7,
      end.x - cos * HEAD * 0.7, end.y - sin * HEAD * 0.7,
    ]).fill({ color: theme.stroke });
  }
}
