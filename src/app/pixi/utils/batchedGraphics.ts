import type { Graphics } from 'pixi.js';

/**
 * Lets `graphics` join PIXI's batch whatever its size. PIXI batches a Graphics only below 200
 * points (`vertices.length < 400`, `AbstractGraphicsContextSystem`); round shapes with smooth
 * curves (badges, marks and wheels drawn 16 times larger, a selection's outline) have 250 to 900,
 * and drawn alone each costs a draw call of its own and splits the batch around it into two more.
 * Batched, its points are packed into the batch with the sprites around it; the picture is the same.
 */
export function batched<T extends Graphics>(graphics: T): T {
  graphics.context.batchMode = 'batch';
  return graphics;
}
