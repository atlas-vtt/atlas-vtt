import { seededRandom } from './atlasCell';
import type { Rng } from './dieTour';
import { fnv1a32 } from '../utils/hashing';

/**
 * The randomness of one throw, drawn from the roll's id: every window that
 * shows the roll (the DM's map, the player window) throws the same dice along
 * the same paths. `stream` separates independent draws, e.g. one per die, so a
 * die whose frames fall differently cannot shift the others.
 */
export function throwRandom(rollId: string, stream: number): Rng {
  return seededRandom(fnv1a32(`${rollId}#${stream}`));
}
