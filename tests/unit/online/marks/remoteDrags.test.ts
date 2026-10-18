import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bounds, Text } from 'pixi.js';
import { dragPathCells, RemoteDrags, type RemoteDrag } from '../../../../src/app/online/marks/RemoteDrags.ts';
import type { MeasureRules } from '../../../../src/app/online/marks/RemoteMeasures.ts';
import { cellToWorld, worldToCell, type FormationGrid } from '../../../../src/app/encounters/encounterFormation';
import { snapTokenCenter } from '../../../../src/app/grid/gridPlacement';
import { formatDistance, resolveMeasurementSettings, type MeasurementSettings } from '../../../../src/app/grid/measurementFormat';
import type { GridSystem } from '../../../../src/app/grid/GridSystem';
import { DragRuler } from '../../../../src/app/pixi/token-renderer/DragRuler';
import type { DragRulerView } from '../../../../src/app/pixi/token-renderer/DragRulerView';
import type { ViewAtlasState } from '../../../../src/app/storeFactory';
import type { DiagonalRule } from '../../../../src/app/types/collectionSettingsTypes';

const GRID = { type: 'square', size: 70, offsetX: 0, offsetY: 0 } as const;
const RULES: MeasureRules = { grid: GRID, measurement: resolveMeasurementSettings(undefined, null) };
const cells = (count: number): string => formatDistance(count, RULES.measurement);
const drag = (path: readonly [number, number][], changes: Partial<RemoteDrag> = {}): RemoteDrag => ({ key: 'ogre', path: path.map(([x, y]) => ({ x, y })), cells: 1, snaps: true, ...changes });

/** What Atlas's own drag ruler labels a path of a token of `size` with, the token held and snapped to `grid`. */
function atlasLabel(grid: FormationGrid, settings: MeasurementSettings, points: readonly { x: number; y: number }[], size: number): string | undefined {
  const draw = vi.fn();
  const view = { draw, clear: vi.fn(), destroy: vi.fn(), layers: [] };
  const state = { grid: { snapToGrid: true }, objects: { tokens: { t: { id: 't', size } } } };
  // The points are snapped already: the grid hands them back as they are.
  const gridSystem = { getOptions: () => grid, snapTokenCenter: (x: number, y: number) => ({ x, y }) };
  const ruler = new DragRuler(view as unknown as DragRulerView, gridSystem as unknown as GridSystem, { getState: () => state as unknown as ViewAtlasState }, () => settings);
  ruler.begin('t', points[0] ?? { x: 0, y: 0 });
  for (const point of points.slice(1, -1)) {
    ruler.update(point);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  }
  ruler.update(points.at(-1) ?? { x: 0, y: 0 });
  ruler.end();
  return draw.mock.lastCall?.[1] as string | undefined;
}

describe('a drag measured elsewhere', () => {
  it('reads as Atlas\'s own drag ruler labels it, on every grid, diagonal rule and token size (seeded)', () => {
    let seed = 7;
    const random = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const grids: FormationGrid[] = [
      { type: 'square', size: 70, offsetX: 12, offsetY: -5 },
      { type: 'hex-vertical', size: 64, offsetX: 3, offsetY: 9 },
      { type: 'hex-horizontal', size: 50, offsetX: 0, offsetY: 0 },
    ];
    const rules: DiagonalRule[] = ['equidistant', 'alternating', 'euclidean'];
    let compared = 0;
    for (let trial = 0; trial < 300; trial += 1) {
      const grid = grids[trial % grids.length] as FormationGrid;
      const size = [0.5, 1, 1.5, 2, 3, 4][Math.floor(random() * 6)] ?? 1;
      const settings: MeasurementSettings = { ...resolveMeasurementSettings(undefined, null), diagonalRule: rules[Math.floor(random() * 3)] ?? 'equidistant' };
      const points = Array.from({ length: 2 + Math.floor(random() * 3) }, () => snapTokenCenter({ x: random() * 2000, y: random() * 2000 }, size, grid.type, grid.size, (at) => cellToWorld(grid, worldToCell(grid, at))));
      const expected = atlasLabel(grid, settings, points, size);
      if (expected === undefined) continue;
      expect(formatDistance(dragPathCells({ grid, measurement: settings }, points, size, true), settings), `trial ${trial}`).toBe(expected);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(250);
  });
});

describe('RemoteDrags', () => {
  let drags: RemoteDrags;
  const labels = (): string[] => drags.labels.children.filter((child): child is Text => child instanceof Text).map((text) => text.text);

  beforeEach(() => {
    // jsdom cannot measure text; a label's size plays no part in where it stands.
    vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue(new Bounds(0, 0, 40, 18));
    drags = new RemoteDrags(() => 1, () => RULES);
  });

  afterEach(() => {
    drags.destroy();
    vi.restoreAllMocks();
  });

  it('draws a path and its distance for each drag, and takes them away when they end', () => {
    drags.update([drag([[35, 35], [245, 35]]), drag([[35, 105], [35, 245], [105, 245]], { key: 'bear' })]);
    expect(labels()).toEqual([cells(3), cells(3)]);
    expect(drags.paths.children).toHaveLength(2);
    drags.update([drag([[35, 35], [315, 35]])]);
    expect(labels()).toEqual([cells(4)]);
    expect(drags.showing).toBe(true);
    drags.update([]);
    expect(labels()).toEqual([]);
    expect(drags.paths.children).toHaveLength(0);
    expect(drags.showing).toBe(false);
  });

  it('measures a large token from the cell its footprint starts from', () => {
    // A 2×2 token centres where cells meet: two cells to the right is two cells, not three.
    drags.update([drag([[70, 70], [210, 70]], { cells: 1.5 })]);
    expect(labels()).toEqual([cells(2)]);
  });

  it('shows nothing for a drag that has not left its start', () => {
    drags.update([drag([[35, 35], [35.2, 35]]), drag([[35, 35]], { key: 'bear' })]);
    expect(drags.showing).toBe(false);
  });

  it('shows nothing before the scene\'s rules are known', () => {
    const none = new RemoteDrags(() => 1, () => null);
    none.update([drag([[35, 35], [245, 35]])]);
    expect(none.showing).toBe(false);
    none.destroy();
  });
});
