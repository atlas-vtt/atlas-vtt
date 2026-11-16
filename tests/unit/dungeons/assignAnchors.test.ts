import { describe, expect, it } from 'vitest';
import type { PlannedFloor } from '../../../src/app/dungeons/floors/planFloors';
import { stream } from '../../../src/app/dungeons/rng';
import { placeAnchors, placePivot, placeStairRooms } from '../../../src/app/dungeons/themes/assign/anchors';
import { placeClusters } from '../../../src/app/dungeons/themes/assign/clusters';
import { type Assignment, adjacencyScore, breaksHardRule, newAssignment, roomScore } from '../../../src/app/dungeons/themes/assign/score';
import { FORTRESS } from '../../../src/app/dungeons/themes/fortress';
import { MANSION } from '../../../src/app/dungeons/themes/mansion';
import { NO_FACTS } from '../../../src/app/dungeons/themes/themes';
import type { RoomProgramme, ThemeFacts } from '../../../src/app/dungeons/themes/themeTypes';
import { keep, keepFloors } from './plannedFloorFixtures';

const SEEDS = Array.from({ length: 120 }, (_, k) => k + 1);

function anchored(seed: number, floors: readonly PlannedFloor[], programme: RoomProgramme, facts: ThemeFacts = NO_FACTS): Assignment {
  const a = newAssignment(floors, programme, facts, false);
  placeAnchors(stream(seed, 'rooms', 'anchors'), a);
  placePivot(a);
  placeStairRooms(a);
  placeClusters(stream(seed, 'rooms', 'clusters'), a);
  return a;
}

const index = (a: Assignment, floor: number, room: number): number => a.traits.findIndex((t) => t.floor === floor && t.room === room);
const roomOf = (a: Assignment, type: string): number => a.types.indexOf(type as never);

describe('anchors', () => {
  it('types the entrance room with the entrance type and the boss room with a climax type', () => {
    for (const seed of SEEDS) {
      const a = anchored(seed, [keep()], FORTRESS);
      expect(a.types[index(a, 0, 0)]).toBe('gatehouse');
      expect(['throne-room', 'great-hall', 'chapel']).toContain(a.types[index(a, 0, 7)]);
      expect(a.climax?.type).toBe(a.types[index(a, 0, 7)]);
      expect(a.fixed[index(a, 0, 0)] && a.fixed[index(a, 0, 7)]).toBe(true);
    }
  });

  it('never draws the ballroom as climax off the entrance floor', () => {
    const climaxes = new Set(SEEDS.map((seed) => anchored(seed, keepFloors(2), MANSION).climax?.type));
    expect(climaxes.has('ballroom')).toBe(false);
    expect(climaxes.size).toBe(2);
    expect(new Set(SEEDS.map((seed) => anchored(seed, [keep()], MANSION).climax?.type)).has('ballroom')).toBe(false);
    // A ballroom is the largest room of its floor: the boss room must be it.
    const floor = keep();
    const grand = { ...floor, rooms: floor.rooms.map((r) => (r.boss ? { ...r, w: 10 } : r)) };
    expect(new Set(SEEDS.map((seed) => anchored(seed, [grand], MANSION).climax?.type)).has('ballroom')).toBe(true);
  });

  it('makes the largest front room the great hall and falls back to the lower hall when the climax took it', () => {
    const runs = SEEDS.map((seed) => anchored(seed, [keep()], FORTRESS));
    for (const a of runs) {
      expect(a.pivot).toBe(index(a, 0, 1));
      expect(a.types[index(a, 0, 1)]).toBe(a.climax?.type === 'great-hall' ? 'lower-hall' : 'great-hall');
    }
    expect(runs.some((a) => a.climax?.type === 'great-hall')).toBe(true);
  });

  it('makes the Mansion entrance hall its pivot', () => {
    const a = anchored(3, [keep()], MANSION);
    expect(a.types[a.pivot ?? -1]).toBe('entrance-hall');
    expect(a.pivot).toBe(index(a, 0, 0));
  });
});

describe('clusters', () => {
  it('puts the kitchen next to the great hall and the buttery next to the kitchen', () => {
    for (const seed of SEEDS) {
      const a = anchored(seed, [keep()], FORTRESS);
      const kitchen = roomOf(a, 'kitchen');
      expect(a.graph.next(a.pivot ?? -1)).toContain(kitchen);
      expect(a.graph.next(kitchen)).toContain(roomOf(a, 'buttery'));
    }
  });

  it('keeps the private core off the service branch, also on the floors its stairs lead to', () => {
    // The kitchen may stand only in room 4, whose branch holds the one stairwell down (in room 5).
    const stair = { x: 12, y: 8, w: 1, h: 2, down: { x: 0, y: 1 } as const, link: 0 };
    const [upper, lower] = keepFloors(2) as [PlannedFloor, PlannedFloor];
    const floors = [{ ...upper, stairs: [{ ...stair, to: 1 }] }, { ...lower, stairs: [{ ...stair, to: 0 }] }];
    const facts: ThemeFacts = { ...NO_FACTS, allows: (type, room) => type !== 'kitchen' || (room.floor === 0 && room.room === 4) };
    for (const seed of SEEDS.slice(0, 30)) {
      const a = anchored(seed, floors, FORTRESS, facts);
      expect(a.types[index(a, 0, 4)]).toBe('kitchen');
      expect(a.types).not.toContain('solar');
    }
  });

  it('puts the private cluster on another branch than the service cluster', () => {
    for (const seed of SEEDS) {
      const a = anchored(seed, [keep()], FORTRESS);
      const solar = roomOf(a, 'solar');
      if (solar < 0) continue;
      expect(a.graph.branchOf(a.pivot ?? -1, solar)).not.toBe(a.graph.branchOf(a.pivot ?? -1, roomOf(a, 'kitchen')));
    }
  });
});

describe('scores and hard rules', () => {
  it('scores a never-adjacent pair −10', () => {
    const a = newAssignment([keep()], FORTRESS, NO_FACTS, false);
    a.types[index(a, 0, 2)] = 'kitchen';
    const alone = adjacencyScore(a, index(a, 0, 2));
    a.types[index(a, 0, 3)] = 'chapel';
    expect(adjacencyScore(a, index(a, 0, 2)) - alone).toBe(-10);
    expect(breaksHardRule(a, index(a, 0, 3), 'chapel')).toBe(true);
  });

  it('refuses a type on a floor its rule forbids', () => {
    const a = newAssignment(keepFloors(2), FORTRESS, NO_FACTS, false);
    expect(breaksHardRule(a, index(a, 1, 2), 'kitchen')).toBe(true);
    expect(breaksHardRule(a, index(a, 0, 2), 'kitchen')).toBe(false);
    expect(breaksHardRule(a, index(a, 0, 2), 'solar')).toBe(true);
    expect(breaksHardRule(a, index(a, 1, 2), 'solar')).toBe(false);
    expect(breaksHardRule(a, index(a, 0, 2), 'throne-room')).toBe(true);
    expect(breaksHardRule(a, index(a, 1, 2), 'throne-room')).toBe(true);
    expect(breaksHardRule(a, index(a, 1, 7), 'throne-room')).toBe(false);
    expect(breaksHardRule(a, index(a, 0, 2), 'collapsed-room')).toBe(true);
  });

  it('asks the theme facts', () => {
    const library = index(newAssignment([keep()], FORTRESS, NO_FACTS, false), 0, 5);
    const facts: ThemeFacts = {
      ...NO_FACTS,
      allows: (type) => type !== 'chapel',
      score: (type, room) => (type === 'library' && room.room === 5 ? 5 : 0),
    };
    for (const seed of SEEDS) {
      const a = anchored(seed, [keep()], FORTRESS, facts);
      expect(a.types).not.toContain('chapel');
      expect(breaksHardRule(a, library, 'chapel')).toBe(true);
      expect(roomScore(a, library, 'library') - roomScore({ ...a, facts: NO_FACTS }, library, 'library')).toBe(5);
    }
    const plain: ThemeFacts = { allows: () => true, score: () => 0, placeAllowed: () => true, richness: () => 1 };
    for (const seed of SEEDS.slice(0, 20)) expect(anchored(seed, [keep()], FORTRESS, plain).types).toEqual(anchored(seed, [keep()], FORTRESS).types);
  });

  it('fills a per-floor type once on each floor', () => {
    const programme: RoomProgramme = {
      ...FORTRESS,
      rooms: FORTRESS.rooms.map((spec) => (spec.id === 'storeroom' ? { ...spec, count: [0, 1] as const, perFloor: true as const, floor: undefined } : spec)),
    };
    const a = newAssignment(keepFloors(3), programme, NO_FACTS, false);
    a.types[index(a, 0, 3)] = 'storeroom';
    expect(breaksHardRule(a, index(a, 0, 5), 'storeroom')).toBe(true);
    expect(breaksHardRule(a, index(a, 1, 5), 'storeroom')).toBe(false);
    a.types[index(a, 1, 5)] = 'storeroom';
    expect(breaksHardRule(a, index(a, 2, 5), 'storeroom')).toBe(false);
    expect(breaksHardRule(a, index(a, 1, 3), 'storeroom')).toBe(true);
  });
});
