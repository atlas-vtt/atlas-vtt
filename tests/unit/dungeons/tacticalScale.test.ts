import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { FIVE_ROOM_STAGES, type DungeonRequest } from '../../../src/app/dungeons/model';
import { floorStack } from '../../../src/app/dungeons/floors/floorStack';
import { FloorTerrain } from '../../../src/app/dungeons/terrain/floorTerrain';
import { draft } from '../../../src/app/dungeons/terrain/catalog';
import { doorProblems, unreachableRooms } from './dungeonInvariants';
import { cellProblems, routeProblems, stairClearanceProblems } from './terrainInvariants';
import { holeProblems } from './holeInvariants';
import { mapLayout, suggestedPxPerCell, SCENE_MAP_PIXELS, MAX_MAP_SIDE } from '../../../src/app/dungeons/render/layoutSize';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';

type ScaleRequest = DungeonRequest & { roomScale: 'standard' | 'tactical' };
const request = (theme: DungeonRequest['theme'], seed = 6271): ScaleRequest => ({
  seed, theme, tags: ['large', 'dry', 'flat', 'square'], floors: 1, fiveRoom: true, roomScale: 'tactical',
});

describe('Tactical room scale', () => {
  for (const theme of ['fortress', 'mansion', 'cavern', 'forest'] as const) {
    it(`keeps five connected stages with more movement space in ${theme}`, () => {
      for (const seed of [6271, 12542, 18813, 25084, 31355, 37626]) {
        const model = generateDungeon(request(theme, seed));
        expect(model.floors).toHaveLength(1);
        const floor = model.floors[0]!;
        const rooms = FIVE_ROOM_STAGES.map(stage => floor.rooms.find(room => room.stage === stage)!);
        expect(rooms.every(Boolean), `seed ${seed}`).toBe(true);
        expect(floor.rooms.filter(room => room.kind === 'room')).toHaveLength(5);
        expect(unreachableRooms(floor)).toEqual([]);
        if (theme === 'fortress') expect(doorProblems(floor, true)).toEqual([]);
        // Caves shape a playable irregular chamber inside and around a larger envelope.
        if (theme === 'fortress' || theme === 'mansion') {
          for (const room of rooms.slice(0, 3)) {
            expect(Math.min(room.w, room.h), `seed ${seed} ${room.stage}`).toBeGreaterThanOrEqual(10);
            expect(Math.max(room.w, room.h)).toBeLessThanOrEqual(14);
          }
          expect(Math.min(rooms[3]!.w, rooms[3]!.h)).toBeGreaterThanOrEqual(16);
          expect(Math.max(rooms[3]!.w, rooms[3]!.h)).toBeLessThanOrEqual(20);
          expect(Math.min(rooms[4]!.w, rooms[4]!.h)).toBeGreaterThanOrEqual(6);
          expect(Math.max(rooms[4]!.w, rooms[4]!.h)).toBeLessThanOrEqual(8);
        } else {
          const standard = generateDungeon({ ...request(theme, seed), roomScale: 'standard' } as ScaleRequest);
          const area = (m: typeof model): number => m.floors[0]!.rooms.reduce((sum, room) => sum + (room.cells?.length ?? room.w * room.h), 0);
          expect(area(model)).toBeGreaterThan(area(standard));
        }
      }
    }, 30_000);
  }

  it('widens ordinary Fortress encounter doors without widening secret doors', () => {
    const floor = generateDungeon(request('fortress')).floors[0]!;
    const doors = floor.doors.filter(door => door.from !== null && door.to !== null && door.kind === 'door');
    expect(doors.length).toBeGreaterThan(0);
    expect(doors.every(door => door.wide !== undefined)).toBe(true);
    expect(floor.doors.filter(door => door.kind === 'secret').every(door => !door.wide)).toBe(true);
  });

  it('reserves a broad path through the center before terrain or props are placed', () => {
    const room = { id: 0, x: 0, y: 0, w: 12, h: 12, kind: 'room' as const, axis: { x: 0, y: 1 } as const, parent: null, group: 0, wing: 'regular' as const, boss: false, colonnade: false, rotunda: false };
    const plan = { roomScale: 'tactical' as const, rooms: [room], doors: [
      { x: 5, y: -1, dir: { x: 0, y: 1 } as const, from: null, to: 0, kind: 'opening' as const },
      { x: 5, y: 12, dir: { x: 0, y: 1 } as const, from: 0, to: null, kind: 'opening' as const },
    ], stairs: [], columns: [] };
    const floor = new FloorTerrain(0, plan, floorStack('down', 1));
    for (const x of [4, 5, 6]) for (let y = 1; y < 11; y++) {
      expect(floor.room(0)!.isFree({ x, y }), `${x},${y}`).toBe(false);
    }
    expect(floor.room(0)!.isFree({ x: 1, y: 1 })).toBe(true);
    expect(floor.place(draft('rubble-heap', 0, [{ x: 5, y: 5 }]))).toBeNull();
  });

  it('keeps Standard compatible and Tactical deterministic', () => {
    const asked = request('fortress');
    const { roomScale: _scale, ...legacy } = asked;
    expect(generateDungeon({ ...legacy, roomScale: 'standard' } as ScaleRequest)).toEqual(generateDungeon(legacy));
    expect(generateDungeon(asked)).toEqual(generateDungeon(asked));
  });

  it('keeps a requested boss on a small upper floor even when a full tactical arena cannot fit', () => {
    for (const seed of [911, 4555, 5466, 7288]) {
      const model = generateDungeon({ seed, theme: 'fortress', roomScale: 'tactical', floors: 4, tags: ['small', 'dry', 'flat'] });
      const bosses = model.floors.flatMap((floor, index) => floor.rooms.filter(room => room.boss).map(room => ({ room, index })));
      expect(bosses, `seed ${seed}`).toHaveLength(1);
      expect(bosses[0]!.index).toBe(model.floors.length - 1);
    }
  }, 30_000);

  it('leaves the climax route clear of structural columns as well as new furnishings', () => {
    const floor = generateDungeon({ ...request('fortress', 1), tags: ['large', 'dry', 'flat', 'colonnades'] }).floors[0]!;
    // This seed's reward door enters the climax through these cells, across a colonnade.
    for (const cell of [{ x: 48, y: 18 }, { x: 47, y: 18 }, { x: 48, y: 19 }]) {
      const obstructs = floor.columns.some(column => {
        const dx = Math.max(cell.x - column.x, 0, column.x - cell.x - 1);
        const dy = Math.max(cell.y - column.y, 0, column.y - cell.y - 1);
        return Math.hypot(dx, dy) < column.radius;
      });
      expect(obstructs, `${cell.x},${cell.y}`).toBe(false);
    }
    expect(floor.columns.length).toBeGreaterThan(0);
  });

  it('keeps ordinary multi-floor maps connected and within image budgets across themes and tags', () => {
    for (const theme of ['fortress', 'mansion', 'cavern', 'forest'] as const) for (let k = 0; k < 12; k++) {
      const asked: ScaleRequest = { ...request(theme, 911 * (k + 1)), floors: 1 + k % 4, fiveRoom: false, tags: k % 2 ? ['large', 'dry', 'flat'] : ['medium', 'wet', 'colonnades', 'round'] };
      const model = generateDungeon(asked);
      const context = `${theme} seed ${asked.seed}, ${asked.floors} floors`;
      expect(model.floors.length, context).toBe(asked.floors);
      const stack = floorStack(theme === 'cavern' || theme === 'forest' ? 'down' : 'up', model.floors.length, model.below ?? 0);
      for (const [index, floor] of model.floors.entries()) {
        expect(unreachableRooms(floor), context).toEqual([]);
        expect(cellProblems(floor), context).toEqual([]);
        expect(routeProblems(floor), context).toEqual([]);
        expect(stairClearanceProblems(floor, index, stack), context).toEqual([]);
      }
      expect(holeProblems(model), context).toEqual([]);
      const px = suggestedPxPerCell(model, 150, DEFAULT_VIEW, SCENE_MAP_PIXELS);
      const image = mapLayout(model, px);
      expect(image.widthPx * image.heightPx).toBeLessThanOrEqual(SCENE_MAP_PIXELS);
      expect(Math.max(image.widthPx, image.heightPx)).toBeLessThanOrEqual(MAX_MAP_SIDE);
    }
  }, 60_000);
});
