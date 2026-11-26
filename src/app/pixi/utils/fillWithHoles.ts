import type { FillInput, Graphics } from 'pixi.js';

/**
 * Fills the ring `outline` (`[x0, y0, x1, y1, …]`) with `holes` cut out of it, after what `graphics`
 * already holds. Every hole goes in one cut: PIXI's `cut()` hands its path to the instruction before
 * the last too when the last already has a hole (it pairs a fill with its stroke), so a second cut
 * of a fill also cut that hole out of the fill drawn before it, where earcut made stray triangles of
 * an outline with a hole outside it (a wedge of rock shown as floor between two rooms).
 */
export function fillWithHoles(graphics: Graphics, outline: readonly number[], holes: readonly (readonly number[])[], style: FillInput): void {
  graphics.poly([...outline], true).fill(style);
  const cut = holes.filter((hole) => hole.length >= 6);
  if (cut.length === 0) return;
  for (const hole of cut) graphics.poly([...hole], true);
  graphics.cut();
}
