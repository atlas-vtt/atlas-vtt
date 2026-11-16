/**
 * Engraved's grounds, in ink on the paper alone: lawn as sparse tufts of three blades with a little
 * stipple, gravel as a close stipple of dots, a hedge's leaves as the engraver's scallops, each
 * clump a short arc cut on its side away from the light, and trees as inked crowns
 * (`engravedCrown.ts`).
 */

import { SHADOW_DIR } from '../art/light';
import type { Hand } from '../art/hand';
import { polysPath, type PathFn } from '../art/paths';
import type { Vec } from '../geometry';
import type { Pens } from '../engraved/pens';
import { cutCrown } from './engravedCrown';
import { scatter, tracePebbles, withClip, type GroundsPaint } from './paint';

const SHADE_ANGLE = Math.atan2(SHADOW_DIR.y, SHADOW_DIR.x);

export function engravedGroundsPaint(hand: Hand, pens: Pens): GroundsPaint {
  const { ctx } = hand.scene.env;
  const seed = hand.scene.env.dungeon.model.seed;
  const fine = hand.weight('fine');
  /** The paper inside `path`, and `draw` cutting into it in ink. */
  const paper = (path: PathFn, draw: () => void): void =>
    withClip(ctx, path, () => {
      ctx.fillStyle = pens.floor;
      ctx.fill();
      ctx.fillStyle = pens.ink;
      ctx.strokeStyle = pens.ink;
      ctx.lineCap = 'round';
      draw();
    });
  const stipple = (cells: readonly Vec[], per: number, salt: number, size: number): void => {
    ctx.beginPath();
    for (const p of scatter(cells, per, seed + salt)) {
      const r = size * (0.6 + 0.6 * p.t);
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  };
  return {
    lawn: (path, cells) =>
      paper(path, () => {
        ctx.beginPath();
        for (const p of scatter(cells, 3, seed + 11)) {
          const lean = (p.t - 0.5) * 0.8;
          for (const k of [-1, 0, 1]) {
            const a = -Math.PI / 2 + lean + k * 0.45;
            const len = 0.05 + (k === 0 ? 0.025 : 0);
            ctx.moveTo(p.x + k * 0.012, p.y);
            ctx.lineTo(p.x + k * 0.012 + Math.cos(a) * len, p.y + Math.sin(a) * len);
          }
        }
        ctx.lineWidth = fine * 0.8;
        ctx.stroke();
        stipple(cells, 6, 12, 0.005);
      }),
    pool: (path, centre, radius) =>
      paper(path, () => {
        ctx.fillStyle = pens.water;
        ctx.fill();
        // Water's level lines, broken where the light lies on it.
        ctx.beginPath();
        for (let y = centre.y - radius + 0.06; y < centre.y + radius; y += pens.spacing * 1.6) {
          const half = Math.sqrt(Math.max(0, radius * radius - (y - centre.y) ** 2));
          ctx.moveTo(centre.x - half, y);
          ctx.lineTo(centre.x - half * 0.15, y);
          ctx.moveTo(centre.x + half * 0.2, y);
          ctx.lineTo(centre.x + half, y);
        }
        ctx.lineWidth = fine * 0.7;
        ctx.stroke();
      }),
    gravel: (path, cells) =>
      paper(path, () => {
        // Raked gravel reads paler than the lawn: open paper with a few pebbles, each a small ring.
        ctx.beginPath();
        tracePebbles(ctx, scatter(cells, 10, seed + 13), 0.012);
        ctx.lineWidth = fine * 0.7;
        ctx.stroke();
        stipple(cells, 8, 14, 0.005);
      }),
    foliage: (rings, clump, salt, cells) => {
      // Each clump an arc cut on its side away from the light.
      const clumps = scatter(cells, 1 / (clump * 1.2) ** 2, seed + salt);
      paper(polysPath(rings), () => {
        ctx.beginPath();
        for (const p of clumps) {
          const r = clump * (0.7 + 0.3 * p.t);
          const a = SHADE_ANGLE + (p.t - 0.5) * 0.6;
          ctx.moveTo(p.x + Math.cos(a - 1.25) * r, p.y + Math.sin(a - 1.25) * r);
          ctx.arc(p.x, p.y, r, a - 1.25, a + 1.25);
        }
        ctx.lineWidth = fine;
        ctx.stroke();
      });
    },
    crown: (crown) => cutCrown(hand, pens, crown),
    // The paper shows through glass: only its bars are cut.
    glass: () => undefined,
    // Shade cut over the lawn's tufts would bury them: a lighter hand there.
    shade: { ground: 0.45, tree: 0.35 },
  };
}
