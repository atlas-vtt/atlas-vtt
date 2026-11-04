import { describe, expect, it } from 'vitest';

import {
  dieGeometry,
  faceIndexForValue,
  faceQuaternion,
  lyingHeight,
  restingQuaternion,
} from '../../../src/app/dice3d/dieGeometry';
import { beginRoll, makeDie, stepDie, type DieAnim } from '../../../src/app/dice3d/dieMotion';
import { restHeight, STAGE_X, STAGE_Z } from '../../../src/app/dice3d/dieTour';
import { throwRandom } from '../../../src/app/dice3d/throwSeed';
import { qAngle, qRotate, vLength } from '../../../src/app/dice3d/vectorMath';

/** A die without chance: the same throw every time. */
function fixedRng(...values: number[]): () => number {
  let i = 0;
  return (): number => values[i++ % values.length]!;
}

/** Runs the die in 16 ms steps until it rests. */
function runUntilRest(die: DieAnim, rng: () => number, maxSeconds = 8): number {
  let t = 0;
  while (die.phase !== 'rest' && t < maxSeconds) {
    stepDie(die, 1 / 60, rng);
    t += 1 / 60;
  }
  return t;
}

describe('the throw', () => {
  it('lies ready and only shoots off at launch', () => {
    const rng = fixedRng(0.3, 0.6, 0.2, 0.8);
    const die = makeDie(rng);
    // Before the throw the die lies visibly on its spot, no flight in from
    // outside.
    expect(die.phase).toBe('rest');
    expect(die.p[1]).toBeCloseTo(restHeight(die.radius), 6);
    expect(vLength(die.w)).toBe(0);

    beginRoll(die, die.q, 0, rng);
    // The launch: a hop upwards, a wild spin.
    expect(die.phase).toBe('throw');
    expect(die.v[1]).toBeGreaterThan(1);
    expect(vLength(die.w)).toBeGreaterThan(20);
  });

  it('travels across the table but stays in frame', () => {
    const rng = fixedRng(0.37, 0.81, 0.12, 0.66, 0.49, 0.93);
    const home: [number, number] = [0.8, 0.3];
    const die = makeDie(rng, home, 0.62);
    beginRoll(die, die.q, 0, rng);

    let farthest = 0;
    for (let i = 0; i < 600 && die.phase === 'throw'; i++) {
      stepDie(die, 1 / 60, rng);
      // No body ever hangs half off the stage (bound minus its own radius).
      expect(Math.abs(die.p[0])).toBeLessThanOrEqual(STAGE_X - die.radius + 1e-6);
      expect(Math.abs(die.p[2])).toBeLessThanOrEqual(STAGE_Z - die.radius + 1e-6);
      farthest = Math.max(farthest, Math.abs(die.p[0] - home[0]));
    }
    // It really travelled, further than a hand's width.
    expect(farthest).toBeGreaterThan(1);
    // And it still whirled: more than one bounce.
    expect(die.bounces).toBeGreaterThan(1);
  });

  // **The core of the pinball path.** This is a claim about arithmetic; if it
  // fails the die is visibly *pulled* to its spot.
  it('ends exactly on its spot without anything pulling it there', () => {
    for (let n = 0; n < 60; n++) {
      const rng = throwRandom('motion-arrival', n);
      const home: [number, number] = [(rng() - 0.5) * 2.4, (rng() - 0.5) * 1.4];
      const die = makeDie(rng, home, 0.7);
      beginRoll(die, die.q, 0, rng);

      let arrival = 0;
      let fastest = 0;
      for (let i = 0; i < 400 && die.phase === 'throw'; i++) {
        stepDie(die, 1 / 60, rng);
        arrival = Math.hypot(die.v[0], die.v[2]);
        fastest = Math.max(fastest, arrival);
      }

      // It arrived on the point it flew off from.
      expect(die.p[0]).toBeCloseTo(home[0], 6);
      expect(die.p[2]).toBeCloseTo(home[1], 6);
      // And it **rolled out**, it was not stopped: measured against its own
      // top speed, whatever the pace of the throw.
      expect(arrival).toBeLessThan(fastest * 0.06);
    }
  });

  it('bangs into the walls on its way, and at the wall', () => {
    for (let n = 0; n < 40; n++) {
      const rng = throwRandom('motion-wall', n);
      const die = makeDie(rng, [0, 0], 0.92);
      beginRoll(die, die.q, 0, rng);

      let hits = 0;
      for (let i = 0; i < 400 && die.phase === 'throw'; i++) {
        stepDie(die, 1 / 60, rng);
        if (die.impact?.kind !== 'wall') continue;
        hits++;
        // **The contact point is reported**: on the stage edge itself, a radius
        // outside the centre, even though the hit is noticed a frame late.
        const axis = die.impact.normal[0] !== 0 ? 0 : 2;
        const edge = axis === 0 ? STAGE_X : STAGE_Z;
        expect(Math.abs(die.impact.at[axis])).toBeCloseTo(edge, 9);
        // **At the wall it really was at.** A wrong side was once reported
        // whenever the die flew backwards on this axis. At the moment of the
        // hit the centre is on the same side as the contact point.
        expect(Math.sign(die.impact.at[axis])).toBe(Math.sign(die.p[axis]));
        // The body stands *at* the wall: within its own length of where its
        // centre touches the wall.
        expect(edge - die.radius - Math.abs(die.p[axis])).toBeLessThan(die.radius);
      }
      // Three is the least that looks like pinball (see `WALL_PAIRS`).
      expect(hits).toBeGreaterThanOrEqual(3);
      expect(die.wallHits).toBe(hits);
    }
  });

  it('reports every impact for exactly one frame', () => {
    const rng = throwRandom('motion-impact', 0);
    const die = makeDie(rng);
    beginRoll(die, die.q, 0, rng);

    let reported = 0;
    for (let i = 0; i < 300 && die.phase !== 'rest'; i++) {
      stepDie(die, 1 / 60, rng);
      if (die.impact === null) continue;
      reported++;
      // Reading it again next frame would play the sound twice.
      const impact = die.impact;
      stepDie(die, 1 / 600, rng);
      if (die.impact !== null) expect(die.impact).not.toBe(impact);
    }
    expect(reported).toBeGreaterThan(3);
  });

  // **The end is the real test.** An older version let the die tumble out and
  // then swung it into the target: numerically the same, visibly a body
  // *being turned*. So this checks "stops without jerking", not "arrives".
  it.each([2954, 3862, 9006, ...Array.from({ length: 40 }, (_, seed) => seed)])('spins until the last frame and stops without starting again (seed %i)', (seed) => {
    const geometry = dieGeometry(20);
    const rng = throwRandom('motion-regression', seed);
    const die = makeDie(rng);
    const target = restingQuaternion(geometry, faceIndexForValue(geometry, 1 + (seed % 20)));
    beginRoll(die, target, 0, rng);

    const steps: number[] = [];
    // The pose in the last frame still in flight: whatever is missing here
    // would have to be turned in later.
    let lastCollision = -1;
    let before = die.q;
    let last = die.q;
    for (let i = 0; i < 400 && die.phase !== 'rest'; i++) {
      last = die.q;
      stepDie(die, 1 / 60, rng);
      if (die.impact?.kind === 'wall' || die.impact?.kind === 'floor') lastCollision = steps.length;
      steps.push(qAngle(before, die.q));
      before = die.q;
    }

    // **Nothing is left over.** Before the last step the die already shows
    // its number; resting only fixes it.
    expect(qAngle(last, die.target)).toBeLessThan(0.02);

    const peak = Math.max(...steps);
    // The last step is a run-out, not a new start.
    expect(steps[steps.length - 1]!).toBeLessThan(peak * 0.03);
    // And it spins until the end rather than waiting half a second for its cue.
    expect(steps[steps.length - 6]!).toBeGreaterThan(0);
    // **No second start.** Once below a tenth of its peak nothing follows.
    // Collisions can briefly slow or reverse a tumbling die. The final
    // run-out starts after the last collision, not at an earlier speed dip.
    const ranOut = steps.findIndex((w, index) => index > lastCollision && w < peak * 0.1);
    expect(ranOut).toBeGreaterThan(0);
    for (const step of steps.slice(ranOut)) {
      expect(step).toBeLessThan(peak * 0.2);
    }
  });

  it('comes to rest exactly on the rolled number', () => {
    const geometry = dieGeometry(20);
    const rng = fixedRng(0.17, 0.83, 0.41, 0.62, 0.29, 0.95);

    for (const value of [1, 7, 13, 20]) {
      const die = makeDie(rng);
      const target = faceQuaternion(geometry, faceIndexForValue(geometry, value));
      beginRoll(die, target, 0, rng);
      runUntilRest(die, rng);

      expect(die.phase).toBe('rest');
      // The face on top is the one the throw promised.
      const facing = geometry.normals
        .map((n, i) => ({ i, y: qRotate(die.q, n)[1] }))
        .sort((a, b) => b.y - a.y)[0]!;
      expect(geometry.values[facing.i]).toBe(value);
    }
  });

  it('loses spin while it whirls and bounces', () => {
    const rng = fixedRng(0.5, 0.2, 0.7, 0.35);
    const die = makeDie(rng);
    beginRoll(die, die.q, 0, rng);
    const start = vLength(die.w);
    for (let i = 0; i < 90; i++) stepDie(die, 1 / 60, rng);
    expect(vLength(die.w)).toBeLessThan(start);
  });

  it('hits the table and bounces back', () => {
    const rng = fixedRng(0.41, 0.67, 0.23, 0.88, 0.15);
    const die = makeDie(rng);
    beginRoll(die, die.q, 0, rng);

    let bounced = false;
    for (let i = 0; i < 600 && !bounced; i++) {
      const falling = die.v[1] < 0;
      stepDie(die, 1 / 60, rng);
      if (falling && die.v[1] > 0) bounced = true;
    }
    expect(bounced).toBe(true);
  });

  // A d4 lying on a face has its centre a third of its radius above the table,
  // far below where it tumbles. It gets there by lying down, not by falling.
  it('ends lying on its face, and lying down is no impact', () => {
    const geometry = dieGeometry(4);
    const lie = lyingHeight(geometry);
    expect(lie).toBeCloseTo(1 / 3, 6);

    const throwOf = (share?: number): DieAnim => {
      const rng = fixedRng(0.19, 0.71, 0.44, 0.36, 0.83, 0.27);
      const die = makeDie(rng, [0, 0], 0.92, [STAGE_X, STAGE_Z], share);
      beginRoll(die, restingQuaternion(geometry, 0), 0, rng);
      return die;
    };
    const lying = throwOf(lie);
    const tumbling = throwOf();
    const rng = fixedRng(0.5);
    let floorHits = 0;
    while (lying.phase !== 'rest') {
      stepDie(lying, 1 / 60, rng);
      stepDie(tumbling, 1 / 60, rng);
      if (lying.impact?.kind === 'floor') floorHits += 1;
      expect(lying.p[1]).toBeGreaterThanOrEqual(restHeight(lying.radius, lie) - 1e-6);
    }
    expect(lying.p[1]).toBeCloseTo(restHeight(lying.radius, lie), 6);
    // The same throw with the table at one height bounces exactly as often.
    expect(floorHits).toBe(tumbling.bounces);
    expect(lying.bounces).toBe(tumbling.bounces);
  });

  it('never falls through the table', () => {
    const geometry = dieGeometry(20);
    const rng = fixedRng(0.19, 0.71, 0.44, 0.36, 0.83, 0.27);
    const die = makeDie(rng);
    beginRoll(die, faceQuaternion(geometry, 0), 0, rng);

    const floor = restHeight(die.radius);
    for (let i = 0; i < 600; i++) {
      stepDie(die, 1 / 60, rng);
      expect(die.p[1]).toBeGreaterThanOrEqual(floor - 1e-6);
    }
  });

  it('rests after a good second, but not at once', () => {
    const geometry = dieGeometry(20);
    const rng = fixedRng(0.11, 0.73, 0.52, 0.28, 0.91, 0.46);
    const die = makeDie(rng);
    beginRoll(die, faceQuaternion(geometry, 0), 0, rng);

    const seconds = runUntilRest(die, rng);
    expect(seconds).toBeGreaterThan(0.8);
    expect(seconds).toBeLessThan(3);
  });

  it('waits out its delay before flying off', () => {
    const rng = fixedRng(0.4, 0.6, 0.25);
    const die = makeDie(rng);
    beginRoll(die, die.q, 0.2, rng);
    const height = die.p[1];

    stepDie(die, 1 / 60, rng);
    expect(die.p[1]).toBe(height);
    expect(die.phase).toBe('throw');
  });

  it('counts the time since resting for the highlight', () => {
    const rng = fixedRng(0.5);
    const die = makeDie(rng);
    die.phase = 'rest';
    stepDie(die, 0.25, rng);
    expect(die.restFor).toBeCloseTo(0.25, 6);
  });
});
