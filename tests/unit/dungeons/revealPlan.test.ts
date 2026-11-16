import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { mapLayout } from '../../../src/app/dungeons/render/layoutSize';
import { visibleFloor } from '../../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { grownAt, revealPlan } from '../../../src/app/dungeons/reveal/revealPlan';

const PX = 12;

function planOf(seed: number, theme: 'fortress' | 'mansion' | 'cavern') {
  const model = generateDungeon({ seed, tags: ['medium'], theme });
  const map = mapLayout(model, PX);
  const plan = revealPlan(model, DEFAULT_VIEW, map, 0, { width: map.widthPx, height: map.heightPx });
  return { model, map, plan, rooms: visibleFloor(model, DEFAULT_VIEW, 0).rooms };
}

describe('how a new dungeon grows into being', () => {
  for (const theme of ['fortress', 'mansion', 'cavern'] as const) {
    it(`grows every room of a ${theme} from its middle, the entrance first, a room after the room it was grown from`, () => {
      for (const seed of [3, 11, 42]) {
        const { plan, rooms, map } = planOf(seed, theme);
        expect(plan.seeds).toHaveLength(rooms.length);
        const at = (room: (typeof rooms)[number]) => plan.seeds.find((s) => Math.abs(s.x - (room.x + room.w / 2 - map.originCell.x) * PX) < 1e-6 && Math.abs(s.y - (room.y + room.h / 2 - map.originCell.y) * PX) < 1e-6)!;
        const entrance = rooms.find((room) => room.parent === null)!;
        expect(Math.min(...plan.seeds.map((s) => s.start))).toBe(at(entrance).start);
        for (const room of rooms) {
          const seedOf = at(room);
          // Grown, it covers its room's corners: its edge then wobbles by under a tenth of its radius
          expect(seedOf.radius * 0.9).toBeGreaterThanOrEqual((Math.hypot(room.w, room.h) / 2) * PX);
          const parent = rooms.find((other) => other.id === room.parent);
          if (parent) expect(seedOf.start).toBeGreaterThanOrEqual(at(parent).start - 0.25);
          expect(seedOf.start + seedOf.grow).toBeLessThanOrEqual(1);
        }
      }
    });
  }

  it('ends with a wave from the entrance that covers the whole bitmap, and takes a moment, never long', () => {
    const { plan, map } = planOf(7, 'fortress');
    const corners = [[0, 0], [map.widthPx, 0], [0, map.heightPx], [map.widthPx, map.heightPx]];
    for (const [x, y] of corners) expect(plan.wave.radius * 0.9).toBeGreaterThan(Math.hypot(x! - plan.wave.x, y! - plan.wave.y));
    expect(plan.wave.start + plan.wave.grow).toBe(1);
    expect(plan.durationMs).toBeGreaterThanOrEqual(1300);
    expect(plan.durationMs).toBeLessThanOrEqual(2300);
  });

  it('grows a seed from nothing to whole over its share of the reveal', () => {
    const { plan } = planOf(7, 'cavern');
    const seed = plan.seeds.at(-1)!;
    expect(grownAt(seed, seed.start)).toBe(0);
    expect(grownAt(seed, seed.start + seed.grow / 2)).toBeGreaterThan(0.5);
    expect(grownAt(seed, seed.start + seed.grow)).toBe(1);
    expect(grownAt(plan.wave, 1, true)).toBe(1);
  });
});
