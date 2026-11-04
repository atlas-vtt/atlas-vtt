import { describe, expect, it } from 'vitest';
import { floorBelow, stackOf } from '../../../src/app/dungeons/floors/floorStack';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { CellPoint, DungeonFloor, DungeonModel, DungeonRoom, DungeonStair, DungeonTerrain } from '../../../src/app/dungeons/model';
import type { ThemeId } from '../../../src/app/dungeons/themes/themeTypes';
import { FEATURES, type FeatureSpec } from '../../../src/app/dungeons/themes/features';
import { THEMES } from '../../../src/app/dungeons/themes/themes';
import { opensAbove } from './holeInvariants';
import { inFloor, walkable } from './terrainInvariants';

/**
 * Openings cut in the floor above a room for that room's reason (design: "Every feature has a
 * reason"): a Fortress's minstrels' gallery over the great hall and murder holes over the gate
 * passage, a Mansion's stair well over the entrance hall and gallery over the ballroom. Built:
 * straight-edged and aligned to the walls; galleries and wells have a balustrade on floor round
 * them, murder holes are single cells in a row along the passage.
 */

const key = (c: CellPoint): string => `${c.x},${c.y}`;
const STEPS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

function runs(theme: ThemeId): DungeonModel[] {
  return Array.from({ length: 400 }, (_, k) => generateDungeon({ seed: (k + 1) * 5153 + theme.length, theme, tags: k % 3 === 0 ? ['large'] : [], floors: 2 + (k % 2) }));
}

/** The opening and the room right below it it was cut for. */
function openings(model: DungeonModel, kind: DungeonTerrain['kind']): { k: number; piece: DungeonTerrain; hall: DungeonRoom; below: DungeonFloor }[] {
  const stack = stackOf(model);
  return model.floors.flatMap((floor, k) => {
    const under = floorBelow(stack, k);
    const below = model.floors[under ?? -1];
    return floor.terrain.filter((p) => p.kind === kind).flatMap((piece) => {
      const hall = below?.rooms.find((r) => r.kind === 'room' && piece.cells.every((c) => inFloor(r, c)));
      return hall && below && !hall.boss ? [{ k, piece, hall, below }] : [];
    });
  });
}

/** The reason a hall has for a gallery in the floor above it. */
function galleryReason(model: DungeonModel, hall: DungeonRoom): FeatureSpec | undefined {
  const spec = THEMES[model.theme].programme?.rooms.find((s) => s.id === hall.type);
  return (spec?.terrain.features ?? []).map((r) => FEATURES[r]).find((r) => r.at === 'above' && r.kinds.includes('gallery'));
}

function isRectangle(cells: readonly CellPoint[]): boolean {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  return (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1) === new Set(cells.map(key)).size;
}

/** Of a rectangle of cells, how many sides lie on the walls of `room`. */
function sidesOnWalls(cells: readonly CellPoint[], room: DungeonRoom): number {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  return [Math.min(...xs) === room.x, Math.max(...xs) === room.x + room.w - 1, Math.min(...ys) === room.y, Math.max(...ys) === room.y + room.h - 1].filter(Boolean).length;
}

const stairCells = (s: DungeonStair): CellPoint[] => Array.from({ length: s.w * s.h }, (_, i) => ({ x: s.x + (i % s.w), y: s.y + Math.floor(i / s.w) }));

/** Whether two rooms' floors overlap by two cells or more both ways. */
function overlapsTwoByTwo(a: DungeonRoom, b: DungeonRoom): boolean {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w >= 2 && h >= 2;
}

/** Whether a room above covers two cells of a gate passage a cell apart: the passage from the gatehouse's door in, straight across it. */
function coversGateRow(over: DungeonRoom, gate: DungeonRoom, floor: DungeonFloor): boolean {
  const door = floor.doors.find((d) => d.from === null && d.to === gate.id) ?? floor.doors.find((d) => d.to === gate.id);
  if (!door) return false;
  const way: CellPoint[] = [];
  for (let at = { x: door.x + door.dir.x, y: door.y + door.dir.y }; inFloor(gate, at); at = { x: at.x + door.dir.x, y: at.y + door.dir.y }) way.push(at);
  return [0, 1].some((first) => way.filter((c, t) => t % 2 === first && inFloor(over, c)).length >= 2);
}

/** Whether `cells` lie beside the stairwell `s`, along its run: next to one of its long sides, as long as it is. */
function besideStairs(cells: readonly CellPoint[], s: DungeonStair): boolean {
  const along = s.down.x !== 0 ? (c: CellPoint) => c.x >= s.x && c.x < s.x + s.w : (c: CellPoint) => c.y >= s.y && c.y < s.y + s.h;
  const across = s.down.x !== 0 ? (c: CellPoint) => c.y === s.y - 1 || c.y === s.y + s.h : (c: CellPoint) => c.x === s.x - 1 || c.x === s.x + s.w;
  const near = s.down.x !== 0 ? (c: CellPoint) => c.y >= s.y - 2 && c.y <= s.y + s.h + 1 : (c: CellPoint) => c.x >= s.x - 2 && c.x <= s.x + s.w + 1;
  return cells.every((c) => along(c) && near(c)) && cells.some(across);
}

describe('openings above a room, for its reason', () => {
  const fortresses = runs('fortress');
  const mansions = runs('mansion');
  const all = [...fortresses, ...mansions];

  it('cut galleries and stair wells straight, inside the hall below, along its walls or the walls of their own room', () => {
    const problems = all.flatMap((m) =>
      openings(m, 'gallery').flatMap(({ k, piece, hall, below }) => {
        const own = m.floors[k]!.rooms[piece.room]!;
        const where = `seed ${m.seed} floor ${k} gallery ${piece.id}`;
        // A light well opens for its own room's reason (below), whatever lies under it.
        if (piece.name === 'dungeon.terrain.lightWell') return [];
        if (!opensAbove(m, hall, 'gallery')) return [`${where} over a ${hall.type}, which has no reason for it`];
        const reason = galleryReason(m, hall);
        if (!(reason?.cutIn ?? []).includes(own.type!)) return [`${where} cut in a ${own.type}, which does not overlook a hall`];
        if (!isRectangle(piece.cells)) return [`${where} is not straight-edged`];
        // A stair well follows the stairs it opens round; a gallery the walls.
        const stairs = below.stairs.some((s) => s.to === k && besideStairs(piece.cells, s));
        return stairs || sidesOnWalls(piece.cells, hall) + sidesOnWalls(piece.cells, own) > 0 ? [] : [`${where} follows no wall`];
      }),
    );
    expect(problems.slice(0, 10)).toEqual([]);
    // Measured 287 of 800 with a gallery or stair well over a hall (19 before rooms above were typed to overlook one).
    expect(all.filter((m) => openings(m, 'gallery').some(({ piece }) => piece.name !== 'dungeon.terrain.lightWell')).length).toBeGreaterThan(200);
  });

  it('stand a balustrade on floor round every gallery and well, where the room above can be walked', () => {
    const problems = all.flatMap((m) =>
      m.floors.flatMap((floor, k) =>
        floor.terrain.filter((p) => p.kind === 'gallery').flatMap((piece) => {
          const room = floor.rooms[piece.room]!;
          const hole = new Set(piece.cells.map(key));
          const open = walkable(floor);
          const rim = piece.cells.flatMap((c) => STEPS.map((d) => ({ x: c.x + d.x, y: c.y + d.y }))).filter((c) => !hole.has(key(c)) && inFloor(room, c) && open.has(key(c)));
          return rim.length >= 2 ? [] : [`seed ${m.seed} floor ${k} gallery ${piece.id} has no floor to stand at its balustrade`];
        }),
      ),
    );
    expect(problems.slice(0, 10)).toEqual([]);
  });

  it('cut murder holes over the gate passage, single cells in a row with a cell between them', () => {
    let rows = 0;
    const problems = fortresses.flatMap((m) => {
      const holes = openings(m, 'murder-hole');
      if (holes.length === 0) return [];
      rows += 1;
      const gate = holes[0]!.hall;
      const door = holes[0]!.below.doors.find((d) => d.to === gate.id && d.from === null) ?? holes[0]!.below.doors.find((d) => d.to === gate.id);
      const where = `seed ${m.seed}`;
      if (gate.type !== 'gatehouse' || !door) return [`${where}: murder holes over a ${gate.type}`];
      const out: string[] = [];
      if (holes.length < 2) out.push(`${where}: a single murder hole`);
      for (const { piece } of holes) {
        const c = piece.cells[0]!;
        if (piece.cells.length !== 1) out.push(`${where}: a murder hole of ${piece.cells.length} cells`);
        const along = door.dir.x !== 0 ? c.y === door.y && Math.sign(c.x - door.x) === door.dir.x : c.x === door.x && Math.sign(c.y - door.y) === door.dir.y;
        if (!along) out.push(`${where}: a murder hole at ${key(c)} off the passage from the door at ${door.x},${door.y}`);
      }
      const cells = holes.map(({ piece }) => piece.cells[0]!);
      if (cells.some((a, i) => cells.some((b, j) => i !== j && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1))) out.push(`${where}: murder holes side by side`);
      if (holes.some(({ piece }) => piece.traits.hazard !== undefined)) out.push(`${where}: a murder hole as a hazard`);
      return out;
    });
    expect(problems.slice(0, 10)).toEqual([]);
    // Measured 0.48: the stairs up rise from the gatehouse, so the gate chamber above lies over the passage.
    expect(rows / fortresses.length).toBeGreaterThan(0.4);
  });

  it('type a room above that covers a hall or a gate passage as one built to overlook it', () => {
    let covered = 0;
    let overlooking = 0;
    for (const m of all) {
      const stack = stackOf(m);
      m.floors.forEach((upper, k) => {
        const under = floorBelow(stack, k);
        const below = m.floors[under ?? -1];
        if (!below) return;
        for (const hall of below.rooms.filter((r) => !r.boss)) {
          const reason = (THEMES[m.theme].programme?.rooms.find((spec) => spec.id === hall.type)?.terrain.features ?? []).map((r) => FEATURES[r]).find((r) => r.at === 'above' && r.cutIn);
          if (!reason) continue;
          const covers = reason.kinds.includes('murder-hole') ? (r: DungeonRoom) => coversGateRow(r, hall, below) : (r: DungeonRoom) => overlapsTwoByTwo(r, hall);
          const over = upper.rooms.filter((r) => r.kind === 'room' && r.wing === 'regular' && !r.rotunda && !r.boss && r.stage === undefined && covers(r));
          if (over.length === 0) continue;
          covered += 1;
          if (over.some((r) => reason.cutIn!.includes(r.type!))) overlooking += 1;
        }
      });
    }
    // Measured 0.68 before rooms above were typed for it (the halls alone: murder holes named no room).
    expect(overlooking / covered).toBeGreaterThan(0.85);
  });

  it("show a minstrels' gallery or murder holes in about half the Fortresses of several floors, and a stair well or a ballroom's gallery in most Mansions", () => {
    const seen = (models: readonly DungeonModel[], opens: (m: DungeonModel) => boolean): number => models.filter(opens).length / models.length;
    const fortress = seen(fortresses, (m) => m.floors.some((f) => f.terrain.some((p) => p.name === 'dungeon.terrain.minstrelsGallery' || p.kind === 'murder-hole')));
    const mansion = seen(mansions, (m) => openings(m, 'gallery').some(({ piece, hall }) => piece.name === 'dungeon.terrain.stairWell' || hall.type === 'ballroom'));
    // Measured 0.095 and 0.25 before; 0.52 and 0.65 since the stairs up rise from the gatehouse or entrance
    // hall with the room above over it, and that room is typed to overlook it. A Fortress's great hall lies
    // two rooms from the gate and seldom under the floor above, so its minstrels' gallery stays rare (0.07).
    expect(fortress).toBeGreaterThan(0.45);
    expect(mansion).toBeGreaterThan(0.55);
  });

  it('cut murder holes in Fortresses only', () => {
    expect(mansions.every((m) => m.floors.every((f) => f.terrain.every((p) => p.kind !== 'murder-hole')))).toBe(true);
  });
});

describe("a Haunted Mansion's stair well and light wells", () => {
  const mansions = runs('mansion');

  it('raises the stairs up from the entrance hall, and opens its stair well beside them in the room they arrive in', () => {
    let halls = 0;
    let holding = 0;
    let wells = 0;
    const problems = mansions.flatMap((m) => {
      const [entry, upper] = [m.floors[0]!, m.floors[1]!];
      const hall = entry.rooms.find((r) => r.type === 'entrance-hall');
      if (!hall) return [];
      const up = entry.stairs.filter((s) => s.to === 1 && stairCells(s).every((c) => inFloor(hall, c)));
      if (hall.id === 0) halls += 1;
      if (hall.id === 0 && up.length > 0) holding += 1;
      return upper.terrain.filter((p) => p.name === 'dungeon.terrain.stairWell').flatMap((piece) => {
        wells += 1;
        const own = upper.rooms[piece.room]!;
        const stair = up.find((s) => stairCells(s).every((c) => inFloor(own, c)));
        const where = `seed ${m.seed} stair well ${piece.id}`;
        if (!stair) return [`${where} in a room no stairs from the entrance hall arrive in`];
        if (!piece.cells.every((c) => inFloor(hall, c))) return [`${where} not over the entrance hall`];
        return besideStairs(piece.cells, stair) ? [] : [`${where} not beside the stairs`];
      });
    });
    expect(problems.slice(0, 10)).toEqual([]);
    // Measured 219 of 259 entrance halls holding the stairs up (room 0 cannot always hold them), 96 of 259 with a stair well (the landing above must keep half its floor).
    expect(holding / halls).toBeGreaterThan(0.8);
    expect(wells / halls).toBeGreaterThan(0.3);
  });

  it("cuts light wells straight in a landing's floor, a cell from its walls, over the floor of a room below, with floor round them", () => {
    let landings = 0;
    let wells = 0;
    const problems = mansions.flatMap((m) =>
      m.floors.flatMap((floor, k) => {
        const under = floorBelow(stackOf(m), k);
        landings += under === null ? 0 : floor.rooms.filter((r) => r.type === 'landing').length;
        return floor.terrain.filter((p) => p.name === 'dungeon.terrain.lightWell').flatMap((piece) => {
          wells += 1;
          const own = floor.rooms[piece.room]!;
          const where = `seed ${m.seed} floor ${k} light well ${piece.id}`;
          const below = m.floors[under ?? -1];
          if (own.type !== 'landing' || piece.kind !== 'gallery') return [`${where} is a ${piece.kind} in a ${own.type}`];
          if (!isRectangle(piece.cells) || piece.cells.length < 2) return [`${where} is not a straight opening`];
          if (piece.cells.some((c) => c.x === own.x || c.y === own.y || c.x === own.x + own.w - 1 || c.y === own.y + own.h - 1)) return [`${where} against the landing's wall`];
          if (piece.opening?.bottom !== under || !below?.rooms.some((r) => r.kind === 'room' && piece.cells.every((c) => inFloor(r, c)))) return [`${where} not over a room below`];
          return [];
        });
      }),
    );
    expect(problems.slice(0, 10)).toEqual([]);
    // Measured 0.084: most landings are too small to leave a cell round a well.
    expect(wells / landings).toBeGreaterThan(0.05);
  });
});
