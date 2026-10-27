import { describe, expect, it } from 'vitest';
import { levelStack, stackGrid, type LevelStack } from '../../../src/app/levels/levelStack';
import { SNAPSHOT_MAX_SIDE, sameSnapshotGrid, snapshotCamera, snapshotGrid, SnapshotView } from '../../../src/app/pixi/lighting/levels/belowSnapshot';

const rect = (x: number, y: number, w: number, h: number): { x: number; y: number }[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

function stackWithHole(side: number, x: number, y: number, w: number, h: number): LevelStack {
  return levelStack({ id: 'upper', surfaces: [{ id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: rect(x, y, w, h) }] }, [{ id: 'ground', surfaces: [] }], ['ground'], stackGrid({ width: side, height: side }));
}

describe('the snapshot grid of the levels below', () => {
  it('is none while the stack shows only the viewed level', () => {
    expect(snapshotGrid(null)).toBeNull();
    expect(snapshotGrid(levelStack({ id: 'upper', surfaces: [] }, [{ id: 'ground', surfaces: [] }], ['ground'], stackGrid({ width: 512, height: 512 })))).toBeNull();
  });

  it('lies over the stack\'s box, a world pixel a texel where the stack\'s texel is one', () => {
    const stack = stackWithHole(512, 100, 120, 50, 30);
    const grid = snapshotGrid(stack)!;
    expect(grid).toMatchObject({ x: stack.box!.x, y: stack.box!.y, columns: stack.box!.columns, rows: stack.box!.rows, sub: 1, texel: 1 });
    expect([grid.width, grid.height]).toEqual([stack.box!.columns, stack.box!.rows]);
  });

  it('splits a coarse stack texel into world pixels while the snapshot fits, and stays on the stack texel where it would not', () => {
    // An 8,192 px map: stack texels of 4 px.
    const small = snapshotGrid(stackWithHole(8192, 1000, 1000, 400, 300))!;
    expect(small.sub).toBe(4);
    expect(small.texel).toBe(1);
    const whole = snapshotGrid(stackWithHole(8192, 0, 0, 8192, 8192))!;
    expect(whole.sub).toBe(1);
    expect(whole.texel).toBe(4);
    expect(Math.max(whole.width, whole.height)).toBeLessThanOrEqual(SNAPSHOT_MAX_SIDE);
  });

  it('maps every snapshot texel into exactly one stack texel', () => {
    const stack = stackWithHole(8192, 1000, 1000, 400, 300);
    const grid = snapshotGrid(stack)!;
    const camera = snapshotCamera(grid);
    for (const [tx, ty] of [[0, 0], [3, 5], [grid.width - 1, grid.height - 1]]) {
      const centre = camera.applyInverse({ x: tx! + 0.5, y: ty! + 0.5 });
      const cell = { x: Math.floor(centre.x / stack.grid.texel), y: Math.floor(centre.y / stack.grid.texel) };
      expect(cell).toEqual({ x: grid.x + Math.floor(tx! / grid.sub), y: grid.y + Math.floor(ty! / grid.sub) });
    }
    expect(sameSnapshotGrid(grid, snapshotGrid(stack))).toBe(true);
    expect(sameSnapshotGrid(grid, null)).toBe(false);
  });

  it('aims a map image\'s camera at the snapshot\'s rect and texel, and at nothing without one', () => {
    const grid = snapshotGrid(stackWithHole(8192, 1000, 1000, 400, 300))!;
    const view = new SnapshotView();
    view.aim(grid, 2);
    expect(view.left).toBe(grid.x * grid.texel * grid.sub);
    expect(view.worldScreenWidth).toBe(grid.columns * grid.texel * grid.sub);
    // A map image takes a screen pixel as 1 / (scale × resolution) world px: a snapshot texel.
    expect(1 / (view.scale.x * 2)).toBe(grid.texel);
    view.aim(null, 2);
    expect(view.scale.x).toBe(0);
  });
});
