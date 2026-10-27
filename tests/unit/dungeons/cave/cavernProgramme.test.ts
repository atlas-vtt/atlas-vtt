import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { CAVERN_PROGRAMME, cavernProgramme } from '../../../../src/app/dungeons/themes/cavern';
import { cavernFacts } from '../../../../src/app/dungeons/themes/cavern/caveFacts';
import { caveSites } from '../../../../src/app/dungeons/layout/cavern/caveSites';
import { readTags } from '../../../../src/app/dungeons/tags';
import type { RoomProgramme } from '../../../../src/app/dungeons/themes/themeTypes';

const SETS: string[][] = [[], ['small'], ['large'], ['dry'], ['wet'], ['lava', 'deep'], ['acid'], ['flooded', 'spacious']];

function caves(count: number, floors: (k: number) => number): DungeonModel[] {
  return Array.from({ length: count }, (_, k) => generateDungeon({ seed: 17 + k * 389, theme: 'cavern', tags: SETS[k % SETS.length]!, floors: floors(k) }));
}

const factsOf = (model: DungeonModel): ReturnType<typeof cavernFacts> => cavernFacts({ seed: model.seed, tags: new Set(readTags(model.tags)), floors: model.floors });
const CALCITE = ['stalagmites', 'column-formation', 'flowstone', 'curtain', 'crystals'];

function kinds(programme: RoomProgramme): string[] {
  return programme.rooms.flatMap(({ furnish }) => [furnish.defining, ...furnish.pieces].flatMap((p) => (p ? [p.kind, ...(p.parent ? [p.parent] : [])] : [])));
}

describe('the Cavern programme', () => {
  const runs = caves(240, (k) => 1 + (k % 3));

  it('types every room, the entrance a cave mouth', () => {
    for (const model of runs) {
      model.floors.forEach((floor) => {
        for (const room of floor.rooms.filter((r) => r.kind === 'room')) expect(room.type, `seed ${model.seed} room ${room.id}`).toBeDefined();
      });
      // The entrance room: room 0, or the first chamber past the tunnel the entrance opens into.
      const hops = caveSites(model.floors)[0]!.hopsFromMouth;
      const front = model.floors[0]!.rooms.filter((r) => r.kind === 'room' && !r.boss).sort((a, b) => (hops[a.id] ?? 0) - (hops[b.id] ?? 0) || a.id - b.id)[0]!;
      expect(front.type, `seed ${model.seed}`).toBe('cave-mouth');
      expect(model.floors.flatMap((f) => f.rooms).filter((r) => r.type === 'cave-mouth')).toHaveLength(1);
    }
  });

  it('types every room where its facts allow it', () => {
    for (const model of runs) {
      const facts = factsOf(model);
      model.floors.forEach((floor, f) => {
        for (const room of floor.rooms) if (room.type) expect(facts.allows(room.type, { floor: f, room: room.id }), `seed ${model.seed} floor ${f} ${room.type}`).toBe(true);
      });
    }
  });

  it('ends in a grand cavern, a lake or a den, by their weights over what the cave allows', () => {
    const bosses = caves(2000, () => 1);
    const counts = new Map<string, number>();
    const expected = new Map<string, number>();
    for (const model of bosses) {
      const floor = model.floors[0]!;
      const boss = floor.rooms.find((r) => r.boss)!;
      expect(['grand-cavern', 'lake-cavern', 'den']).toContain(boss.type);
      counts.set(boss.type!, (counts.get(boss.type!) ?? 0) + 1);
      const facts = factsOf(model);
      const allowed = CAVERN_PROGRAMME.climax.filter((c) => facts.allows(c.type, { floor: 0, room: boss.id }));
      const total = allowed.reduce((sum, c) => sum + c.weight, 0);
      for (const c of allowed) expected.set(c.type, (expected.get(c.type) ?? 0) + c.weight / total);
      if (model.tags.includes('dry')) expect(boss.type).not.toBe('lake-cavern');
    }
    for (const type of ['grand-cavern', 'lake-cavern', 'den']) expect(Math.abs((counts.get(type) ?? 0) - (expected.get(type) ?? 0)) / bosses.length, type).toBeLessThanOrEqual(0.05);
  }, 240_000);

  it('drops calcite and its rooms in a lava tube, and doubles groves, lakes and chasms in the Underdark', () => {
    const lava = cavernProgramme(new Set(['lava']));
    expect(lava.rooms.map((s) => s.id)).not.toEqual(expect.arrayContaining(['fungus-grove']));
    for (const id of ['fungus-grove', 'crystal-grotto', 'flowstone-gallery']) expect(lava.rooms.some((s) => s.id === id)).toBe(false);
    for (const kind of CALCITE) expect(kinds(lava)).not.toContain(kind);
    const deep = cavernProgramme(new Set(['deep']));
    for (const id of ['fungus-grove', 'lake-cavern', 'chasm-hall'] as const) {
      const base = CAVERN_PROGRAMME.rooms.find((s) => s.id === id)!;
      expect(deep.rooms.find((s) => s.id === id)!.count[1]).toBe(base.count[1] * 2);
    }
  });
});
