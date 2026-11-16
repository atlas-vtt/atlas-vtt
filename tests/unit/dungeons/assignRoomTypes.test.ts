import { describe, expect, it } from 'vitest';
import { planFloors } from '../../../src/app/dungeons/floors/planFloors';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { dungeonParams } from '../../../src/app/dungeons/params';
import { assignRoomTypes } from '../../../src/app/dungeons/themes/assign/assignRoomTypes';
import { FORTRESS } from '../../../src/app/dungeons/themes/fortress';
import { MANSION } from '../../../src/app/dungeons/themes/mansion';
import { NO_FACTS } from '../../../src/app/dungeons/themes/themes';
import type { RoomProgramme, ThemeFacts } from '../../../src/app/dungeons/themes/themeTypes';
import { normals } from './dungeonInvariants';
import { keep } from './plannedFloorFixtures';
import { entranceRoom, typeOf } from './themeInvariants';

const PROGRAMMES: [string, 'fortress' | 'mansion', RoomProgramme][] = [['Fortress', 'fortress', FORTRESS], ['Haunted Mansion', 'mansion', MANSION]];

describe.each(PROGRAMMES)('room types of a %s', (_, theme, programme) => {
  it('types every normal room and no corridor', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const model = generateDungeon({ seed, theme, tags: [], floors: 1 + (seed % 3) });
      for (const floor of model.floors) for (const room of floor.rooms) expect(Boolean(room.type), `seed ${seed} room ${room.id}`).toBe(room.kind === 'room');
    }
  });

  it('types every room of small dungeons and five-room dungeons', () => {
    const climaxes = new Set(programme.climax.map((c) => c.type));
    const entrances = new Set(programme.entrance.map(([id]) => id));
    const requests = [
      ...Array.from({ length: 300 }, (_, k) => ({ seed: k * 7 + 1, theme, tags: ['small'], floors: 1 })),
      ...Array.from({ length: 100 }, (_, k) => ({ seed: k * 11 + 5, theme, tags: [], floors: 1, fiveRoom: true })),
    ];
    for (const request of requests) {
      const model = generateDungeon(request);
      const floor = model.floors[0]!;
      expect(normals(floor).every((room) => room.type), `seed ${request.seed}`).toBe(true);
      expect(entrances.has(typeOf(model, entranceRoom(model)) as never), `seed ${request.seed}`).toBe(true);
      const boss = floor.rooms.find((room) => room.boss);
      if (boss) expect(climaxes.has(boss.type as never), `seed ${request.seed}: ${boss.type}`).toBe(true);
    }
  });

  it('is the same for the same seed', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const floors = planFloors(seed, dungeonParams([]), 2, true, false);
      const input = { seed, programme, floors, ruined: false, facts: NO_FACTS };
      expect(assignRoomTypes(input)).toEqual(assignRoomTypes(input));
    }
  });

  it('keeps the empty share between 0.24 and 0.36', () => {
    let empty = 0;
    let rooms = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const floors = planFloors(seed, dungeonParams([]), 1 + (seed % 3), true, false);
      const typed = assignRoomTypes({ seed, programme, floors, ruined: false, facts: NO_FACTS });
      empty += typed.empty.reduce((sum, set) => sum + set.size, 0);
      rooms += floors.reduce((sum, floor) => sum + floor.rooms.filter((room) => room.kind === 'room').length, 0);
    }
    expect(empty / rooms).toBeGreaterThanOrEqual(0.24);
    expect(empty / rooms).toBeLessThanOrEqual(0.36);
  });
});

describe('room types and the theme facts', () => {
  it('puts a type where the facts score it best', () => {
    // Room 5 suits the library and nothing else.
    const facts: ThemeFacts = { ...NO_FACTS, score: (type, room) => (room.room !== 5 ? 0 : type === 'library' ? 5 : -20) };
    let library = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const typed = assignRoomTypes({ seed, programme: FORTRESS, floors: [keep()], ruined: false, facts });
      if (typed.byFloor[0]?.get(5) === 'library') library++;
      const plain = assignRoomTypes({ seed, programme: FORTRESS, floors: [keep()], ruined: false, facts: NO_FACTS });
      expect(assignRoomTypes({ seed, programme: FORTRESS, floors: [keep()], ruined: false, facts: { allows: () => true, score: () => 0, placeAllowed: () => true, richness: () => 1 } })).toEqual(plain);
    }
    expect(library).toBeGreaterThan(30);
  });

  it('places no type the facts refuse', () => {
    const facts: ThemeFacts = { ...NO_FACTS, allows: (type) => type !== 'chapel' && type !== 'library' };
    for (let seed = 1; seed <= 40; seed++) {
      const typed = assignRoomTypes({ seed, programme: FORTRESS, floors: [keep()], ruined: false, facts });
      expect([...typed.byFloor[0]!.values()]).not.toContain('chapel');
      expect([...typed.byFloor[0]!.values()]).not.toContain('library');
    }
  });
});

describe('small dungeons whose entrance room could be the boss room', () => {
  it('give the boss room its climax type and the entrance another room', () => {
    for (const theme of ['fortress', 'mansion'] as const) {
      const programme = theme === 'fortress' ? FORTRESS : MANSION;
      const climaxes = new Set(programme.climax.map((c) => c.type));
      for (const seed of [454, 839, 972, 11329324]) {
        const model = generateDungeon({ seed, theme, tags: ['small'], floors: 1 });
        const boss = model.floors[0]!.rooms.find((room) => room.boss);
        expect(boss && climaxes.has(boss.type as never), `${theme} seed ${seed}: boss is a ${boss?.type}`).toBe(true);
        const hazards = model.floors[0]!.terrain.filter((p) => p.room === boss?.id && p.traits.hazard !== undefined);
        expect(hazards, `${theme} seed ${seed}`).toEqual([]);
      }
    }
  });
});
