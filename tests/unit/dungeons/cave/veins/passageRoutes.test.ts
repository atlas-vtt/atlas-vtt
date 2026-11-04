import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../../src/app/dungeons/generate';
import { cellKey } from '../../../../../src/app/dungeons/geometry';
import type { DungeonFloor, DungeonModel, DungeonRoom } from '../../../../../src/app/dungeons/model';

/**
 * The book's routes as generated caves lay them, measured apart from the generator: long ways run
 * as chains of passages, a passage's stretches shift in how they are passed, ways climb within a
 * floor, and the main path pinches through a crawl where a chamber has no wider way on.
 */

const TAGS: readonly string[][] = [[], ['wet'], ['large'], ['small'], ['winding'], ['dry']];

function caves(count: number, floors: number): DungeonModel[] {
  return Array.from({ length: count }, (_, k) => generateDungeon({ seed: 5_003 + k * 7_919, theme: 'cavern', tags: TAGS[k % TAGS.length]!, floors }));
}

/** A passage's length in cells of floor, along the way it grew. */
const lengthOf = (room: DungeonRoom): number => (room.axis.x !== 0 ? room.w : room.h);

/** How far along its own axis a point lies. */
const alongOf = (room: DungeonRoom, p: { x: number; y: number }): number => p.x * room.axis.x + p.y * room.axis.y;

/** The passages each room leads on to through its far end: a passage of a chain, or one past a chamber's door. */
function onwardPassages(floor: DungeonFloor): Map<number, DungeonRoom[]> {
  const out = new Map<number, DungeonRoom[]>();
  for (const door of floor.doors) {
    if (door.from === null || door.to === null || door.kind === 'secret') continue;
    const [from, child] = [floor.rooms[door.from], floor.rooms[door.to]];
    if (!from || !child || child.kind === 'room' || child.parent !== door.from) continue;
    // A passage leads on by its far end (straight on, or turning through a side wall by its last row); a way off its side is a way of its own.
    const far = Math.max(alongOf(from, { x: from.x, y: from.y }), alongOf(from, { x: from.x + from.w - 1, y: from.y + from.h - 1 }));
    if (from.kind !== 'room' && alongOf(from, door) < far) continue;
    out.set(door.from, [...(out.get(door.from) ?? []), child]);
  }
  return out;
}

/** The longest run of passages from each passage a chamber opens into, in cells: how far that way out runs before it reaches a cave. */
function routeLengths(floor: DungeonFloor): number[] {
  const onward = onwardPassages(floor);
  const longest = (room: DungeonRoom, depth: number): number => lengthOf(room) + (depth > 12 ? 0 : Math.max(0, ...(onward.get(room.id) ?? []).map((c) => longest(c, depth + 1))));
  return floor.rooms.filter((r) => r.kind === 'room').flatMap((chamber) => (onward.get(chamber.id) ?? []).map((first) => longest(first, 0)));
}

describe('ways between caves', () => {
  const all = caves(270, 2);

  it('run from a few steps to long bending galleries', () => {
    const lengths = all.flatMap((m) => m.floors.flatMap(routeLengths)).slice(0, 2_000);
    const long = lengths.filter((l) => l > 15).length / lengths.length;
    const short = lengths.filter((l) => l <= 2).length / lengths.length;
    console.log(`${lengths.length} routes: ${(100 * long).toFixed(1)} % longer than 15 cells, ${(100 * short).toFixed(1)} % of 2 cells or less, the longest ${Math.max(...lengths)} cells`);
    expect(lengths.length).toBe(2_000);
    expect(long).toBeGreaterThan(0.03);
    expect(short).toBeGreaterThan(0.1);
    expect(Math.max(...lengths)).toBeGreaterThan(20);
  });

  it('shift between walks and crawls along a chain of passages', () => {
    let segmentDoors = 0;
    let narrow = 0;
    for (const floor of all.flatMap((m) => m.floors)) {
      for (const door of floor.doors) {
        const [a, b] = [door.from, door.to].map((id) => (id === null ? undefined : floor.rooms[id]));
        if (!a || !b || a.kind !== 'corridor' || b.kind !== 'corridor' || b.parent !== a.id) continue;
        segmentDoors++;
        if (['crawl', 'squeeze', 'letterbox'].includes(door.way ?? 'walk')) narrow++;
      }
    }
    console.log(`${segmentDoors} doors between passages, ${(100 * narrow / segmentDoors).toFixed(1)} % a crawl or tighter`);
    expect(narrow).toBeGreaterThan(0);
  });

  it('climb within a floor off the main path, never where water is, ten or twenty feet', () => {
    let climbs = 0;
    let doors = 0;
    for (const floor of all.flatMap((m) => m.floors)) {
      const lane = new Set((floor.cave?.lane ?? []).map((c) => cellKey(c.x, c.y)));
      const wet = new Set([...(floor.cave?.basins ?? []), ...(floor.cave?.streams ?? []).flat()]);
      for (const door of floor.doors) {
        if (door.from === null || door.to === null) continue;
        doors++;
        if (door.way !== 'climb') continue;
        climbs++;
        expect(door.kind).toBe('opening');
        expect(lane.has(cellKey(door.x, door.y))).toBe(false);
        expect(wet.has(door.from) || wet.has(door.to)).toBe(false);
        expect([10, 20]).toContain(door.drop?.depth);
        expect(door.wide).toBeUndefined();
      }
    }
    console.log(`${climbs} climbs of ${doors} doors (${(100 * climbs / doors).toFixed(1)} %)`);
    expect(climbs / doors).toBeGreaterThan(0.03);
  });

  it('pinch the main path to a crawl where a chamber has no wider way on, about one lane door in six', () => {
    const models = caves(400, 1);
    let lane = 0;
    let pinched = 0;
    for (const floor of models.flatMap((m) => m.floors)) {
      const path = new Set((floor.cave?.lane ?? []).map((c) => cellKey(c.x, c.y)));
      for (const door of floor.doors) {
        if (door.kind === 'secret' || door.from === null || !path.has(cellKey(door.x, door.y))) continue;
        lane++;
        if (door.way === 'walk') continue;
        pinched++;
        expect(['crawl', 'squeeze', 'letterbox']).toContain(door.way);
        expect(door.wide).toBeUndefined();
      }
    }
    console.log(`${lane} lane doors, ${(100 * pinched / lane).toFixed(1)} % no walk`);
    expect(pinched / lane).toBeGreaterThan(0.08);
    expect(pinched / lane).toBeLessThan(0.3);
  });
});
