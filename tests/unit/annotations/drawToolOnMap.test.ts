// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_DRAWINGS, MAX_HOLES, MAX_TEXTS } from '../../../src/app/annotations/annotationTypes';
import { eraserRadius, stampSize, strokeWidth, textHeight } from '../../../src/app/annotations/drawSizes';
import { inFill } from '../../../src/app/annotations/lineMath';
import { FONT_FAMILIES, TEXT_PLATE } from '../../../src/app/annotations/madeText';
import { markHandled, resetHandled } from '../../../src/app/pixi/utils/handledEvents';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { DrawingStroke, TextElement } from '../../../src/app/types';
import { CELL, drawScene, type DrawScene } from '../../helpers/drawScene';

let current: DrawScene | undefined;
afterEach(() => {
  current?.destroy();
  current = undefined;
});

function scene(options?: Parameters<typeof drawScene>[0]): DrawScene {
  current = drawScene(options);
  return current;
}

const history = (s: DrawScene): NonNullable<ReturnType<typeof getHistoryStore>> => getHistoryStore(s.store)!;
const steps = (s: DrawScene): number => history(s).getState().pastStates.length;
const pt = (x: number, y: number): { x: number; y: number } => ({ x, y });

/** A level that already holds `drawings` and `texts`, as a file would bring them. */
function holding(s: DrawScene, drawings: Record<string, Partial<DrawingStroke>>, texts: Record<string, Partial<TextElement>> = {}): void {
  const { objects } = s.store.getState();
  s.store.setState({
    objects: {
      ...objects,
      drawings: Object.fromEntries(Object.entries(drawings).map(([id, drawing]) => [id, { id, kind: 'drawing', timestamp: 1, type: 'pen', points: [pt(0, 100), pt(400, 100)], color: '#ffffff', width: 4, opacity: 1, ...drawing } as DrawingStroke])),
      texts: Object.fromEntries(Object.entries(texts).map(([id, text]) => [id, { id, kind: 'text', x: 200, y: 300, text: 'Vault', fontSize: 24, fontFamily: 'Arial', color: '#ffffff', ...text } as TextElement])),
    },
  });
}

describe('the Draw tool on the map: the pen', () => {
  it('leaves one drawing in the tool\'s look, as one undo step', () => {
    const s = scene();
    s.tool({ mode: 'pen', color: '#ff0000', size: 'l' });
    s.drag([[10, 10], [60, 12], [120, 40]]);
    const [stroke, ...more] = s.drawings();
    expect(more).toEqual([]);
    expect(stroke).toMatchObject({ kind: 'drawing', type: 'pen', color: '#ff0000', width: strokeWidth('l', CELL), opacity: 1 });
    expect(stroke).not.toHaveProperty('hidden');
    expect(stroke).not.toHaveProperty('layer');
    // The pen never snaps: its line begins and ends where the pointer was.
    expect(stroke?.points[0]).toEqual(pt(10, 10));
    expect(stroke?.points.at(-1)).toEqual(pt(120, 40));
    expect(steps(s)).toBe(1);
    history(s).getState().undo();
    expect(s.drawings()).toEqual([]);
  });

  it('keeps a drawing to the GM, puts it on the map and makes it see-through where the tool says so', () => {
    const s = scene();
    s.tool({ mode: 'pen', players: false, layer: 'map', seeThrough: true });
    s.drag([[10, 10], [200, 10]]);
    expect(s.drawings()[0]).toMatchObject({ hidden: true, layer: 'map', opacity: 0.5 });
  });

  it('shows the stroke under way in the layer its drawing will lie in, and takes it away with the release', () => {
    const s = scene();
    const live = (): string | undefined => [s.renderer.layer.above, s.renderer.layer.aboveHidden, s.renderer.layer.onMap, s.renderer.layer.onMapHidden]
      .find((layer) => layer.children.some((child) => child.label === 'annotation-live'))?.label ?? undefined;
    s.tool({ mode: 'pen' });
    s.pointer('pointerdown', 10, 10);
    s.pointer('pointermove', 80, 10);
    expect(live()).toBe('annotations');
    s.pointer('pointerup', 80, 10);
    expect(live()).toBeUndefined();
    s.tool({ mode: 'pen', players: false, layer: 'map' });
    s.pointer('pointerdown', 10, 10);
    s.pointer('pointermove', 80, 10);
    expect(live()).toBe('annotations-on-map-hidden');
    s.pointer('pointerup', 80, 10);
  });

  it('draws with the primary button alone, and leaves a press something else took', () => {
    const s = scene();
    s.tool({ mode: 'pen' });
    s.drag([[10, 10], [200, 10]], { button: 2 });
    expect(s.drawings()).toEqual([]);
    // The dispatch claimed the press (a pin, a door badge): PIXI hands every listener the same event.
    s.viewport.once('pointerdown', markHandled);
    s.renderer.hearPressesLast();
    s.drag([[10, 10], [200, 10]]);
    expect(s.drawings()).toEqual([]);
    s.viewport.once('pointerdown', resetHandled);
    s.renderer.hearPressesLast();
    s.drag([[10, 10], [200, 10]]);
    expect(s.drawings()).toHaveLength(1);
  });
});

describe('the Draw tool on the map: shapes', () => {
  it('snaps a line\'s ends to the grid, and Alt places them freely', () => {
    const s = scene();
    s.tool({ mode: 'line', ends: 'end', dash: 'dashed' });
    s.drag([[3, 4], [141, 68]]);
    expect(s.drawings()[0]).toMatchObject({ type: 'line', points: [pt(0, 0), pt(140, 70)], ends: 'end', dash: 'dashed' });
    s.drag([[303, 4], [441, 68]], { alt: true });
    expect(s.drawings()[1]?.points).toEqual([pt(303, 4), pt(441, 68)]);
  });

  it('places freely where the grid\'s Snap is off', () => {
    const s = scene();
    s.store.getState().setGrid({ snapToGrid: false });
    s.tool({ mode: 'line' });
    s.drag([[3, 4], [141, 68]]);
    expect(s.drawings()[0]?.points).toEqual([pt(3, 4), pt(141, 68)]);
  });

  it('makes a rectangle from corner to corner with the tool\'s fill, and an ellipse in the dragged box', () => {
    const s = scene();
    s.tool({ mode: 'rectangle', fill: 'soft' });
    s.drag([[0, 0], [140, 70]]);
    expect(s.drawings()[0]).toMatchObject({ type: 'rectangle', fill: 'soft', points: [pt(0, 0), pt(140, 0), pt(140, 70), pt(0, 70), pt(0, 0)] });
    s.tool({ mode: 'ellipse', fill: null });
    s.drag([[0, 140], [140, 210]]);
    const ellipse = s.drawings()[1];
    expect(ellipse).toMatchObject({ type: 'circle' });
    expect(ellipse).not.toHaveProperty('fill');
    expect(ellipse?.points).toHaveLength(65);
  });

  it('places a line click by click, ends it on a double click, and draws nothing with that click\'s second press', () => {
    const s = scene();
    s.tool({ mode: 'line', curved: true });
    s.click(0, 0);
    s.click(140, 0);
    s.click(140, 140);
    s.click(140, 140);
    const [path, ...more] = s.drawings();
    expect(more).toEqual([]);
    expect(path).toMatchObject({ type: 'line', anchors: [pt(0, 0), pt(140, 0), pt(140, 140)] });
    expect(path?.points.length).toBeGreaterThan(3);
    expect(steps(s)).toBe(1);
  });

  it('closes a line that ends on its first corner and fills it', () => {
    const s = scene();
    s.tool({ mode: 'line', fill: 'solid', ends: 'both' });
    s.click(0, 0);
    s.click(140, 0);
    s.click(140, 140);
    s.click(1, 2);
    const [room] = s.drawings();
    expect(room?.points).toEqual([pt(0, 0), pt(140, 0), pt(140, 140), pt(0, 0)]);
    expect(room).toMatchObject({ fill: 'solid' });
    // A closed line has no ends to point with.
    expect(room).not.toHaveProperty('ends');
  });

  it('adds a corner with Space before the map\'s hotkeys hear it, and drops the shape on Escape', () => {
    const s = scene();
    const hotkeys = vi.fn();
    document.addEventListener('keydown', hotkeys);
    try {
      s.tool({ mode: 'line' });
      s.pointer('pointerdown', 0, 0);
      s.pointer('pointermove', 140, 0);
      expect(s.key(' ').defaultPrevented).toBe(true);
      s.pointer('pointermove', 140, 140);
      s.pointer('pointerup', 140, 140);
      expect(s.drawings()[0]?.points).toEqual([pt(0, 0), pt(140, 0), pt(140, 140)]);
      expect(hotkeys).not.toHaveBeenCalled();
      // With nothing under way the keys are the map's again.
      expect(s.key(' ').defaultPrevented).toBe(false);
      expect(hotkeys).toHaveBeenCalledTimes(1);

      s.pointer('pointerdown', 0, 280);
      s.pointer('pointermove', 140, 280);
      s.key('Escape');
      s.pointer('pointerup', 140, 280);
      expect(s.drawings()).toHaveLength(1);
      expect(s.renderer.drawing).toBe(false);
    } finally {
      document.removeEventListener('keydown', hotkeys);
    }
  });

  it('drops a shape that waits for its next click when a key is pressed that is not the map\'s, and leaves the key alone', () => {
    let mapsKeys = true;
    const s = scene({ keysBelongToMap: () => mapsKeys });
    s.tool({ mode: 'line' });
    s.click(0, 0);
    s.pointer('pointermove', 140, 0);
    expect(s.renderer.drawing).toBe(true);
    mapsKeys = false;
    expect(s.key(' ').defaultPrevented).toBe(false);
    expect(s.renderer.drawing).toBe(false);
    expect(s.drawings()).toEqual([]);
  });

  it('drops the shape under way when the mode changes, another tool is taken, a panel opens over the map or the view is left', () => {
    const s = scene();
    const begin = (): void => {
      s.tool({ mode: 'line' });
      s.click(0, 0);
      s.pointer('pointermove', 140, 0);
      expect(s.renderer.drawing).toBe(true);
    };
    begin();
    s.store.getState().setDrawTool({ mode: 'rectangle' });
    expect(s.renderer.drawing).toBe(false);
    begin();
    s.store.getState().setActiveTool('move');
    expect(s.renderer.drawing).toBe(false);
    begin();
    s.store.getState().setDMScreenOpen(true);
    expect(s.renderer.drawing).toBe(false);
    s.store.getState().setDMScreenOpen(false);
    begin();
    s.renderer.leave();
    expect(s.renderer.drawing).toBe(false);
    expect(s.drawings()).toEqual([]);
  });
});

describe('the Draw tool on the map: the eraser', () => {
  it('cuts what its sweep passes, the whole sweep one undo step', () => {
    const s = scene();
    holding(s, { a: {}, b: { points: [pt(0, 200), pt(400, 200)] } });
    history(s).getState().clear();
    s.tool({ mode: 'eraser', size: 'm' });
    s.drag([[200, 60], [200, 120], [200, 240]]);
    const pieces = s.drawings();
    expect(pieces).toHaveLength(4);
    const reach = eraserRadius('m', CELL) + 2;
    // Each line is cut where the eraser's edge meets its own: a gap about the eraser wide, and nothing left inside it.
    for (const piece of pieces) {
      expect(piece.points.every(({ x }) => Math.abs(x - 200) >= reach - 0.5)).toBe(true);
      expect(piece).toMatchObject({ color: '#ffffff', width: 4 });
    }
    expect(pieces.some((piece) => piece.points.some(({ x }) => Math.abs(Math.abs(x - 200) - reach) < 0.5))).toBe(true);
    expect(steps(s)).toBe(1);
    history(s).getState().undo();
    expect(Object.keys(s.store.getState().objects.drawings).sort()).toEqual(['a', 'b']);
  });

  it('removes whole drawings with Alt, and where the tool is set to', () => {
    const s = scene();
    holding(s, { a: {}, b: { points: [pt(0, 200), pt(400, 200)] } });
    s.tool({ mode: 'eraser' });
    s.drag([[200, 60], [200, 120]], { alt: true });
    expect(s.drawings().map(({ id }) => id)).toEqual(['b']);
    s.store.getState().setDrawTool({ eraseWhole: true });
    s.drag([[200, 160], [200, 220]]);
    expect(s.drawings()).toEqual([]);
  });

  it('removes a text it reaches whole, and leaves what is locked', () => {
    const s = scene();
    holding(s, { locked: { locked: true } }, { label: {}, kept: { x: 600, y: 500 } });
    s.tool({ mode: 'eraser', size: 'xl' });
    s.drag([[200, 60], [200, 320]]);
    expect(s.drawings().map(({ id }) => id)).toEqual(['locked']);
    expect(s.texts().map(({ id }) => id)).toEqual(['kept']);
  });

  it('leaves no undo step where it reached nothing', () => {
    const s = scene();
    holding(s, { a: {} });
    history(s).getState().clear();
    s.tool({ mode: 'eraser' });
    s.drag([[600, 400], [700, 500]]);
    expect(steps(s)).toBe(0);
    expect(s.drawings()).toHaveLength(1);
  });

  it('ends its sweep, keeping what it erased, when the tool is put away with the button down', () => {
    const s = scene();
    holding(s, { a: {} });
    history(s).getState().clear();
    s.tool({ mode: 'eraser' });
    s.pointer('pointerdown', 200, 60);
    s.pointer('pointermove', 200, 120);
    s.store.getState().setActiveTool('move');
    expect(s.drawings()).toHaveLength(2);
    expect(steps(s)).toBe(1);
    // A later edit is a step of its own.
    s.store.getState().addDrawing({ type: 'pen', points: [pt(1, 1)], color: '#ffffff', width: 4, opacity: 1 });
    expect(steps(s)).toBe(2);
  });

  it('leaves a fill that can take no further cut as it is, says so once a sweep, and still erases it whole', () => {
    const s = scene();
    // A floor with as many holes as a drawing may have.
    const holes = Array.from({ length: MAX_HOLES }, (_, i) => {
      const x = 20 + (i % 32) * 20;
      const y = 300 + Math.floor(i / 32) * 20;
      return [pt(x, y), pt(x + 8, y), pt(x + 8, y + 8), pt(x, y + 8)];
    });
    holding(s, { floor: { type: 'rectangle', points: [pt(0, 0), pt(700, 0), pt(700, 500), pt(0, 500), pt(0, 0)], width: 0, fill: 'solid', holes } });
    const floor = s.drawings()[0];
    history(s).getState().clear();
    s.tool({ mode: 'eraser', size: 's' });
    // Three moves through its open middle: each would cut one hole more.
    s.drag([[100, 100], [200, 100], [300, 100], [400, 100]]);
    expect(s.drawings()).toEqual([floor]);
    expect(s.full.mock.calls).toEqual([['cuts']]);
    expect(steps(s)).toBe(0);
    // The next sweep says so again; one that removes whole drawings takes it.
    s.drag([[100, 150], [200, 150]]);
    expect(s.full).toHaveBeenCalledTimes(2);
    s.tool({ mode: 'eraser', eraseWhole: true });
    s.click(100, 100);
    expect(s.drawings()).toEqual([]);
  });

  it('cuts a fill it cut before where the eraser is, and the picture is the cut one', () => {
    const s = scene();
    holding(s, { floor: { type: 'rectangle', points: [pt(0, 0), pt(700, 0), pt(700, 500), pt(0, 500), pt(0, 0)], width: 0, fill: 'solid' } });
    s.tool({ mode: 'eraser', size: 'm' });
    s.drag([[100, 100], [160, 100], [220, 100]]);
    s.drag([[400, 300], [400, 360]]);
    const [floor, ...more] = s.drawings();
    expect(more).toEqual([]);
    expect(floor!.holes).toHaveLength(2);
    // The room's own corners are where they were: only the eraser's places were worked on.
    expect(floor!.points).toEqual([pt(0, 0), pt(700, 0), pt(700, 500), pt(0, 500), pt(0, 0)]);
    const reach = eraserRadius('m', CELL);
    for (const [x, y] of [[100, 100], [190, 100], [400, 330]] as const) expect(floor!.holes!.some((hole) => hole.every((corner) => Math.abs(Math.hypot(corner.x - x, corner.y - y)) < 130 + reach))).toBe(true);
    expect(inFill(pt(160, 100), floor!.points, floor!.holes!)).toBe(false);
    expect(inFill(pt(400, 340), floor!.points, floor!.holes!)).toBe(false);
    expect(inFill(pt(300, 200), floor!.points, floor!.holes!)).toBe(true);
  });
});

describe('the Draw tool on the map: stamps', () => {
  it('places the tool\'s symbol on the cell under a press, as large as the tool says', () => {
    const s = scene();
    s.tool({ mode: 'stamp', icon: 'skull', color: '#00ff00', size: 'm' });
    s.click(80, 150);
    expect(s.drawings()).toEqual([expect.objectContaining({ type: 'icon', icon: 'skull', color: '#00ff00', width: stampSize('m', CELL), opacity: 1, points: [pt(105, 175)] })]);
    // A stamp two cells wide sits where four cells meet; Alt places any stamp freely.
    s.store.getState().setDrawTool({ size: 'l' });
    s.click(80, 150);
    expect(s.drawings()[1]?.points).toEqual([pt(70, 140)]);
    s.click(81, 151, { alt: true });
    expect(s.drawings()[2]?.points).toEqual([pt(81, 151)]);
    // A press that pans places none.
    s.click(300, 300, { button: 2 });
    expect(s.drawings()).toHaveLength(3);
    expect(steps(s)).toBe(3);
  });
});

describe('the Draw tool on the map: limits and views', () => {
  it('adds nothing to a level that is full, and says so', async () => {
    const s = scene();
    holding(
      s,
      // One line across the map, and dots far from it.
      Object.fromEntries(Array.from({ length: MAX_DRAWINGS }, (_, index) => [`d${index}`, index === 0 ? {} : { points: [pt(1000 + index, 900)] }])),
      Object.fromEntries(Array.from({ length: MAX_TEXTS }, (_, index) => [`t${index}`, { x: 1500, y: 1500 + index }])),
    );
    s.tool({ mode: 'pen' });
    s.drag([[10, 10], [200, 10]]);
    expect(s.full).toHaveBeenLastCalledWith('drawings');
    s.tool({ mode: 'stamp' });
    s.click(80, 150);
    expect(s.full).toHaveBeenCalledTimes(2);
    expect(s.drawings()).toHaveLength(MAX_DRAWINGS);
    s.tool({ mode: 'text' });
    s.click(80, 150);
    expect(s.full).toHaveBeenLastCalledWith('texts');
    expect(s.field()).toBeNull();
    // The eraser cuts nothing that would leave more drawings than the level holds, and says so once a sweep.
    s.tool({ mode: 'eraser', size: 's' });
    s.drag([[200, 60], [200, 100], [200, 140]]);
    expect(s.drawings()).toHaveLength(MAX_DRAWINGS);
    expect(s.store.getState().objects.drawings.d0?.points).toHaveLength(2);
    expect(s.full).toHaveBeenCalledTimes(4);
    expect(s.full).toHaveBeenLastCalledWith('drawings');
    // Taking a whole drawing away needs no room.
    s.drag([[200, 60], [200, 140]], { alt: true });
    expect(s.drawings()).toHaveLength(MAX_DRAWINGS - 1);
  });

  it('works on the GM\'s view alone: nothing is drawn in session view, and a peek drops the shape under way', () => {
    const s = scene();
    s.tool({ mode: 'pen' });
    s.store.getState().setGMView(false);
    s.drag([[10, 10], [200, 10]]);
    expect(s.drawings()).toEqual([]);
    s.store.getState().setGMView(true);
    s.tool({ mode: 'line' });
    s.click(0, 0);
    s.pointer('pointermove', 140, 0);
    expect(s.renderer.drawing).toBe(true);
    s.players.shown = true;
    s.renderer.refreshVisibility();
    expect(s.renderer.drawing).toBe(false);
    s.click(140, 0);
    expect(s.drawings()).toEqual([]);
  });

  it('draws and erases over a text: in a mode that works on the map, a text takes no press', () => {
    const s = scene();
    holding(s, {}, { vault: { x: 200, y: 300 } });
    for (const mode of ['pen', 'line', 'rectangle', 'ellipse'] as const) {
      s.tool({ mode });
      // What the mode before made is let go of: its handles would take a press on them.
      s.store.getState().clearSelection();
      const before = s.drawings().length;
      expect(s.pull([[200, 300], [270, 370]]), mode).toBe(false);
      expect(s.drawings(), mode).toHaveLength(before + 1);
      expect(s.texts()[0], mode).toMatchObject({ x: 200, y: 300 });
    }
  });
});
