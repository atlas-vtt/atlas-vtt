import { describe, expect, it } from 'vitest';
import { planFloors } from '../../../../src/app/dungeons/floors/planFloors';
import { caveParams, caveVariant } from '../../../../src/app/dungeons/layout/cavern/caveParams';
import { faultDirections, faultLines, nearFault } from '../../../../src/app/dungeons/layout/cavern/faults';
import { dungeonParams, dungeonTags } from '../../../../src/app/dungeons/params';
import { floorColumns } from '../../../../src/app/dungeons/props';
import { stream } from '../../../../src/app/dungeons/rng';
import { type DungeonTag, readTags } from '../../../../src/app/dungeons/tags';

const tags = (list: string[]): ReadonlySet<DungeonTag> => new Set(readTags(list));
const TAG_SETS: string[][] = [[], ['small'], ['large'], ['round', 'colonnades'], ['deep', 'winding'], ['cramped'], ['lava']];

describe('a cavern’s params', () => {
  it('pick the variant by the tags', () => {
    expect(caveVariant(tags(['lava', 'large']))).toBe('lava-tube');
    expect(caveVariant(tags(['deep']))).toBe('underdark');
    expect(caveVariant(tags(['spacious']))).toBe('underdark');
    expect(caveVariant(tags([]))).toBe('limestone');
  });

  it('build no round rooms and no colonnades, and mark the params as a cave’s', () => {
    const params = caveParams(dungeonParams(readTags(['round', 'colonnades'])));
    expect(params.rotundaFactor).toBe(0);
    expect(params.colonnadeFactor).toBe(0);
    expect(params.cave?.variant).toBe('limestone');
    expect(params.minRoomFloor).toBe(3);
    expect(params.stairAcross).toBe(2);
  });

  it('give rooms a floor of 3 or more each way and the stairwell down 2 across, and stand no columns', () => {
    let floors = 0;
    for (let k = 1; floors < 1000; k++) {
      const seed = k * 7_919;
      const params = caveParams(dungeonParams(dungeonTags(seed, TAG_SETS[k % TAG_SETS.length]!)));
      for (const [index, floor] of planFloors(seed, params, 1 + (k % 3), true).entries()) {
        floors++;
        for (const room of floor.rooms) {
          expect(room.rotunda || room.colonnade).toBe(false);
          if (room.kind === 'room') expect(Math.min(room.w, room.h), `seed ${seed}`).toBeGreaterThanOrEqual(3);
        }
        // The first stairwell between two floors is the way down the main path takes; a second one may be narrower.
        const down = floor.stairs.filter((s) => s.to === index + 1).sort((a, b) => a.link - b.link)[0];
        if (down) expect(Math.min(down.w, down.h)).toBeGreaterThanOrEqual(2);
        expect(floorColumns(seed, index, floor.rooms, floor.stairs, params)).toEqual([]);
      }
    }
  }, 120_000);

  it('run along one or two fault directions, the second 60–90° from the first', () => {
    const params = caveParams(dungeonParams(readTags([])));
    for (let seed = 1; seed <= 200; seed++) {
      const rooms = planFloors(seed, params, 1, true)[0]!.rooms;
      const angles = faultDirections(stream(seed, 'cave', 'faults'), rooms);
      expect(angles).toEqual(faultDirections(stream(seed, 'cave', 'faults'), rooms));
      expect(angles.length === 1 || angles.length === 2).toBe(true);
      if (angles.length === 2) {
        let between = Math.abs(angles[1]! - angles[0]!) % Math.PI;
        between = Math.min(between, Math.PI - between);
        expect(between).toBeGreaterThanOrEqual((60 * Math.PI) / 180 - 1e-9);
        expect(between).toBeLessThanOrEqual((90 * Math.PI) / 180 + 1e-9);
      }
      const lines = faultLines(stream(seed, 'cave', 'lines'), { rooms }, angles);
      const normal = rooms.filter((room) => room.kind === 'room').length;
      expect(lines).toHaveLength(1 + Math.floor(normal / 8));
      for (const line of lines) expect(angles.some((a) => nearFault(line.angle, [a], 1e-9))).toBe(true);
    }
  });

  it('tell an angle near a fault, either way along it', () => {
    expect(nearFault(0.1, [0], 0.2)).toBe(true);
    expect(nearFault(Math.PI - 0.1, [0], 0.2)).toBe(true);
    expect(nearFault(Math.PI / 2, [0], 0.2)).toBe(false);
  });
});
