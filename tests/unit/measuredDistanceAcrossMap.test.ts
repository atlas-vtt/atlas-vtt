import { Text } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PATHFINDER_2E } from '../../src/app/gameSystems/presets/pathfinder2e';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import { pathLengthInCells } from '../../src/app/grid/gridDistance';
import { formatDistance, resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { DragRuler } from '../../src/app/pixi/token-renderer/DragRuler';
import type { DragRulerView } from '../../src/app/pixi/token-renderer/DragRulerView';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import { measureScene, type MeasureScene } from '../helpers/measureScene';
import { ALIGNED_GRIDS, HEX_GRIDS, pointInCell, snappingGrid, type SnappingGridOptions } from '../helpers/snappingGrid';

const pathfinder = resolveMeasurementSettings(PATHFINDER_2E.rules.gridDefaults, null);
const SPAN = 24;

/** Every cell of the map a path may start from. */
function* startCells(): Generator<[number, number]> {
  for (let col = 0; col < SPAN; col++) for (let row = 0; row < SPAN; row++) yield [col, row];
}

let scene: MeasureScene | undefined;
afterEach(() => {
  scene?.destroy();
  scene = undefined;
  vi.useRealTimers();
});

/** The labels the measure tool shows for the same drag of cell steps, started from every cell. */
function measureToolLabels(grid: SnappingGridOptions, dCol: number, dRow: number): string[] {
  vi.useFakeTimers();
  scene = measureScene(snappingGrid(grid));
  scene.measure.measurementSettingsProvider = () => pathfinder;
  scene.store.getState().setActiveTool('measure');
  const labels = new Set<string>();
  for (const [col, row] of startCells()) {
    const from = pointInCell(grid, col, row);
    const to = pointInCell(grid, col + dCol, row + dRow);
    scene.pointer('pointerdown', from.x, from.y);
    scene.pointer('pointermove', to.x, to.y);
    labels.add(scene.parts().find((part): part is Text => part instanceof Text)!.text);
    scene.pointer('pointerup', to.x, to.y);
  }
  return [...labels];
}

/** A drag ruler on `grid` for a token of `tokenSize`, and what it last drew. */
function dragRuler(grid: SnappingGridOptions, tokenSize: number, snapToGrid = true): { ruler: DragRuler; label: () => string } {
  const view = { draw: vi.fn<DragRulerView['draw']>(), clear: vi.fn(), destroy: vi.fn(), layers: [] };
  const state = { grid: { snapToGrid }, objects: { tokens: { t1: { id: 't1', size: tokenSize } } } };
  const ruler = new DragRuler(
    view as unknown as DragRulerView,
    snappingGrid(grid) as GridSystem,
    { getState: () => state as unknown as ViewAtlasState },
    () => pathfinder,
  );
  return { ruler, label: () => view.draw.mock.lastCall![1] };
}

/** The labels the drag ruler shows for the same drag of a token through `steps`, a waypoint at each but the last, started from every cell. */
function dragRulerLabels(grid: SnappingGridOptions, steps: readonly (readonly [number, number])[], tokenSize = 1): string[] {
  const { ruler, label } = dragRuler(grid, tokenSize);
  const labels = new Set<string>();
  for (const [col, row] of startCells()) {
    ruler.begin('t1', pointInCell(grid, col, row, tokenSize));
    steps.forEach(([dCol, dRow], index) => {
      ruler.update(pointInCell(grid, col + dCol, row + dRow, tokenSize));
      if (index < steps.length - 1) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    labels.add(label());
    ruler.end();
  }
  return [...labels];
}

describe.each(ALIGNED_GRIDS)('Pathfinder distances on a grid of size $size at $offsetX/$offsetY', (grid) => {
  it('are the same wherever the measure tool measures', () => {
    expect(measureToolLabels(grid, 1, 1)).toEqual(['5ft']);
    expect(measureToolLabels(grid, 2, 2)).toEqual(['15ft']);
    expect(measureToolLabels(grid, -3, 3)).toEqual(['20ft']);
    expect(measureToolLabels(grid, 4, 0)).toEqual(['20ft']);
  });

  it('are the same wherever a token is dragged', () => {
    expect(dragRulerLabels(grid, [[2, 2]])).toEqual(['15ft']);
    expect(dragRulerLabels(grid, [[4, -4]])).toEqual(['30ft']);
  });

  it('count the diagonals of a dragged token across its waypoints', () => {
    expect(dragRulerLabels(grid, [[1, 1], [2, 2]])).toEqual(['15ft']);
    expect(dragRulerLabels(grid, [[3, 3], [5, 3], [6, 2]])).toEqual(['40ft']);
  });

  it.each([1.5, 2.5])('are the same for a token of size %s, which snaps to where cells meet', (tokenSize) => {
    expect(dragRulerLabels(grid, [[2, 2]], tokenSize)).toEqual(['15ft']);
  });

  it('agree between the measure tool and the drag ruler', () => {
    expect(measureToolLabels(grid, 3, 2)).toEqual(dragRulerLabels(grid, [[3, 2]]));
  });
});

describe.each(HEX_GRIDS)('distances on a $type grid of size $size at $offsetX/$offsetY', (grid) => {
  /** Three hexes along each of the grid's three axes, in axial steps. */
  const THREE_HEXES = [[3, 0], [0, 3], [3, -3]] as const;

  it.each([1, 1.5, 2, 2.5])('are the same wherever a token of size %s is dragged three hexes', (tokenSize) => {
    for (const step of THREE_HEXES) expect(dragRulerLabels(grid, [step], tokenSize)).toEqual(['15ft']);
  });

  it.each([1.5, 2.5])('count the hexes of a token of size %s across a waypoint', (tokenSize) => {
    expect(dragRulerLabels(grid, [[3, 0], [3, 2]], tokenSize)).toEqual(['25ft']);
  });

  it.each([1.5, 2.5])('are measured between the places a token of size %s is held at while tokens do not snap', (tokenSize) => {
    const { ruler, label } = dragRuler(grid, tokenSize, false);
    for (const [q, r] of startCells()) {
      const from = pointInCell(grid, q, r, tokenSize);
      const to = pointInCell(grid, q + 3, r - 1, tokenSize);
      ruler.begin('t1', from);
      ruler.update(to);
      expect(label()).toBe(formatDistance(pathLengthInCells(grid, [from, to], pathfinder.diagonalRule), pathfinder));
      ruler.end();
    }
  });

  it('are the same wherever the measure tool measures three hexes', () => {
    for (const [dq, dr] of THREE_HEXES) expect(measureToolLabels(grid, dq, dr)).toEqual(['15ft']);
  });
});
