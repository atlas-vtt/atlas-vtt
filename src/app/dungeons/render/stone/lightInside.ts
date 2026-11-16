import type { Canvas2D, Vec } from '../geometry';
import { withAlpha } from '../palette';
import { TO_LIGHT } from '../art/light';
import type { StoneColours } from './colours';

/** Light from the top left over a silhouette (the current clip): a highlight and a falling shade. */
export function lightInside(ctx: Canvas2D, c: Pick<StoneColours, 'light' | 'dark'>, centre: Vec, radius: number, strength = 1): void {
  const g = ctx.createLinearGradient(centre.x + TO_LIGHT.x * radius, centre.y + TO_LIGHT.y * radius, centre.x - TO_LIGHT.x * radius, centre.y - TO_LIGHT.y * radius);
  g.addColorStop(0, withAlpha(c.light, (c.dark ? 0.14 : 0.38) * strength));
  g.addColorStop(0.45, withAlpha(c.light, 0));
  g.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, `rgba(0, 0, 0, ${Math.min(0.6, 0.3 * strength)})`);
  ctx.fillStyle = g;
  ctx.fillRect(centre.x - radius * 2, centre.y - radius * 2, radius * 4, radius * 4);
}
