import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { DungeonModel, DungeonRequest } from '../../../../src/app/dungeons/model';
import { mapLayout } from '../../../../src/app/dungeons/render/layoutSize';
import { FLOOR_STRENGTH, groundDistance, groundRing, wayCentre, wayExtent, wayFrameOf, wayPoint, wayStrength } from '../../../../src/app/dungeons/render/cave/mouth/wayOut';
import { visibleDungeon } from '../../../../src/app/dungeons/render/visibleDungeon';
import { pointInPolygon } from '../../../../src/app/dungeons/render/geometry';
import { dungeonWalls } from '../../../../src/app/dungeons/scene/toWalls';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../../src/app/dungeons/styleCatalog';

/**
 * A cave's ways out (`cave/mouth/wayOut.ts`): before every entrance of a cave the ground runs on
 * whole from the mouth and fades to nothing along the way, the map is large enough to hold it, and
 * no wall of the scene closes it. Built dungeons have none.
 */

const TAGS: readonly string[][] = [[], ['inhabited'], ['wet'], ['winding'], ['lava'], ['small'], ['large'], ['secret']];
const REQUESTS: readonly DungeonRequest[] = Array.from({ length: 32 }, (_, k) => ({ seed: 300 + k * 53, theme: 'cavern', tags: TAGS[k % TAGS.length]!, floors: 1 }));
const PX = 40;

const models: DungeonModel[] = REQUESTS.map((request) => generateDungeon(request));

describe('a cave\'s ways out', () => {
  it('lie before every entrance of a cave, and nowhere in a building', () => {
    let ways = 0;
    for (const model of models) {
      const dungeon = visibleDungeon(model, DEFAULT_VIEW, 0);
      const entrances = dungeon.doors.filter((door) => door.from === null && door.kind !== 'secret');
      expect(dungeon.ways).toHaveLength(entrances.length);
      ways += entrances.length;
    }
    expect(ways).toBeGreaterThan(20);
    for (const theme of ['fortress', 'mansion'] as const) {
      const built = generateDungeon({ seed: 11, theme, tags: [], floors: 1 });
      expect(visibleDungeon(built, DEFAULT_VIEW, 0).ways).toEqual([]);
    }
  });

  it('run on whole from the mouth and fade to nothing at their length, along their middle', () => {
    for (const model of models) {
      const dungeon = visibleDungeon(model, DEFAULT_VIEW, 0);
      for (const way of dungeon.ways) {
        expect(way.length).toBeGreaterThanOrEqual(2);
        expect(way.length).toBeLessThanOrEqual(4);
        const along = (u: number): number => wayStrength(way, wayPoint(way, u, wayCentre(way, u)));
        expect(along(0.05)).toBeCloseTo(1, 5);
        expect(along(way.length * 1.05)).toBe(0);
        for (let u = 0.1; u < way.length; u += 0.1) expect(along(u)).toBeLessThanOrEqual(along(u - 0.1) + 1e-9);
        expect(along(way.length * 0.6)).toBeGreaterThan(0);
        expect(along(way.length * 0.6)).toBeLessThan(0.9);
      }
    }
  });

  it('widen as they go: the faintest ground is wider far out than at the mouth', () => {
    for (const model of models) {
      const dungeon = visibleDungeon(model, DEFAULT_VIEW, 0);
      for (const way of dungeon.ways) {
        const widthAt = (u: number): number => {
          let width = 0;
          for (let v = -3; v <= 3; v += 0.02) if (wayStrength(way, wayPoint(way, u, v)) > 0) width += 0.02;
          return width;
        };
        expect(widthAt(way.length * 0.5)).toBeGreaterThan(widthAt(0.02));
      }
    }
  });

  it('fit on the map, which grows on a side where one would reach its edge', () => {
    for (const model of models) {
      const layout = mapLayout(model, PX, DEFAULT_VIEW);
      const dungeon = visibleDungeon(model, DEFAULT_VIEW, 0);
      for (const way of dungeon.ways) {
        const reach = wayExtent(way, way.length);
        expect(reach.minX).toBeGreaterThanOrEqual(layout.originCell.x);
        expect(reach.minY).toBeGreaterThanOrEqual(layout.originCell.y);
        expect(reach.maxX).toBeLessThanOrEqual(layout.originCell.x + layout.cellsWide);
        expect(reach.maxY).toBeLessThanOrEqual(layout.originCell.y + layout.cellsHigh);
      }
    }
  });

  it('are closed by no wall of the scene: no wall passes through the ground drawn as floor', () => {
    for (const model of models) {
      const layout = mapLayout(model, PX, DEFAULT_VIEW);
      const dungeon = visibleDungeon(model, DEFAULT_VIEW, 0);
      const { walls } = dungeonWalls(model, dungeonStyle('parchment'), DEFAULT_VIEW, layout, 0);
      const distance = groundDistance(dungeon.field);
      for (const way of dungeon.ways) {
        const ring = groundRing(dungeon.field, way, FLOOR_STRENGTH);
        for (const wall of Object.values(walls)) {
          for (let t = 0; t <= 1; t += 0.1) {
            const p = { x: wall.p1.x + (wall.p2.x - wall.p1.x) * t, y: wall.p1.y + (wall.p2.y - wall.p1.y) * t };
            const cell = { x: p.x / PX + layout.originCell.x, y: p.y / PX + layout.originCell.y };
            // Beyond the mouth's own line, past the half wall the cave's outline may stand at its corners.
            if (wayFrameOf(way, cell).u < 0.1) continue;
            expect(pointInPolygon(ring, cell.x, cell.y) && wayStrength(way, cell, distance) >= FLOOR_STRENGTH, `wall ${wall.id} across the way out of seed ${model.seed}`).toBe(false);
          }
        }
      }
    }
  });
});
