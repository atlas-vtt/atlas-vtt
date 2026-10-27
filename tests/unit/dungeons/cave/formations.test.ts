import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { readTags } from '../../../../src/app/dungeons/tags';
import { caveFacts } from '../../../../src/app/dungeons/themes/cavern/caveFacts';
import { formationAllowed, formationRichness } from '../../../../src/app/dungeons/themes/cavern/formations';
import { caveSites } from '../../../../src/app/dungeons/layout/cavern/caveSites';

const factsOf = (model: DungeonModel): ReturnType<typeof caveFacts> => {
  const input = { seed: model.seed, tags: new Set(readTags(model.tags)), floors: model.floors };
  return caveFacts(input, caveSites(model.floors));
};

describe('a cave\'s formations', () => {
  const caves = Array.from({ length: 80 }, (_, k) => generateDungeon({ seed: 41 + k * 977, theme: 'cavern', tags: [['wet'], ['acid'], ['lava'], ['flooded']][k % 4]!, floors: 1 + (k % 3) }));

  it('drip only where air is: no stalagmite or column in a stream room or a basin', () => {
    for (const model of caves) {
      const facts = factsOf(model);
      model.floors.forEach((floor, f) => {
        const wet = new Set([...(floor.cave?.basins ?? []), ...(floor.cave?.streams ?? []).flat()]);
        for (const room of floor.rooms.filter((r) => wet.has(r.id))) {
          for (const kind of ['stalagmites', 'column-formation'] as const) expect(formationAllowed(kind, { x: room.x, y: room.y }, { floor: f, room: room.id }, facts)).toBe(false);
        }
      });
    }
  });

  it('form no calcite in a lava tube, and leave other pieces alone', () => {
    for (const model of caves) {
      const facts = factsOf(model);
      model.floors.forEach((floor, f) => {
        for (const room of floor.rooms.filter((r) => r.type === 'lava-tube')) {
          for (const kind of ['stalagmites', 'flowstone', 'curtain', 'crystals'] as const) expect(formationAllowed(kind, { x: room.x, y: room.y }, { floor: f, room: room.id }, facts)).toBe(false);
          expect(formationAllowed('boulder', { x: room.x, y: room.y }, { floor: f, room: room.id }, facts)).toBe(true);
        }
      });
    }
  });

  it('decorate the mouth least richly and every room within 0..1', () => {
    for (const model of caves) {
      const facts = factsOf(model);
      const mouth = facts.sites[0]!.hopsFromMouth.indexOf(0);
      model.floors.forEach((floor, f) => {
        for (const room of floor.rooms) {
          const r = formationRichness({ floor: f, room: room.id }, facts);
          expect(r).toBeGreaterThan(0);
          expect(r).toBeLessThanOrEqual(1);
          if (f === 0 && room.id === mouth) expect(r).toBeLessThan(0.5);
        }
      });
    }
  });
});
