import { describe, expect, it } from 'vitest';
import { roomTraits } from '../../../src/app/dungeons/themes/assign/roomTraits';
import { typeGraph } from '../../../src/app/dungeons/themes/assign/typeGraph';
import { hubWithBranches, plannedFloor, rowOfFive } from './plannedFloorFixtures';

const at = (traits: ReturnType<typeof roomTraits>, floor: number, room: number): number => traits.findIndex((t) => t.floor === floor && t.room === room);

describe('room traits', () => {
  it('ranks depth from the entrance across floors', () => {
    const upper = plannedFloor(
      [{ x: 0, y: 0, w: 4, h: 4 }, { x: 5, y: 0, w: 4, h: 4 }, { x: 10, y: 0, w: 4, h: 4 }],
      [[0, 1, 4, 1], [1, 2, 9, 1]],
      [{ x: 11, y: 1, w: 1, h: 2, down: { x: 0, y: 1 }, to: 1, link: 0 }],
    );
    const lower = plannedFloor(
      [{ x: 10, y: 0, w: 4, h: 4 }, { x: 5, y: 0, w: 4, h: 4 }, { x: 0, y: 0, w: 4, h: 4 }],
      [[0, 1, 9, 1], [1, 2, 4, 1]],
      [{ x: 11, y: 1, w: 1, h: 2, down: { x: 0, y: 1 }, to: 0, link: 0 }],
      false,
    );
    const traits = roomTraits([upper, lower]);
    expect(traits).toHaveLength(6);
    const depth = (f: number, r: number): number => traits[at(traits, f, r)]!.depth;
    expect(depth(0, 0)).toBeLessThan(depth(0, 2));
    expect(depth(0, 2)).toBeLessThan(depth(1, 0));
    expect(depth(1, 0)).toBeLessThan(depth(1, 2));
    expect(traits[at(traits, 0, 0)]!.band).toBe('front');
    expect(traits[at(traits, 1, 2)]!.band).toBe('deepest');
    expect(traits.filter((t) => t.band === 'deepest')).toHaveLength(1);
    expect(traits[at(traits, 0, 2)]!.stairs).toBe(true);
    expect(traits[at(traits, 0, 1)]!.stairs).toBe(false);
  });

  it('classes size within its floor', () => {
    const floor = plannedFloor(
      [{ x: 0, y: 0, w: 2, h: 2 }, { x: 3, y: 0, w: 3, h: 3 }, { x: 7, y: 0, w: 4, h: 4 }, { x: 12, y: 0, w: 5, h: 5 }, { x: 18, y: 0, w: 6, h: 6 }, { x: 25, y: 0, w: 4, h: 5 }],
      [[0, 1, 2, 0], [1, 2, 6, 0], [2, 3, 11, 0], [3, 4, 17, 0], [4, 5, 24, 0]],
    );
    const traits = roomTraits([floor]);
    expect(traits[0]!.size).toBe('tiny');
    expect(traits[4]!.size).toBe('largest');
    expect(traits[3]!.size).toBe('large');
    expect(traits[1]!.size).toBe('small');
    expect(traits[2]!.size).toBe('medium');
  });

  it('counts doors and reads the degree, the shape and the outer walls', () => {
    const traits = roomTraits([rowOfFive()]);
    expect(traits.map((t) => t.degree)).toEqual(['through', 'through', 'through', 'through', 'dead-end']);
    expect(traits.every((t) => t.outerWall)).toBe(true);
    const long = roomTraits([plannedFloor([{ x: 0, y: 0, w: 8, h: 3 }, { x: 9, y: 0, w: 3, h: 3 }], [[0, 1, 8, 1]])]);
    expect(long[0]!.long).toBe(true);
    expect(long[1]!.square).toBe(true);
  });

  it('finds a room on an outer wall', () => {
    const plus = plannedFloor(
      [{ x: 5, y: 5, w: 4, h: 4 }, { x: 0, y: 5, w: 4, h: 4 }, { x: 5, y: 0, w: 4, h: 4 }, { x: 5, y: 10, w: 4, h: 4 }, { x: 10, y: 5, w: 4, h: 4 }],
      [[0, 1, 4, 6], [0, 2, 6, 4], [0, 3, 6, 9], [0, 4, 9, 6]],
    );
    const traits = roomTraits([plus]);
    expect(traits[0]!.outerWall).toBe(false);
    expect(traits[1]!.outerWall).toBe(true);
    expect(traits[0]!.degree).toBe('hub');
  });
});

describe('the type graph', () => {
  it('joins rooms through corridors only', () => {
    const floors = [hubWithBranches()];
    const traits = roomTraits(floors);
    const graph = typeGraph(floors, traits);
    const i = (room: number): number => at(traits, 0, room);
    expect(traits.map((t) => t.room)).toEqual([0, 1, 2, 4, 5]);
    expect([...graph.next(i(4))]).toEqual([i(1)]);
    expect([...graph.next(i(1))].sort()).toEqual([i(0), i(2), i(4), i(5)].sort());
    expect(graph.next(i(0))).not.toContain(i(2));
    expect([...graph.near(i(0))].sort()).toEqual([i(1), i(2), i(4), i(5)].sort());
    const row = [rowOfFive()];
    const rowGraph = typeGraph(row, roomTraits(row));
    expect([...rowGraph.next(2)].sort()).toEqual([1, 3]);
    expect([...rowGraph.near(0)].sort()).toEqual([1, 2]);
  });

  it('tells the branches of a hub apart and puts the way back to the entrance on no branch', () => {
    const floors = [hubWithBranches()];
    const traits = roomTraits(floors);
    const graph = typeGraph(floors, traits);
    const i = (room: number): number => at(traits, 0, room);
    const hub = i(1);
    expect(graph.branchOf(hub, i(2))).toBe(i(2));
    expect(graph.branchOf(hub, i(4))).toBe(i(4));
    expect(graph.branchOf(hub, i(5))).toBe(i(5));
    expect(graph.branchOf(hub, i(0))).toBeNull();
    expect(graph.branchOf(hub, hub)).toBeNull();
    expect(graph.pathAvoids(i(2), i(4), i(5))).toBe(true);
    expect(graph.pathAvoids(i(2), i(4), hub)).toBe(false);
  });

  it('follows a branch down its stairwell to the floor below', () => {
    const upper = plannedFloor(
      [{ x: 0, y: 0, w: 4, h: 4 }, { x: 5, y: 0, w: 6, h: 6 }, { x: 12, y: 0, w: 4, h: 4 }, { x: 5, y: 7, w: 4, h: 4 }],
      [[0, 1, 4, 1], [1, 2, 11, 1], [1, 3, 6, 6]],
      [{ x: 13, y: 1, w: 1, h: 2, down: { x: 0, y: 1 }, to: 1, link: 0 }],
    );
    const lower = plannedFloor([{ x: 12, y: 0, w: 4, h: 4 }, { x: 17, y: 0, w: 4, h: 4 }], [[0, 1, 16, 1]], [{ x: 13, y: 1, w: 1, h: 2, down: { x: 0, y: 1 }, to: 0, link: 0 }], false);
    const floors = [upper, lower];
    const traits = roomTraits(floors);
    const graph = typeGraph(floors, traits);
    expect(graph.branchOf(at(traits, 0, 1), at(traits, 1, 1))).toBe(at(traits, 0, 2));
    expect(graph.next(at(traits, 1, 0))).toEqual([at(traits, 1, 1)]);
  });
});
