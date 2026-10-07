import { describe, expect, it } from 'vitest';
import { beginRoll, makeDie, stepDie } from '../../../src/app/dice3d/dieMotion';
import { qIdentity } from '../../../src/app/dice3d/vectorMath';
import { throwRandom } from '../../../src/app/dice3d/throwSeed';

/** Throws a die for a roll at a frame rate and reports where it is every 0.2 s and where it hit walls. */
function throwAt(rollId: string, fps: number): { track: string[]; walls: number } {
  const die = makeDie(throwRandom(rollId, -1));
  beginRoll(die, qIdentity(), 0, throwRandom(rollId, 0));
  const step = throwRandom(rollId, 1000);
  const track: string[] = [];
  // Sampled at the same moments at any frame rate: every fifth of a second.
  const perSample = fps / 5;
  for (let frame = 1; frame <= fps * 4 && die.phase !== 'rest'; frame++) {
    stepDie(die, 1 / fps, step);
    // x and z follow the path, which depends only on the throw's plan, not on the frames.
    if (frame % perSample === 0) track.push(`${die.p[0].toFixed(2)},${die.p[2].toFixed(2)}`);
  }
  return { track, walls: die.wallHits };
}

describe('seeded throws', () => {
  it('throw the same roll the same way in every window, whatever their frame rate', () => {
    const dm = throwAt('roll_42', 50);
    const player = throwAt('roll_42', 100);
    expect(player.track).toEqual(dm.track);
    expect(player.walls).toBe(dm.walls);
  });

  it('throw different rolls differently', () => {
    expect(throwAt('roll_1', 50).track).not.toEqual(throwAt('roll_2', 50).track);
  });

  it('draw the numbers they drew before for the same roll', () => {
    const rng = throwRandom('roll', 0);
    expect([rng(), rng(), rng()]).toEqual([0.23346852883696556, 0.4390303229447454, 0.1843675752170384]);
  });
});
