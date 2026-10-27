import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { caveSites } from '../../../../src/app/dungeons/layout/cavern/caveSites';

describe('cave sites', () => {
  const models = Array.from({ length: 40 }, (_, k) => generateDungeon({ seed: 3_301 + k * 97, tags: k % 2 ? ['wet'] : [], floors: 1 + (k % 3), theme: 'cavern' }));

  it('count hops from the mouth, a stairwell one of them', () => {
    for (const model of models) {
      const sites = caveSites(model.floors);
      const entrance = model.floors[0]!.doors.find((d) => d.from === null)!;
      expect(sites[0]!.hopsFromMouth[entrance.to!]).toBe(0);
      model.floors.slice(1).forEach((floor, i) => {
        const landing = floor.stairs.filter((s) => s.to === i).sort((a, b) => a.link - b.link)[0]!;
        const above = model.floors[i]!.stairs.find((s) => s.link === landing.link)!;
        const room = (f: typeof floor, s: typeof landing): number => f.rooms.find((r) => r.kind === 'room' && s.x >= r.x && s.x + s.w <= r.x + r.w && s.y >= r.y && s.y + s.h <= r.y + r.h)!.id;
        expect(sites[i + 1]!.hopsFromMouth[room(floor, landing)]).toBe((sites[i]!.hopsFromMouth[room(model.floors[i]!, above)] ?? 0) + 1);
      });
    }
  });

  it('find a fault line through at least three cells of a room', () => {
    let found = 0;
    for (const model of models) {
      caveSites(model.floors).forEach((site, f) => {
        for (const room of model.floors[f]!.rooms) {
          const fault = site.faultOf(room.id);
          if (!fault) continue;
          found++;
          const cross = (room.cells ?? []).filter((c) => Math.abs((c.x + 0.5 - fault.x) * Math.sin(fault.angle) - (c.y + 0.5 - fault.y) * Math.cos(fault.angle)) <= 0.5);
          expect(cross.length).toBeGreaterThanOrEqual(3);
        }
      });
    }
    expect(found).toBeGreaterThan(20);
  });

  it('call deep the deepest floor of several, and the last third by hops of one', () => {
    for (const model of models) {
      const sites = caveSites(model.floors);
      model.floors.forEach((floor, f) => {
        const site = sites[f]!;
        const hops = floor.rooms.map((r) => site.hopsFromMouth[r.id] ?? Infinity).filter(Number.isFinite);
        const far = Math.max(...hops);
        for (const room of floor.rooms) {
          const h = site.hopsFromMouth[room.id] ?? Infinity;
          const expected = model.floors.length > 1 ? f === model.floors.length - 1 : Number.isFinite(h) && h >= (far * 2) / 3;
          expect(site.deep(room.id)).toBe(expected);
        }
      });
    }
  });

  it('give both ends of every stairwell the same way', () => {
    for (const model of models) {
      const ends = model.floors.flatMap((f) => f.stairs);
      for (const stair of ends) {
        expect(['pitch', 'scree']).toContain(stair.way);
        expect(ends.filter((s) => s.link === stair.link).every((s) => s.way === stair.way)).toBe(true);
      }
    }
  });
});
