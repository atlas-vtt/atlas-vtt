import type { Graphics } from 'pixi.js';
import { squareCorners } from './utils/squareCorners';

/** Keep the leading cap's curvature when a fill is narrower than the bar height. */
export function resourceBarFill(graphics: Graphics, x: number, y: number, width: number, height: number): Graphics {
  if (width <= 0 || height <= 0) return graphics;
  if (squareCorners()) return graphics.rect(x, y, width, height);
  const radius = height / 2;
  if (width >= height) return graphics.roundRect(x, y, width, height, radius);

  // Reveal only the filled portion of the circular cap. A narrow roundRect
  // would shrink its radius to width / 2 and become a vertical strip.
  const angle = Math.acos((width - radius) / radius);
  const centerX = x + radius;
  const centerY = y + radius;
  return graphics
    .moveTo(x + width, centerY - radius * Math.sin(angle))
    .arc(centerX, centerY, radius, -angle, angle, true)
    .closePath();
}
