import { describe, expect, it } from 'vitest';
import { stairWays } from '../../../../src/app/dungeons/layout/cavern/stairWays';
import { floorStack } from '../../../../src/app/dungeons/floors/floorStack';
import type { DungeonRoom, DungeonStair } from '../../../../src/app/dungeons/model';
import { rngFrom } from '../../../../src/app/dungeons/rng';
import { room } from '../plannedFloorFixtures';

/** A short stairwell's end in a chamber of cells 1..8 × 1..8 on each floor, leading to `to`. */
const end = (to: number): DungeonStair => ({ x: 3, y: 3, w: 2, h: 1, down: { x: 1, y: 0 }, to, link: 1 });
const chamber = (down: number[]): DungeonRoom => ({ ...room(0, { x: 0, y: 0, w: 10, h: 10 }), vertical: { up: [], down: down.map((width) => ({ width, depth: 10 })) } });

describe('the way between two cave floors', () => {
  it('is a pitch wherever the chamber at its upper end rolled a shaft wide enough to stand in, whichever way the floors are stacked', () => {
    for (let seed = 1; seed <= 40; seed++) {
      // Floors stacked downwards: floor 0 lies above floor 1, and its chamber holds the shaft.
      const down = [{ stairs: [end(1)], rooms: [chamber([6])] }, { stairs: [end(0)], rooms: [chamber([])] }];
      stairWays(rngFrom(seed), down, floorStack('down', 2));
      expect(down[0]!.stairs[0]!.way, `seed ${seed} down`).toBe('pitch');
      // Floors stacked upwards: floor 1 lies above floor 0, so its chamber is the one the stairwell leaves from.
      const up = [{ stairs: [end(1)], rooms: [chamber([])] }, { stairs: [end(0)], rooms: [chamber([6])] }];
      stairWays(rngFrom(seed), up, floorStack('up', 2));
      expect(up[1]!.stairs[0]!.way, `seed ${seed} up`).toBe('pitch');
    }
  });

  it('leaves a short stairwell a scree slope now and then where the chamber below rolled the shaft', () => {
    const ways = Array.from({ length: 40 }, (_, k) => {
      const up = [{ stairs: [end(1)], rooms: [chamber([6])] }, { stairs: [end(0)], rooms: [chamber([])] }];
      stairWays(rngFrom(k + 1), up, floorStack('up', 2));
      return up[0]!.stairs[0]!.way;
    });
    expect(ways).toContain('scree');
  });
});
