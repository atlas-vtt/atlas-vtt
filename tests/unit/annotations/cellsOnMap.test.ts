// @vitest-environment jsdom
import type { Container, Graphics } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_DRAWINGS } from '../../../src/app/annotations/annotationTypes';
import { CELL_FILL_OPACITY } from '../../../src/app/annotations/cellFill';
import type { GridGeometry } from '../../../src/app/grid/gridDistance';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { DrawingStroke } from '../../../src/app/types';
import { CELL, drawScene, type DrawScene } from '../../helpers/drawScene';

let current: DrawScene | undefined;
afterEach(() => {
  current?.destroy();
  current = undefined;
});

function scene(options?: Parameters<typeof drawScene>[0]): DrawScene {
  current = drawScene(options);
  current.tool({ mode: 'cells', color: '#e93147' });
  return current;
}

const steps = (s: DrawScene): number => getHistoryStore(s.store)!.getState().pastStates.length;
const undo = (s: DrawScene): void => getHistoryStore(s.store)!.getState().undo();
/** The middle of the cell in `column` and `row`. */
const mid = (column: number, row: number): [number, number] => [(column + 0.5) * CELL, (row + 0.5) * CELL];
const xs = (drawing: DrawingStroke): number[] => [Math.min(...drawing.points.map(({ x }) => x)), Math.max(...drawing.points.map(({ x }) => x))];
const ys = (drawing: DrawingStroke): number[] => [Math.min(...drawing.points.map(({ y }) => y)), Math.max(...drawing.points.map(({ y }) => y))];
const live = (layer: Container): Graphics | null => layer.getChildByLabel('annotation-cells-live') as Graphics | null;
const clearing = (s: DrawScene): Graphics => s.renderer.chrome.getChildByLabel('annotation-cells-clearing') as Graphics;

describe('the Draw tool on the map: cells', () => {
  it('fills the cells a drag passes as one drawing on the map, in one undo step, and selects nothing', () => {
    const s = scene();
    s.drag([mid(1, 1), mid(2, 1), mid(3, 1), mid(3, 2)]);
    const [fill, ...more] = s.drawings();
    expect(more).toEqual([]);
    expect(fill).toMatchObject({ type: 'line', cells: true, color: '#e93147', width: 0, fill: 'solid', opacity: CELL_FILL_OPACITY, layer: 'map', order: 1 });
    expect(fill).not.toHaveProperty('hidden');
    expect(fill).not.toHaveProperty('group');
    // An L of four cells: six corners and the first again, on the grid's lines.
    expect(fill!.points).toHaveLength(7);
    expect([xs(fill!), ys(fill!)]).toEqual([[CELL, 4 * CELL], [CELL, 3 * CELL]]);
    expect(s.store.getState().selectedIds).toEqual([]);
    expect(steps(s)).toBe(1);
    undo(s);
    expect(s.drawings()).toEqual([]);
  });

  it('fills one cell by a click, and the cells between two places the pointer jumped', () => {
    const s = scene();
    s.click(...mid(4, 4));
    expect(s.drawings()[0]!.points).toHaveLength(5);
    s.drag([mid(0, 0), mid(5, 0)]);
    expect(xs(s.drawings()[1]!)).toEqual([0, 6 * CELL]);
    expect(steps(s)).toBe(2);
  });

  it('shows the cells under the pointer while the drag lasts, where their fill will lie, and works them out anew only in a new cell', () => {
    const s = scene();
    const { onMap, above } = s.renderer.layer;
    s.pointer('pointerdown', ...mid(1, 1));
    const shown = live(onMap)!;
    expect(shown.context.instructions.length).toBeGreaterThan(0);
    expect(live(above)).toBeNull();
    expect(s.drawings()).toEqual([]);
    const redrawn = vi.spyOn(shown, 'clear');
    // Within the cell: nothing is drawn again.
    for (let step = 0; step < 20; step++) s.pointer('pointermove', mid(1, 1)[0] + step, mid(1, 1)[1] - step);
    expect(redrawn).not.toHaveBeenCalled();
    s.pointer('pointermove', ...mid(2, 1));
    expect(redrawn).toHaveBeenCalledOnce();
    s.pointer('pointerup', ...mid(2, 1));
    expect(live(onMap)).toBeNull();
    expect(s.drawings()).toHaveLength(1);
  });

  it('keeps a fill to the GM, above the tokens, where the tool says so, and shows it there while it is dragged', () => {
    const s = scene();
    s.tool({ mode: 'cells', players: false, cellsLayer: 'above' });
    s.pointer('pointerdown', ...mid(1, 1));
    expect(live(s.renderer.layer.aboveHidden)).not.toBeNull();
    expect(live(s.renderer.layer.above)).toBeNull();
    s.pointer('pointerup', ...mid(1, 1));
    expect(s.drawings()[0]).toMatchObject({ hidden: true, cells: true });
    expect(s.drawings()[0]).not.toHaveProperty('layer');
    // The other modes' layer is another choice.
    expect(s.store.getState().drawTool).toMatchObject({ layer: 'above', cellsLayer: 'above' });
  });

  it('joins the fill of its colour it touches, and no other', () => {
    const s = scene();
    s.drag([mid(1, 1), mid(2, 1)]);
    s.tool({ mode: 'cells', color: '#086ddd' });
    s.drag([mid(1, 2), mid(2, 2)]);
    s.tool({ mode: 'cells', color: '#e93147' });
    s.drag([mid(3, 1), mid(3, 2), mid(3, 3)]);
    expect(s.drawings().map(({ color }) => color)).toEqual(['#086ddd', '#e93147']);
    const red = s.drawings()[1]!;
    expect([xs(red), ys(red)]).toEqual([[CELL, 4 * CELL], [CELL, 4 * CELL]]);
    // It lies where the fill it joined lay: under the blue one.
    expect(red.order).toBe(1);
    expect(steps(s)).toBe(3);
    undo(s);
    expect(s.drawings()).toHaveLength(2);
    expect(xs(s.drawings().find(({ color }) => color === '#e93147')!)).toEqual([CELL, 3 * CELL]);
  });

  it('paints over a cell of another colour: the cell is the new colour alone, in one undo step, and the same colour again is no step', () => {
    const s = scene();
    s.drag([mid(0, 1), mid(4, 1)]);
    s.tool({ mode: 'cells', color: '#086ddd' });
    const before = steps(s);
    // Every write to the drawings is another record object: counted, a drag is one.
    let writes = 0;
    const unsubscribe = s.store.subscribe((state, previous) => { if (state.objects.drawings !== previous.objects.drawings) writes++; });
    s.pointer('pointerdown', ...mid(2, 1));
    // While the drag lasts the cell shows in the new colour over the old one; nothing is written yet.
    expect(live(s.renderer.layer.onMap)!.context.instructions.length).toBeGreaterThan(0);
    expect(s.drawings()).toHaveLength(1);
    s.pointer('pointerup', ...mid(2, 1));
    expect(writes).toBe(1);
    // The red row is two pieces beside the blue cell, each where the row lay; none of them reaches into the cell.
    const fills = s.drawings().map((drawing) => [drawing.color, ...xs(drawing)]);
    expect(fills).toEqual([['#e93147', 0, 2 * CELL], ['#e93147', 3 * CELL, 5 * CELL], ['#086ddd', 2 * CELL, 3 * CELL]]);
    expect(s.drawings().map(({ order }) => order)).toEqual([1, 1, 2]);
    expect(steps(s)).toBe(before + 1);
    // Blue on blue changes nothing and leaves no step.
    s.click(...mid(2, 1));
    expect(writes).toBe(1);
    expect(steps(s)).toBe(before + 1);
    unsubscribe();
    undo(s);
    expect(s.drawings().map((drawing) => [drawing.color, ...xs(drawing)])).toEqual([['#e93147', 0, 5 * CELL]]);
    // A fill above the tokens, and one only the GM sees, take nothing from the row on the map.
    s.tool({ mode: 'cells', color: '#086ddd', cellsLayer: 'above' });
    s.click(...mid(1, 1));
    s.tool({ mode: 'cells', color: '#086ddd', cellsLayer: 'map', players: false });
    s.click(...mid(3, 1));
    expect(s.drawings().map((drawing) => [drawing.color, ...xs(drawing)])).toEqual([['#e93147', 0, 5 * CELL], ['#086ddd', CELL, 2 * CELL], ['#086ddd', 3 * CELL, 4 * CELL]]);
  });

  it('clears cells of any colour with Unfill, marked for the GM alone while the drag lasts, in one undo step', () => {
    const s = scene();
    s.drag([mid(0, 1), mid(4, 1)]);
    s.tool({ mode: 'cells', color: '#086ddd', cellsLayer: 'above' });
    s.drag([mid(2, 0), mid(2, 3)]);
    expect(s.drawings()).toHaveLength(2);
    const before = steps(s);
    s.tool({ mode: 'cells', cellsUnfill: true });
    s.pointer('pointerdown', ...mid(2, 1));
    expect(clearing(s).context.instructions.length).toBeGreaterThan(0);
    expect(live(s.renderer.layer.onMap)).toBeNull();
    expect(live(s.renderer.layer.above)).toBeNull();
    expect(s.drawings()).toHaveLength(2);
    s.pointer('pointerup', ...mid(2, 1));
    expect(clearing(s).context.instructions).toHaveLength(0);
    // The red row falls into two, the blue column into two: four drawings, none of them over the cleared cell.
    expect(s.drawings().map(({ color }) => color).sort()).toEqual(['#086ddd', '#086ddd', '#e93147', '#e93147']);
    for (const drawing of s.drawings()) expect(drawing).not.toHaveProperty('group');
    expect(steps(s)).toBe(before + 1);
    undo(s);
    expect(s.drawings()).toHaveLength(2);
    // Where nothing is filled, clearing writes nothing.
    s.drag([mid(7, 7), mid(8, 7)]);
    expect(steps(s)).toBe(before);
  });

  it('neither joins nor clears a locked fill', () => {
    const s = scene();
    s.click(...mid(1, 1));
    const locked = s.drawings()[0]!.id;
    s.store.getState().updateAnnotations([locked], { locked: true });
    s.drag([mid(2, 1), mid(3, 1)]);
    expect(s.drawings()).toHaveLength(2);
    s.tool({ mode: 'cells', cellsUnfill: true });
    s.drag([mid(0, 1), mid(4, 1)]);
    expect(s.drawings().map(({ id }) => id)).toEqual([locked]);
  });

  it('writes nothing for a drag dropped with Escape', () => {
    const s = scene();
    s.pointer('pointerdown', ...mid(1, 1));
    s.pointer('pointermove', ...mid(2, 1));
    expect(s.key('Escape').defaultPrevented).toBe(true);
    expect(live(s.renderer.layer.onMap)).toBeNull();
    s.pointer('pointerup', ...mid(2, 1));
    expect(s.drawings()).toEqual([]);
    expect(steps(s)).toBe(0);
  });

  it('fills hexes by the grid\'s own cells', () => {
    const grid: GridGeometry = { type: 'hex-vertical', size: CELL, offsetX: 0, offsetY: 0 };
    const s = scene({ grid });
    // The hex at the origin and its neighbour to the right: ten corners and the first again.
    s.drag([[35, 40], [105, 40]]);
    expect(s.drawings()[0]!.points).toHaveLength(11);
    expect(xs(s.drawings()[0]!)).toEqual([0, 2 * CELL]);
  });

  it('fills nothing on a map without a grid, or with its grid switched off', () => {
    const none = scene({ grid: null });
    none.drag([mid(1, 1), mid(2, 1)]);
    expect(none.drawings()).toEqual([]);
    none.destroy();
    const off = scene();
    off.store.getState().setGridVisible(false);
    off.drag([mid(1, 1), mid(2, 1)]);
    expect(off.drawings()).toEqual([]);
    expect(live(off.renderer.layer.onMap)).toBeNull();
    off.store.getState().setGridVisible(true);
    off.drag([mid(1, 1), mid(2, 1)]);
    expect(off.drawings()).toHaveLength(1);
  });

  it('fills nothing while the canvas shows the players\' picture, and nothing more on a level that is full', () => {
    const s = scene();
    s.players.shown = true;
    s.renderer.refreshVisibility();
    s.drag([mid(1, 1), mid(2, 1)]);
    expect(s.drawings()).toEqual([]);
    s.players.shown = null;
    s.renderer.refreshVisibility();
    const { objects } = s.store.getState();
    const pen = (id: string): DrawingStroke => ({ id, kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: 900, y: 900 }, { x: 910, y: 900 }], color: '#ffffff', width: 4, opacity: 1 });
    s.store.setState({ objects: { ...objects, drawings: Object.fromEntries(Array.from({ length: MAX_DRAWINGS }, (_unused, index) => [`d${index}`, pen(`d${index}`)])) } });
    s.drag([mid(1, 1), mid(2, 1)]);
    expect(s.drawings()).toHaveLength(MAX_DRAWINGS);
    expect(s.full).toHaveBeenCalledWith('drawings');
  });
});
