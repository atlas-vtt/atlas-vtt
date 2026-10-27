import { describe, expect, it, vi } from 'vitest';
import { GROUNDS_KINDS } from '../../../../src/app/dungeons/houseModel';

// Every piece of the grounds offered, as once their drawings exist.
vi.mock('../../../../src/app/dungeons/drawnKinds', async (original) => ({ ...(await original<object>()), DRAWN_GROUNDS_KINDS: new Set(GROUNDS_KINDS) }));

import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { groundsLayout } from '../../../../src/app/dungeons/render/grounds/groundsShapes';
import { sweepOf } from '../../../../src/app/dungeons/render/grounds/wayLines';
import { pointInPolygon, pointSegmentDistance } from '../../../../src/app/dungeons/render/geometry';
import { groundsWalls } from '../../../../src/app/dungeons/scene/toGroundsWalls';
import { groundsRules, lotMargins } from './groundsRules';

const SIZES = ['small', 'medium', 'large'] as const;
const RUNS: { size: (typeof SIZES)[number]; model: DungeonModel }[] = [];
for (let k = 1; k <= 80; k++) for (const size of SIZES) RUNS.push({ size, model: generateDungeon({ seed: k * 4801 + 7, theme: 'mansion', tags: [size], floors: 1 + (k % 2) }) });

describe('the grounds of a house', () => {
  it('grow with the map: a step or two round a small house, deep grounds round a large one', () => {
    for (const { size, model } of RUNS) {
      const m = lotMargins(model);
      if (size === 'small') expect(Math.max(m.front, m.side, m.back), `seed ${model.seed}`).toBeLessThanOrEqual(2);
      if (size === 'large') expect(m.front, `seed ${model.seed}`).toBeGreaterThanOrEqual(6);
    }
  });

  for (const [name, rule] of Object.entries(groundsRules)) {
    it(`keep ${name}`, () => {
      const problems = RUNS.flatMap(({ model }) => rule(model).map((p) => `seed ${model.seed}: ${p}`));
      expect(problems.slice(0, 8)).toEqual([]);
    });
  }

  it('have outbuildings on medium and large lots', () => {
    const share = (size: string): number => RUNS.filter((r) => r.size === size && r.model.floors[0]!.grounds!.pieces.some((p) => p.kind === 'outbuilding')).length / 80;
    expect(share('medium')).toBeGreaterThan(0.7);
    expect(share('large')).toBeGreaterThan(0.8);
  });

  it('become walls in the scene: a boundary that stops all, hedges that stop sight, gates and outbuilding doors', () => {
    for (const { model } of RUNS.filter((r) => r.size !== 'small').slice(0, 40)) {
      const grounds = model.floors[0]!.grounds!;
      const walls = Object.values(groundsWalls(grounds, { originCell: { x: 0, y: 0 }, pxPerCell: 1 }, { id: 'g' }));
      const doors = walls.filter((w) => w.type === 'door');
      const openings = grounds.pieces.filter((p) => p.kind === 'gate' || p.kind === 'outbuilding').length;
      expect(doors).toHaveLength(openings);
      const hedges = grounds.pieces.some((p) => p.kind === 'hedge');
      expect(walls.some((w) => w.blocks === 'sight')).toBe(hedges);
      const masonry = grounds.pieces.some((p) => p.kind === 'boundary-wall' || p.kind === 'outbuilding');
      expect(walls.some((w) => w.type === 'solid' && w.blocks === undefined)).toBe(masonry);
    }
  });

  it('draw their ways over the cells the scene gives them: the middle of every way cell on the drawn ground or within a tenth of a cell of it, but the corners of the box the drive turns in, which its circle leaves', () => {
    const misses: string[] = [];
    for (const { model } of RUNS) {
      const floor = model.floors[0]!;
      const layout = groundsLayout(floor);
      if (!layout) continue;
      const inside = (x: number, y: number): boolean => layout.ways.reduce((n, ring) => n + (pointInPolygon(ring, x, y) ? 1 : 0), 0) % 2 === 1;
      const near = (x: number, y: number): boolean => layout.ways.some((ring) => ring.some((p, i) => pointSegmentDistance({ x, y }, p, ring[(i + 1) % ring.length]!) < 0.1));
      const sweep = sweepOf(floor.grounds!.pieces.find((p) => p.kind === 'garden-fountain'));
      const inTurn = (c: { x: number; y: number }): boolean => !!sweep && Math.abs(c.x + 0.5 - sweep.centre.x) < sweep.reach && Math.abs(c.y + 0.5 - sweep.centre.y) < sweep.reach && Math.hypot(c.x + 0.5 - sweep.centre.x, c.y + 0.5 - sweep.centre.y) > sweep.outer;
      const cells = floor.grounds!.pieces.filter((p) => p.kind === 'path' || p.kind === 'drive').flatMap((p) => p.cells).filter((c) => !inTurn(c));
      for (const c of cells) if (!inside(c.x + 0.5, c.y + 0.5) && !near(c.x + 0.5, c.y + 0.5)) misses.push(`seed ${model.seed}: ${c.x},${c.y}`);
    }
    expect(misses.slice(0, 8)).toEqual([]);
  });
});
