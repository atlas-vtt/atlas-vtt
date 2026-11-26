// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { CELL_FILL_OPACITY } from '../../../src/app/annotations/cellFill';
import type { DrawingUnderWay } from '../../../src/app/annotations/underWay';
import type { GridGeometry } from '../../../src/app/grid/gridDistance';
import { CELL, drawScene, type DrawScene } from '../../helpers/drawScene';

let current: DrawScene | undefined;
afterEach(() => {
  current?.destroy();
  current = undefined;
});

/** A scene, and everything its Draw tool told of the drawing under way, in order. */
function scene(options?: Parameters<typeof drawScene>[0]): { s: DrawScene; told: (DrawingUnderWay | null)[]; now: () => DrawingUnderWay | null } {
  const s = (current = drawScene(options));
  const told: (DrawingUnderWay | null)[] = [];
  s.renderer.underWay.subscribe(() => told.push(s.renderer.underWay.get()));
  return { s, told, now: () => s.renderer.underWay.get() };
}

const SQUARES: GridGeometry = { type: 'square', size: CELL, offsetX: 0, offsetY: 0 };

describe('the drawing the Draw tool is making, as it tells it', () => {
  it('tells a pen\'s stroke as it grows, then that it was made, and counts each drawing', () => {
    const { s, told, now } = scene();
    expect(now()).toBeNull();
    s.tool({ mode: 'pen', color: '#ff0000' });
    s.pointer('pointerdown', 10, 10);
    s.pointer('pointermove', 60, 12);
    const first = now();
    expect(first).toMatchObject({ pen: true, made: false, drawings: [{ type: 'pen', color: '#ff0000' }] });
    const points = first?.drawings[0]?.points.length ?? 0;
    s.pointer('pointermove', 120, 40);
    // The stroke's own list, which grows at its end.
    expect(now()?.drawings[0]?.points.length).toBeGreaterThan(points);
    expect(now()?.serial).toBe(first?.serial);
    s.pointer('pointerup', 120, 40);
    expect(now()).toEqual({ serial: first?.serial, drawings: [], pen: false, made: true });
    expect(s.drawings()).toHaveLength(1);
    expect(told.length).toBeGreaterThanOrEqual(3);

    s.drag([[200, 200], [260, 240]]);
    expect(now()?.made).toBe(true);
    expect(now()?.serial).toBeGreaterThan(first?.serial ?? 0);
  });

  it('tells a shape as it will be made, with who sees it and where it lies, and nothing once it is dropped', () => {
    const { s, now } = scene();
    s.tool({ mode: 'rectangle', players: false, layer: 'map', fill: 'soft' });
    s.pointer('pointerdown', 0, 0);
    s.pointer('pointermove', 140, 70);
    expect(now()).toMatchObject({ pen: false, made: false, drawings: [{ type: 'rectangle', fill: 'soft', hidden: true, layer: 'map' }] });
    expect(now()?.drawings[0]?.points).toHaveLength(5);
    s.key('Escape');
    expect(now()).toBeNull();
    expect(s.drawings()).toEqual([]);
  });

  it('tells the cells being filled as the areas their fill will have, and that they were made', () => {
    const { s, now } = scene({ grid: SQUARES });
    s.tool({ mode: 'cells', color: '#e93147', cellsLayer: 'above' });
    s.pointer('pointerdown', 10, 10);
    s.pointer('pointermove', 80, 10);
    const parts = now();
    expect(parts).toMatchObject({ pen: false, made: false, drawings: [{ type: 'line', fill: 'solid', width: 0, opacity: CELL_FILL_OPACITY, color: '#e93147' }] });
    // Two cells side by side: one area of four corners and the first again.
    expect(parts?.drawings[0]?.points).toHaveLength(5);
    expect(parts?.drawings[0]).not.toHaveProperty('layer');
    s.pointer('pointerup', 80, 10);
    expect(now()).toMatchObject({ made: true, drawings: [] });
    expect(s.drawings()).toHaveLength(1);

    // Clearing cells shows the GM's own marks alone: nothing is told of it while it lasts.
    s.tool({ mode: 'cells', cellsUnfill: true });
    s.pointer('pointerdown', 10, 10);
    s.pointer('pointermove', 80, 10);
    expect(now()?.drawings ?? []).toEqual([]);
    s.pointer('pointerup', 80, 10);
  });

  it('tells nothing of the eraser\'s sweep, and that a stamp or a shape without a size left nothing', () => {
    const { s, told, now } = scene();
    s.tool({ mode: 'pen' });
    s.drag([[10, 100], [300, 100]]);
    const made = now()?.serial;
    told.length = 0;
    s.tool({ mode: 'eraser' });
    s.drag([[150, 50], [150, 150]]);
    expect(told.every((entry) => entry === null || entry.serial === made)).toBe(true);
    s.tool({ mode: 'rectangle' });
    s.pointer('pointerdown', 400, 400);
    s.pointer('pointerup', 400, 400);
    expect(now()).toBeNull();
  });
});
