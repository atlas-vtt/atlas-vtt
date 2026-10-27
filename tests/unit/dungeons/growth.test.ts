import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { CellPoint, DungeonFloor, DungeonModel, DungeonRequest } from '../../../src/app/dungeons/model';
import { cellKey, holdsCell } from '../../../src/app/dungeons/geometry';
import { GROWTH_KINDS } from '../../../src/app/dungeons/growthModel';
import { roomLight } from '../../../src/app/dungeons/growth/placeGrowth';
import { en } from '../../../src/app/i18n/locales/en';

/**
 * Vegetation over many dungeons: where it may grow (never in a doorway, before a door, on or by a
 * stairwell, in a hole, by lava or acid), what grows by the tags, and that thick undergrowth is
 * difficult terrain that never blocks. The checks are written apart from the generator.
 */

const key = (c: CellPoint): string => `${c.x},${c.y}`;
const UNDERGROWTH = new Set(['brambles', 'thicket', 'tangled-roots']);

function generate(seed: number, tags: string[], floors = 1, extra: Partial<DungeonRequest> = {}): DungeonModel {
  return generateDungeon({ seed, tags, floors, ...extra });
}

/** Cells a stairwell, the rows either end is reached from and everything beside them cover. */
function stairArea(floor: DungeonFloor): Set<string> {
  const out = new Set<string>();
  for (const s of floor.stairs) {
    for (let x = s.x - 2; x < s.x + s.w + 2; x++) {
      for (let y = s.y - 2; y < s.y + s.h + 2; y++) {
        // The stairwell grown by its approach row (along `down`) and one more cell all round.
        const alongX = s.down.x !== 0;
        const inside = alongX ? y >= s.y - 1 && y < s.y + s.h + 1 : x >= s.x - 1 && x < s.x + s.w + 1;
        if (inside) out.add(key({ x, y }));
      }
    }
  }
  return out;
}

function approaches(floor: DungeonFloor, secretToo: boolean): Set<string> {
  const out = new Set<string>();
  for (const d of floor.doors) {
    if (!secretToo && d.kind === 'secret') continue;
    // A door on an edge stands between its own cell and the one across.
    const back = d.edge ? 0 : 1;
    out.add(key({ x: d.x - d.dir.x * back, y: d.y - d.dir.y * back }));
    out.add(key({ x: d.x + d.dir.x, y: d.y + d.dir.y }));
  }
  return out;
}

/** Everything wrong with where a floor's growth stands. */
function growthProblems(floor: DungeonFloor): string[] {
  const problems: string[] = [];
  const doors = new Set(floor.doors.map(key));
  const stairs = stairArea(floor);
  const shownApproaches = approaches(floor, false);
  const allApproaches = approaches(floor, true);
  const holes = new Set(floor.terrain.filter(p => p.opening || p.kind === 'bridge').flatMap(p => p.cells.map(key)));
  const burning = floor.terrain.filter(p => p.traits.hazard === 'lava' || p.traits.hazard === 'acid').flatMap(p => p.cells);
  for (const [i, g] of floor.growth.entries()) {
    const room = floor.rooms[g.room];
    if (!room) {
      problems.push(`growth ${i} in no room`);
      continue;
    }
    for (const c of g.cells) {
      const k = key(c);
      const where = `${g.kind} ${i} at ${k}`;
      if (!holdsCell(room, c.x, c.y)) problems.push(`${where} outside its room`);
      if (doors.has(k)) problems.push(`${where} in a doorway`);
      if (stairs.has(k)) problems.push(`${where} by a stairwell`);
      if ((g.wall ? shownApproaches : allApproaches).has(k)) problems.push(`${where} before a door`);
      if (holes.has(k)) problems.push(`${where} in a hole or on a bridge`);
      if (burning.some(b => Math.max(Math.abs(b.x - c.x), Math.abs(b.y - c.y)) <= 2)) problems.push(`${where} by lava or acid`);
      if (!g.wall && floor.waterCells.some(w => w.x === c.x && w.y === c.y)) problems.push(`${where} in water`);
    }
    if (g.wall) {
      for (const p of g.wall) {
        const onEdge = room.cells
          ? onMaskEdge(room.cells, p)
          : room.rotunda
          ? Math.abs(Math.hypot(p.x - (room.x + room.w / 2), p.y - (room.y + room.h / 2)) - Math.sqrt(room.w * room.w + 1) / 2) < 1e-6
          : (Math.abs(p.x - room.x) < 1e-9 || Math.abs(p.x - room.x - room.w) < 1e-9 || Math.abs(p.y - room.y) < 1e-9 || Math.abs(p.y - room.y - room.h) < 1e-9);
        if (!onEdge) problems.push(`${g.kind} ${i} off its wall at ${p.x},${p.y}`);
      }
    }
    if (g.column !== undefined && !floor.columns[g.column]) problems.push(`${g.kind} ${i} round no column`);
  }
  for (const piece of floor.terrain.filter(p => UNDERGROWTH.has(p.kind))) {
    if (!piece.traits.difficult || piece.traits.cover || piece.traits.hazard) problems.push(`${piece.kind} ${piece.id} is not plain difficult terrain`);
    for (const c of piece.cells) if (stairs.has(key(c)) || allApproaches.has(key(c)) || doors.has(key(c))) problems.push(`${piece.kind} ${piece.id} at ${key(c)} by a door or stairwell`);
  }
  return problems;
}

const SEEDS = 300;
const runs = (tags: string[], floors = 1, extra: Partial<DungeonRequest> = {}): DungeonModel[] => Array.from({ length: SEEDS }, (_, k) => generate(k * 7907 + 13, tags, floors, extra));
const growthOf = (models: readonly DungeonModel[]): number => models.reduce((sum, m) => sum + m.floors.reduce((s, f) => s + f.growth.length, 0), 0) / models.length;
const undergrowthOf = (models: readonly DungeonModel[]): number => models.reduce((sum, m) => sum + m.floors.reduce((s, f) => s + f.terrain.filter(p => UNDERGROWTH.has(p.kind)).length, 0), 0) / models.length;
const kinds = (models: readonly DungeonModel[]): Set<string> => new Set(models.flatMap(m => m.floors.flatMap(f => f.growth.map(g => g.kind))));

describe('dungeon vegetation', () => {
  const overgrown = runs(['overgrown'], 2);
  const fortress = runs(['overgrown', 'colonnades'], 1, { theme: 'fortress' });
  const cavern = runs(['overgrown', 'wet'], 1, { theme: 'cavern' });
  const mansion = runs(['overgrown', 'crumbling'], 1, { theme: 'mansion' });
  const lava = runs(['overgrown', 'lava'], 2);
  const wet = runs(['wet']);
  const crumbling = runs(['crumbling']);

  it('grows only where it may: off doorways, door approaches, stairwells, holes, water and lava', () => {
    const problems = [...overgrown, ...fortress, ...cavern, ...mansion, ...lava, ...wet, ...crumbling]
      .flatMap(m => m.floors.flatMap((f, i) => growthProblems(f).map(p => `seed ${m.seed} [${m.tags.join(',')}] floor ${i}: ${p}`)))
      .slice(0, 10);
    expect(problems).toEqual([]);
  }, 120_000);

  it('grows richly in an overgrown dungeon, a little by the water of a wet one, weeds in a crumbling one', () => {
    const rich = growthOf(overgrown) / 2;
    expect(rich).toBeGreaterThan(25);
    // A cave grows by its water and in its cracks only where daylight reaches (its zones, caveLife.ts).
    expect(growthOf(wet)).toBeGreaterThan(0.5);
    expect(growthOf(wet)).toBeLessThan(rich / 2);
    expect(growthOf(crumbling)).toBeGreaterThan(0.15);
    expect(growthOf(crumbling)).toBeLessThan(rich / 3);
    expect(undergrowthOf(overgrown)).toBeGreaterThan(0.15);
    expect(undergrowthOf(wet) + undergrowthOf(crumbling)).toBe(0);
    for (const k of kinds(wet)) expect(['moss', 'fern']).toContain(k);
    expect([...kinds(crumbling)]).toEqual(['grass']);
  }, 120_000);

  it('grows nothing in a dry, lava, acid or untagged dungeon unless it is overgrown', () => {
    for (const tags of [[], ['dry'], ['dry', 'crumbling'], ['lava'], ['lava', 'wet'], ['acid', 'crumbling'], ['colonnades']]) {
      const models = Array.from({ length: 60 }, (_, k) => generate(k * 104_729 + 3, tags, 2));
      expect(growthOf(models), tags.join(',')).toBe(0);
      expect(undergrowthOf(models), tags.join(',')).toBe(0);
    }
    // A lava cave grows by its mouth and its water alone, never where the lava runs.
    expect(growthOf(lava)).toBeGreaterThan(5);
  }, 120_000);

  it('picks what grows by the theme', () => {
    expect(kinds(fortress).has('ivy')).toBe(true);
    const ofMansion = kinds(mansion);
    for (const k of ['ivy', 'creeper', 'roots']) expect(ofMansion.has(k), k).toBe(true);
    const ofCavern = kinds(cavern);
    for (const k of ['moss', 'fungi']) expect(ofCavern.has(k), k).toBe(true);
    expect(ofCavern.has('ivy')).toBe(false);
    for (const models of [fortress, mansion, cavern]) expect(kinds(models).has('vine')).toBe(false);
  }, 120_000);

  it('grows green where the light comes in: the entry floor more than the floor below it', () => {
    const green = (f: DungeonFloor): number => f.growth.filter(g => GROWTH_KINDS[g.kind].needsLight).length / Math.max(1, f.rooms.length);
    // In a Cavern the second floor lies below the first; a building's lies above, in its dusk.
    const caves = overgrown.filter((m) => m.theme === 'cavern');
    const above = caves.reduce((s, m) => s + green(m.floors[0]!), 0);
    const below = caves.reduce((s, m) => s + green(m.floors[1]!), 0);
    expect(above).toBeGreaterThan(below * 1.5);
  });

  it('lights the upper floors of a Fortress as dusk, and a Cavern\'s deeper floors darker', () => {
    const model = generateDungeon({ seed: 41, theme: 'fortress', tags: [], floors: 3 });
    const upper = model.floors[1]!;
    expect(roomLight({ rooms: upper.rooms, doors: upper.doors, floor: 1, aboveGround: true })).toEqual(upper.rooms.map(() => 0.35));
    expect(new Set(roomLight({ rooms: upper.rooms, doors: upper.doors, floor: 1, aboveGround: false }))).toEqual(new Set([0.12]));
  });

  it('is the same for the same request', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const request = { seed: seed * 31, theme: seed % 2 ? ('cavern' as const) : undefined, tags: ['overgrown', 'wet'], floors: 1 + (seed % 3) };
      expect(generateDungeon(request)).toEqual(generateDungeon(request));
    }
  });

  it('names every kind of growth and undergrowth in English', () => {
    for (const info of Object.values(GROWTH_KINDS)) expect(Object.hasOwn(en, info.name), info.name).toBe(true);
  });
});

/** Whether a point lies on the edge between a cave room's cells and the rock round them. */
function onMaskEdge(cells: readonly CellPoint[], p: CellPoint): boolean {
  const keys = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const around = [-0.01, 0.01].flatMap((dx) => [-0.01, 0.01].map((dy) => keys.has(cellKey(Math.floor(p.x + dx), Math.floor(p.y + dy)))));
  return around.some(Boolean) && around.some((inside) => !inside);
}
