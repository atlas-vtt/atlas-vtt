import { Graphics } from 'pixi.js';

/**
 * The mark that shows which way a token being turned will look: a chevron just outside its ring,
 * pointing away from it, drawn for a token of `radius` that is not turned, which looks towards its
 * art's bottom (`tokenFacing`). The caller turns it by the token's rotation and scales it.
 */
export function facingMark(radius: number, colour: number): Graphics {
  const mark = new Graphics();
  mark.eventMode = 'none';
  const tip = radius * 1.72;
  const base = radius * 1.2;
  const halfWidth = radius * 0.36;
  mark.poly([0, tip, -halfWidth, base, 0, base + radius * 0.1, halfWidth, base], true);
  mark.fill({ color: colour });
  mark.stroke({ color: 0x000000, alpha: 0.45, width: Math.max(1, radius * 0.035), join: 'round' });
  return mark;
}
