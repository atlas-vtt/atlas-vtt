import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { FLOOR_DROP, caveHeights, hydrology } from '../../../../src/app/dungeons/layout/cavern/hydrology';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { neighbours } from '../../../../src/app/dungeons/roomGraph';
import { rngFrom } from '../../../../src/app/dungeons/rng';

const caves = (tags: string[], floors: number, count: number): DungeonModel[] =>
  Array.from({ length: count }, (_, k) => generateDungeon({ seed: 9_001 + k * 523, tags, floors, theme: 'cavern' }));

describe('a cave’s heights and water', () => {
  it('lie lower on every floor further down', () => {
    for (const model of caves([], 3, 40)) {
      const heights = model.floors.map((floor) => floor.cave!.heights);
      for (let i = 1; i < heights.length; i++) expect(Math.max(...heights[i]!)).toBeLessThan(Math.min(...heights[i - 1]!));
      expect(caveHeights(model.seed, 1, model.floors[1]!.rooms)).toEqual(heights[1]);
      for (const h of heights[0]!) expect(h).toBeGreaterThanOrEqual(0);
      for (const h of heights[0]!) expect(h).toBeLessThan(FLOOR_DROP);
    }
  });

  it('stand in low rooms, behind a dam, or at the low end of a stream, and run strictly downhill', () => {
    for (const model of caves(['wet'], 3, 60)) {
      for (const floor of model.floors) {
        const { basins, streams, dams, heights } = floor.cave!;
        const adjacent = neighbours(floor.rooms.length, floor.doors);
        const chambers = (id: number): number[] => { const out = new Set<number>(); const seen = new Set([id]); const queue = [...(adjacent[id] ?? [])]; for (let h = 0; h < queue.length; h++) { const at = queue[h]!; if (seen.has(at)) continue; seen.add(at); if (floor.rooms[at]?.kind === "room") out.add(at); else queue.push(...(adjacent[at] ?? [])); } return [...out]; };
        const minimum = (id: number): boolean => chambers(id).every((n) => (heights[n] ?? 0) > (heights[id] ?? 0));
        const lows = new Set(streams.map((s) => s[s.length - 1]!));
        for (const b of basins) expect(minimum(b) || dams.includes(b) || lows.has(b)).toBe(true);
        for (const stream of streams) {
          expect(basins).toContain(stream[stream.length - 1]);
          for (let i = 1; i < stream.length; i++) expect(heights[stream[i]!]!).toBeLessThan(heights[stream[i - 1]!]!);
          for (let i = 1; i < stream.length; i++) expect(adjacent[stream[i - 1]!]).toContain(stream[i]);
        }
      }
    }
  });

  it('none in a dry cave', () => {
    for (const model of caves(['dry'], 2, 30)) for (const floor of model.floors) expect([floor.cave!.basins, floor.cave!.streams, floor.cave!.dams]).toEqual([[], [], []]);
    const floor = caves([], 1, 1)[0]!.floors[0]!;
    expect(hydrology(rngFrom(1), floor, floor.cave!.heights, 0.6, true)).toEqual({ basins: [], streams: [], dams: [] });
  });

  it('gathers most on the deepest floor', () => {
    const runs = caves(['wet'], 3, 120);
    const share = (floor: DungeonModel['floors'][number]): number => floor.cave!.basins.length / floor.rooms.filter((r) => r.kind === 'room').length;
    const most = runs.filter((model) => model.floors.length === 3 && model.floors.every((f) => share(model.floors[2]!) >= share(f)));
    expect(most.length / runs.length).toBeGreaterThanOrEqual(0.85);
  }, 60_000);
});
