// Frozen from 29c9495a src/app/dice3d/throwSeed.ts. Only import paths are adapted.
import { seededRandom } from '../../../src/app/dice3d/atlasCell';
import type { Rng } from '../../../src/app/dice3d/dieTour';

/** FNV-1a: the same text always gives the same 32-bit number. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The randomness of one throw, drawn from the roll's id: every window that
 * shows the roll (the DM's map, the player window) throws the same dice along
 * the same paths. `stream` separates independent draws, e.g. one per die, so a
 * die whose frames fall differently cannot shift the others.
 */
export function throwRandom(rollId: string, stream: number): Rng {
  return seededRandom(hash(`${rollId}#${stream}`));
}
