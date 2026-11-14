import { describe, expect, it, vi } from 'vitest';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { DEFAULT_FOG_TOOL, type FogToolChoices } from '../../src/app/fog/fogToolChoices';
import { fogGestureScene as fogTool, fogPointerAt } from '../helpers/fogGestureHarness';

const at = (x: number, y: number, altKey = false): ReturnType<typeof fogPointerAt> => fogPointerAt(x, y, { altKey });

describe('the fog tool\'s stroke', () => {
  it('does not redraw fog for a pointer release without a stroke', () => {
    const { tool, picture } = fogTool('fog', 'brush');
    tool.pointerUp();
    expect(picture.showCommitted).not.toHaveBeenCalled();
  });

  it('commits fog with the fog tool and an erase with the eraser, as wide as the brush', () => {
    for (const [activeTool, isErasing] of [['fog', false], ['eraser', true]] as const) {
      const { tool, state } = fogTool(activeTool, 'brush');
      tool.drag.stroke.brushRadius = 35;
      tool.pointerDown(at(100, 100));
      tool.pointerMove(at(130, 110));
      tool.pointerUp();
      expect(state.addFogOperation).toHaveBeenCalledTimes(1);
      expect(state.addFogOperation).toHaveBeenCalledWith({ type: 'brush', isErasing, brushRadius: 35, points: [{ x: 100, y: 100 }, { x: 130, y: 110 }] });
    }
  });

  it('snaps only the rectangle: a lasso and a brush stroke go where the pointer went, and show no guide', () => {
    const lasso = fogTool('fog', 'lasso');
    lasso.state.objects.walls = { w: { id: 'w', p1: { x: 35, y: 35 }, p2: { x: 300, y: 35 } } };
    lasso.tool.pointerMove(at(33, 33));
    expect(lasso.guide.mark).toBeNull();
    lasso.tool.pointerDown(at(33, 33));
    lasso.tool.pointerMove(at(141, 37));
    lasso.tool.pointerMove(at(90, 121));
    expect(lasso.guide.mark).toBeNull();
    lasso.tool.pointerUp();
    expect(lasso.state.addFogArea).toHaveBeenCalledWith({ type: 'lasso', points: [{ x: 33, y: 33 }, { x: 141, y: 37 }, { x: 90, y: 121 }] });

    const brush = fogTool('fog', 'brush');
    brush.tool.pointerDown(at(33, 33));
    brush.tool.pointerUp();
    expect(brush.state.addFogOperation).toHaveBeenCalledWith({ type: 'brush', isErasing: false, brushRadius: 50, points: [{ x: 33, y: 33 }] });
    expect(brush.guide.mark).toBeNull();

    const rectangle = fogTool('eraser', 'rectangle');
    rectangle.tool.pointerDown(at(33, 33));
    rectangle.tool.pointerMove(at(141, 121));
    rectangle.tool.pointerUp();
    expect(rectangle.state.addFogOperation).toHaveBeenCalledWith({ type: 'rectangle', isErasing: true, x: 0, y: 0, width: 140, height: 140 });
  });

  it('snaps a rectangle to nothing of the grid while its Snap is off, and to nothing at all while Ctrl or Cmd is held', () => {
    const rectangle = fogTool('fog', 'rectangle');
    rectangle.state.grid.snapToGrid = false;
    rectangle.tool.pointerDown(at(33, 33));
    rectangle.tool.pointerMove(at(141, 121));
    rectangle.tool.pointerUp();
    expect(rectangle.state.addFogArea).toHaveBeenCalledWith({ type: 'rectangle', x: 33, y: 33, width: 108, height: 88 });

    for (const key of ['ctrlKey', 'metaKey'] as const) {
      const free = fogTool('fog', 'rectangle');
      free.state.objects.walls = { w: { id: 'w', p1: { x: 35, y: 35 }, p2: { x: 300, y: 35 } } };
      free.tool.pointerDown(fogPointerAt(33, 33, { [key]: true }));
      free.tool.pointerMove(fogPointerAt(141, 121, { [key]: true }));
      expect(free.guide.mark).toBeNull();
      free.tool.pointerUp();
      expect(free.state.addFogArea).toHaveBeenCalledWith({ type: 'rectangle', x: 33, y: 33, width: 108, height: 88 });
    }
  });

  it('lands a rectangle\'s corner on a wall\'s end close by before the grid, and shows what it snapped to', () => {
    const { tool, state, guide } = fogTool('fog', 'rectangle');
    state.objects.walls = { w: { id: 'w', p1: { x: 104, y: 97 }, p2: { x: 300, y: 97 } } };
    // Before the press the guide shows where the first corner would land.
    tool.pointerMove(at(100, 100));
    expect(guide.mark).toMatchObject({ kind: 'wall-end', point: { x: 104, y: 97 } });
    tool.pointerDown(at(100, 100));
    // Along the wall, away from its ends and from any grid corner: on the wall's line.
    tool.pointerMove(at(250, 101));
    expect(guide.mark).toMatchObject({ kind: 'wall', point: { x: 250, y: 97 }, from: { x: 104, y: 97 }, to: { x: 300, y: 97 } });
    tool.pointerMove(at(205, 215));
    expect(guide.mark).toMatchObject({ kind: 'grid', point: { x: 210, y: 210 } });
    tool.pointerUp();
    expect(state.addFogArea).toHaveBeenCalledWith({ type: 'rectangle', x: 104, y: 97, width: 106, height: 113 });
    // The guide goes with the stroke, and when the pointer leaves the map.
    expect(guide.mark).toBeNull();
    tool.pointerMove(at(100, 100));
    expect(guide.mark).not.toBeNull();
    tool.pointerLeave();
    expect(guide.mark).toBeNull();
  });

  it('makes a rectangle a square while Shift is held, also when the key goes down while the pointer rests', () => {
    const { tool, state, picture } = fogTool('fog', 'rectangle');
    tool.pointerDown(at(0, 0));
    tool.pointerMove(fogPointerAt(210, 139, { shiftKey: true }));
    expect(picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'rectangle', x: 0, y: 0, width: 210, height: 210 });
    // Let go: the rectangle is the pointer's again, without a move.
    tool.rekey({ shift: false, free: false });
    expect(picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'rectangle', x: 0, y: 0, width: 210, height: 140 });
    tool.rekey({ shift: true, free: false });
    tool.pointerUp();
    expect(state.addFogArea).toHaveBeenCalledWith({ type: 'rectangle', x: 0, y: 0, width: 210, height: 210 });

    // Towards the upper left the square grows that way.
    const back = fogTool('fog', 'rectangle');
    back.tool.pointerDown(at(280, 280));
    back.tool.pointerMove(fogPointerAt(211, 69, { shiftKey: true }));
    back.tool.pointerUp();
    expect(back.state.addFogArea).toHaveBeenCalledWith({ type: 'rectangle', x: 70, y: 70, width: 210, height: 210 });
  });

  it('hides the cells a drag passes as one shape, shown while the pointer is down, and nothing off a grid', () => {
    const { tool, state, picture } = fogTool('fog', 'cells');
    tool.pointerDown(at(10, 10));
    expect(tool.drag.active).toBe(true);
    expect(tool.keys.hold).toHaveBeenCalledTimes(1);
    expect(picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'lasso', isErasing: false, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 70 }] });
    // Within the cell: nothing is drawn anew.
    tool.pointerMove(at(60, 60));
    expect(picture.showStroke).toHaveBeenCalledTimes(1);
    // A fast move to the third cell of the row passes the second.
    tool.pointerMove(at(200, 30));
    expect(picture.showStroke).toHaveBeenCalledTimes(2);
    tool.pointerUp();
    expect(state.addFogArea).toHaveBeenCalledExactlyOnceWith({ type: 'lasso', points: [{ x: 0, y: 0 }, { x: 210, y: 0 }, { x: 210, y: 70 }, { x: 0, y: 70 }] });
    expect(state.addFogOperations).not.toHaveBeenCalled();
    expect(tool.keys.release).toHaveBeenCalled();

    const none = fogTool('fog', 'cells');
    none.state.grid.size = 0;
    none.tool.pointerDown(at(10, 10));
    none.tool.pointerMove(at(200, 30));
    none.tool.pointerUp();
    expect(none.tool.drag.active).toBe(false);
    expect(none.picture.showStroke).not.toHaveBeenCalled();
    expect(none.state.addFogOperation).not.toHaveBeenCalled();
  });

  it('outlines the cell under the pointer before a press, anew only for another cell, and not once the pointer has left', () => {
    const { tool, outline, picture } = fogTool('fog', 'cells');
    tool.pointerMove(at(10, 10));
    // A light line over a dark one: the cell is traced once for each.
    expect(outline.poly.mock.calls).toEqual([[[0, 0, 70, 0, 70, 70, 0, 70], true], [[0, 0, 70, 0, 70, 70, 0, 70], true]]);
    tool.pointerMove(at(60, 20));
    expect(outline.poly).toHaveBeenCalledTimes(2);
    tool.pointerMove(at(80, 20));
    expect(outline.poly).toHaveBeenLastCalledWith([70, 0, 140, 0, 140, 70, 70, 70], true);
    // Nothing of the fog's picture is drawn for it.
    expect(picture.showStroke).not.toHaveBeenCalled();
    outline.clear.mockClear();
    tool.pointerLeave();
    expect(outline.clear).toHaveBeenCalled();
    // Back on the cell it left: outlined again.
    tool.pointerMove(at(80, 20));
    expect(outline.poly).toHaveBeenCalledTimes(6);
  });

  it('commits cells that enclose a hole as their rows, in one step, and reveals with the revealing tool', () => {
    const { tool, state, picture, wash } = fogTool('eraser', 'cells');
    // Round the cell at (1, 1): a ring of eight.
    tool.pointerDown(at(35, 35));
    for (const [x, y] of [[175, 35], [175, 175], [35, 175], [35, 105]] as const) tool.pointerMove(at(x, y));
    // What it will reveal shows to the GM alone, off the fog's picture.
    expect(wash.shapes).toHaveLength(4);
    expect(picture.showStroke).not.toHaveBeenCalled();
    tool.pointerUp();
    expect(wash.shapes).toEqual([]);
    expect(state.addFogOperation).not.toHaveBeenCalled();
    expect(state.addFogOperations).toHaveBeenCalledExactlyOnceWith([
      { type: 'lasso', isErasing: true, points: [{ x: 0, y: 0 }, { x: 210, y: 0 }, { x: 210, y: 70 }, { x: 0, y: 70 }] },
      { type: 'lasso', isErasing: true, points: [{ x: 0, y: 70 }, { x: 70, y: 70 }, { x: 70, y: 140 }, { x: 0, y: 140 }] },
      { type: 'lasso', isErasing: true, points: [{ x: 140, y: 70 }, { x: 210, y: 70 }, { x: 210, y: 140 }, { x: 140, y: 140 }] },
      { type: 'lasso', isErasing: true, points: [{ x: 0, y: 140 }, { x: 210, y: 140 }, { x: 210, y: 210 }, { x: 0, y: 210 }] },
    ]);
  });

  it('drops the stroke under way when the bar chooses another shape: nothing is committed, and the brush\'s preview goes', () => {
    const { tool, state, picture } = fogTool('fog', 'brush');
    tool.pointerDown(at(100, 100));
    tool.pointerMove(at(160, 100));
    expect(picture.showStroke).toHaveBeenCalledTimes(2);
    expect(picture.showCommitted).not.toHaveBeenCalled();
    expect(tool.keys.hold).toHaveBeenCalledTimes(1);

    tool.follow({ ...state.fogTool, shape: 'lasso' });
    expect(tool.drag.active).toBe(false);
    expect(tool.keys.release).toHaveBeenCalled();
    // The fog as the store holds it, without the stroke that was painted on it.
    expect(picture.showCommitted).toHaveBeenCalledTimes(1);
    // A lasso has no ring.
    expect(tool.ring.shown).toBe(false);
    tool.pointerUp();
    expect(state.addFogOperation).not.toHaveBeenCalled();
    // The next drag is the new shape's.
    tool.pointerDown(at(0, 0));
    tool.pointerMove(at(140, 0));
    tool.pointerMove(at(140, 140));
    tool.pointerUp();
    expect(state.addFogArea).toHaveBeenCalledExactlyOnceWith({ type: 'lasso', points: [{ x: 0, y: 0 }, { x: 140, y: 0 }, { x: 140, y: 140 }] });
  });

  it('takes the brush\'s size from the tool\'s choices, and keeps a stroke under way while only the size changes', () => {
    const { tool, state } = fogTool('fog', 'brush');
    tool.pointerDown(at(100, 100));
    tool.follow({ ...state.fogTool, brushSize: 80 });
    expect(tool.drag.stroke.active).toBe(true);
    expect(tool.ring.radius).toBe(80);
    tool.pointerUp();
    expect(state.addFogOperation).toHaveBeenCalledWith({ type: 'brush', isErasing: false, brushRadius: 80, points: [{ x: 100, y: 100 }] });
  });

  it('does the other of hiding and revealing while Alt is held, as the ring and the preview show', () => {
    for (const [activeTool, reveals] of [['fog', false], ['eraser', true]] as const) {
      const { tool, state, picture } = fogTool(activeTool, 'brush');
      tool.pointerDown(at(100, 100, true));
      expect(tool.ring.erasing).toBe(!reveals);
      expect(picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'brush', isErasing: !reveals });
      tool.pointerMove(at(130, 100, true));
      tool.pointerUp();
      expect(state.addFogOperation).toHaveBeenCalledWith(expect.objectContaining({ isErasing: !reveals }));
    }
  });

  it('follows Alt pressed and let go during a stroke: what is committed is what the key says at the release', () => {
    const { tool, state, picture, wash } = fogTool('fog', 'rectangle');
    tool.pointerDown(at(0, 0));
    tool.pointerMove(at(140, 140));
    expect(picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'rectangle', isErasing: false });
    // The key goes down while the pointer rests: the preview turns around without a move. What
    // the rectangle hid on the fog's picture goes, and what it will reveal shows to the GM alone.
    tool.setFlipped(true);
    expect(picture.showStroke.mock.lastCall?.[0]).toBeUndefined();
    expect(wash.shapes).toMatchObject([{ type: 'rectangle', x: 0, y: 0, width: 140, height: 140 }]);
    tool.setFlipped(false);
    expect(picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'rectangle', isErasing: false });
    expect(wash.shapes).toEqual([]);
    tool.pointerUp();
    expect(state.addFogArea).toHaveBeenCalledWith({ type: 'rectangle', x: 0, y: 0, width: 140, height: 140 });
    expect(tool.keys.release).toHaveBeenCalled();
  });

  it('drops the stroke under way on Escape: nothing is committed and the fog is drawn as the store holds it', () => {
    const { tool, state, picture } = fogTool('fog', 'lasso');
    tool.pointerDown(at(33, 33));
    tool.pointerMove(at(141, 37));
    tool.pointerMove(at(90, 121));
    tool.drop();
    expect(tool.drag.stroke.active).toBe(false);
    expect(tool.keys.release).toHaveBeenCalled();
    expect(picture.showCommitted).toHaveBeenCalledTimes(1);
    // The pointer is still down: what it does until its release belongs to no stroke.
    tool.pointerMove(at(60, 200));
    tool.pointerUp();
    expect(state.addFogOperation).not.toHaveBeenCalled();
    // Without a stroke there is nothing to drop.
    tool.drop();
    expect(picture.showCommitted).toHaveBeenCalledTimes(1);
  });

  it('shows a lasso and a rectangle as the fog they will make, once they are a shape', () => {
    const lasso = fogTool('fog', 'lasso');
    lasso.tool.pointerDown(at(33, 33));
    lasso.tool.pointerMove(at(141, 37));
    // Two points are no area yet: the fog as it is.
    expect(lasso.picture.showStroke.mock.lastCall?.[0]).toBeUndefined();
    lasso.tool.pointerMove(at(90, 121));
    expect(lasso.picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'lasso', isErasing: false, points: [{ x: 33, y: 33 }, { x: 141, y: 37 }, { x: 90, y: 121 }] });
    expect(lasso.wash.shapes).toEqual([]);

    const rectangle = fogTool('fog', 'rectangle');
    rectangle.tool.pointerDown(at(33, 33));
    expect(rectangle.picture.showStroke.mock.lastCall?.[0]).toBeUndefined();
    rectangle.tool.pointerMove(at(141, 121));
    expect(rectangle.picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'rectangle', isErasing: false, x: 0, y: 0, width: 140, height: 140 });
    // Back on the first corner: no area, and the preview goes.
    rectangle.tool.pointerMove(at(33, 33));
    expect(rectangle.picture.showStroke.mock.lastCall?.[0]).toBeUndefined();
  });

  it('never puts what a rectangle, a lasso or a drag over cells will reveal on the fog\'s picture, which the players see: the GM alone is shown it', () => {
    const drags = {
      rectangle: [[0, 0], [140, 140], [210, 140]],
      lasso: [[33, 33], [141, 37], [90, 121], [40, 100]],
      cells: [[10, 10], [200, 30], [200, 100]],
    } as const;
    for (const shape of ['rectangle', 'lasso', 'cells'] as const) {
      // With the revealing tool, and with Alt held on the hiding one.
      for (const [activeTool, alt] of [['eraser', false], ['fog', true]] as const) {
        const { tool, state, picture, wash } = fogTool(activeTool, shape);
        const [first, ...rest] = drags[shape];
        tool.pointerDown(at(first[0], first[1], alt));
        for (const [x, y] of rest) tool.pointerMove(at(x, y, alt));
        expect(wash.shapes.length).toBeGreaterThan(0);
        expect(wash.shapes.every((washed) => washed.type !== 'brush')).toBe(true);
        expect(picture.showStroke.mock.calls.filter(([stroke]) => stroke !== undefined)).toEqual([]);
        // Dropped, nothing was ever taken from the picture, and nothing is.
        tool.drop();
        expect(wash.shapes).toEqual([]);
        expect(state.addFogOperation).not.toHaveBeenCalled();
        expect(state.addFogOperations).not.toHaveBeenCalled();
        expect(picture.showStroke.mock.calls.filter(([stroke]) => stroke !== undefined)).toEqual([]);
      }
      // Hiding, the same drag is fog on the picture at once: more fog for a moment tells the players nothing.
      const hiding = fogTool('fog', shape);
      const [first, ...rest] = drags[shape];
      hiding.tool.pointerDown(at(first[0], first[1]));
      for (const [x, y] of rest) hiding.tool.pointerMove(at(x, y));
      expect(hiding.picture.showStroke.mock.lastCall?.[0]).toBeDefined();
      expect(hiding.wash.shapes).toEqual([]);
    }
  });

  it('wipes fog away with the brush as it goes, on the fog\'s picture: the brush is live whatever it does', () => {
    for (const [activeTool, alt] of [['eraser', false], ['fog', true], ['fog', false], ['eraser', true]] as const) {
      const { tool, picture, wash } = fogTool(activeTool, 'brush');
      tool.pointerDown(at(100, 100, alt));
      tool.pointerMove(at(160, 110, alt));
      expect(picture.showStroke.mock.lastCall?.[0]).toMatchObject({ type: 'brush', isErasing: (activeTool === 'eraser') !== alt });
      expect(wash.shapes).toEqual([]);
    }
  });

  it('commits nothing for a lasso of two points or a rectangle that never moved, and shows the fog as it is', () => {
    const lasso = fogTool('fog', 'lasso');
    lasso.tool.pointerDown(at(33, 33));
    lasso.tool.pointerMove(at(141, 37));
    lasso.tool.pointerUp();
    expect(lasso.state.addFogOperation).not.toHaveBeenCalled();
    expect(lasso.picture.showCommitted).toHaveBeenCalledTimes(1);
    const rectangle = fogTool('fog', 'rectangle');
    rectangle.tool.pointerDown(at(33, 33));
    rectangle.tool.pointerUp();
    expect(rectangle.state.addFogOperation).not.toHaveBeenCalled();
  });

  it('paints with the primary button only and never pauses the map, so a right-drag pans and the wheel zooms', () => {
    const { tool, state, viewport } = fogTool('fog', 'rectangle');
    tool.start();
    tool.pointerDown({ ...at(140, 140), button: 2 });
    expect(tool.drag.stroke.active).toBe(false);

    tool.pointerDown(at(140, 140));
    expect(tool.drag.stroke.active).toBe(true);
    expect(viewport.pause).toBe(false);
    tool.pointerMove(at(215, 215));
    tool.pointerUp();
    expect(tool.drag.stroke.active).toBe(false);
    // The rectangle's corners snap to the 70 px grid's.
    expect(state.addFogArea).toHaveBeenCalledExactlyOnceWith({ type: 'rectangle', x: 140, y: 140, width: 70, height: 70 });
  });

  it('takes no press while another tool is chosen', () => {
    const { tool, state, picture } = fogTool('fog', 'brush');
    state.activeTool = 'select';
    tool.pointerDown(at(100, 100));
    tool.pointerMove(at(130, 100));
    tool.pointerUp();
    expect(tool.drag.stroke.active).toBe(false);
    expect(picture.showStroke).not.toHaveBeenCalled();
    expect(state.addFogOperation).not.toHaveBeenCalled();
  });

  it('hides the brush\'s ring when the pointer leaves the map, and shows it again at the next move', () => {
    const { tool } = fogTool('eraser', 'brush');
    tool.pointerMove(at(100, 100));
    expect(tool.ring.shown).toBe(true);
    tool.pointerLeave();
    expect(tool.ring.shown).toBe(false);
    tool.pointerMove(at(120, 100));
    expect(tool.ring).toMatchObject({ shown: true, erasing: true });

    // A lasso has no ring to bring back.
    const lasso = fogTool('fog', 'lasso');
    lasso.tool.pointerLeave();
    lasso.tool.pointerMove(at(120, 100));
    expect(lasso.tool.ring.shown).toBe(false);
  });

  it('shows the brush\'s ring under the pointer when the tool or the brush is taken up, and none while the pointer is off the map', () => {
    const { tool, state } = fogTool('fog', 'brush');
    // The pointer is on the toolbar, which chose the tool: a ring would stand where the pointer last was on the map.
    tool.pointerLeave();
    tool.start();
    expect(tool.ring.shown).toBe(false);
    tool.follow({ ...state.fogTool, shape: 'lasso' });
    tool.follow({ ...state.fogTool, shape: 'brush' });
    expect(tool.ring.shown).toBe(false);

    // Resting on the map while a key takes the tool up, or the brush: the ring is there at once.
    tool.pointerMove(at(120, 90));
    tool.follow({ ...state.fogTool, shape: 'lasso' });
    expect(tool.ring.shown).toBe(false);
    tool.ring.updatePosition.mockClear();
    tool.follow({ ...state.fogTool, shape: 'brush' });
    expect(tool.ring.shown).toBe(true);
    expect(tool.ring.updatePosition).toHaveBeenCalledExactlyOnceWith(120, 90);
    state.activeTool = 'eraser';
    tool.start();
    expect(tool.ring).toMatchObject({ shown: true, erasing: true });
  });
});

interface SceneState {
  mapPath: string;
  activeTool: string;
  fogTool: FogToolChoices;
  isMapLoading: boolean;
  isGMView: boolean;
  isPlayerView: boolean;
  viewedLevel: string | null;
  objects: { fog: Record<string, unknown> };
}

interface FogRendererHarness {
  state: SceneState;
  gesture: { active: boolean; stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; drop: ReturnType<typeof vi.fn>; refresh: ReturnType<typeof vi.fn> };
  /** What the renderer reads of its picture. */
  picture: { showsStroke: boolean };
  /** How often the fog was drawn as the scene holds it. */
  drawn: ReturnType<typeof vi.fn>;
  /** A store write reaches the renderer. */
  notify(): void;
}

/** The fog renderer following its store, without its canvas: what it draws is what its picture is asked for. */
function fogRenderer(): FogRendererHarness {
  const state: SceneState = { mapPath: 'maps/a.atlasmap', activeTool: 'select', fogTool: DEFAULT_FOG_TOOL, isMapLoading: false, isGMView: true, isPlayerView: false, viewedLevel: null, objects: { fog: {} } };
  const listeners: ((state: SceneState) => void)[] = [];
  const gesture = { active: false, cancel: vi.fn(), drop: vi.fn(), refresh: vi.fn(), follow: vi.fn(), start: vi.fn(), stop: vi.fn() };
  const drawn = vi.fn(() => true);
  const picture = { fit: vi.fn(), drawCommitted: drawn, clear: vi.fn(), endFade: vi.fn(), followView: vi.fn(), hasFog: false, showsStroke: false, sprite: { visible: false } };
  const renderer = Object.assign(Object.create(FogOfWarRenderer.prototype) as FogOfWarRenderer, {
    // The store hands its listeners a new state object after every write
    store: { getState: () => ({ ...state }), subscribe: (listener: (state: SceneState) => void) => (listeners.push(listener), () => undefined) },
    gesture,
    picture,
    container: { visible: true },
  }) as unknown as { followStore(): void };
  renderer.followStore();
  return { state, gesture, picture, drawn, notify: () => listeners.forEach((listener) => listener({ ...state })) };
}

describe('the fog renderer', () => {
  it('does not draw the scene\'s fog over a stroke under way, and does once the stroke is over', () => {
    const { state, gesture, picture, drawn, notify } = fogRenderer();
    gesture.active = true;
    picture.showsStroke = true;
    // Fog changes under the stroke, as an undo would change it.
    state.objects = { fog: { a: {} } };
    notify();
    expect(drawn).not.toHaveBeenCalled();
    // The stroke shows itself again, on the fog as it now is.
    expect(gesture.refresh).toHaveBeenCalledTimes(1);

    gesture.active = false;
    state.objects = { fog: { a: {}, b: {} } };
    notify();
    expect(drawn).toHaveBeenCalledTimes(1);
    expect(gesture.refresh).toHaveBeenCalledTimes(1);
  });

  it('draws the scene\'s fog under a stroke its picture does not show: a shape that will reveal, an area\'s outline', () => {
    const { state, gesture, drawn, notify } = fogRenderer();
    gesture.active = true;
    state.objects = { fog: { a: {} } };
    notify();
    // An edit, which fades in; what is under way is shown again for the fog as it now is.
    expect(drawn).toHaveBeenCalledExactlyOnceWith(true);
    expect(gesture.refresh).toHaveBeenCalledTimes(1);
  });

  it('drops what is under way when the view shows another level, a load begins or the players\' view is shown', () => {
    const { state, gesture, notify } = fogRenderer();
    state.activeTool = 'fog';
    notify();
    expect(gesture.drop).not.toHaveBeenCalled();
    state.viewedLevel = 'upper';
    notify();
    expect(gesture.drop).toHaveBeenCalledTimes(1);
    state.isGMView = false;
    notify();
    expect(gesture.drop).toHaveBeenCalledTimes(2);
    // Back in the GM's view nothing is dropped: there is nothing the players' view left.
    state.isGMView = true;
    notify();
    expect(gesture.drop).toHaveBeenCalledTimes(2);
    state.isPlayerView = true;
    notify();
    expect(gesture.drop).toHaveBeenCalledTimes(3);
    state.isMapLoading = true;
    notify();
    expect(gesture.drop).toHaveBeenCalledTimes(4);
    state.isMapLoading = false;
    notify();
    expect(gesture.drop).toHaveBeenCalledTimes(4);
  });

  it('asks its picture for a fade only for an edit of the fog shown: not for another level, another map or a load', () => {
    const { state, drawn, notify } = fogRenderer();
    state.objects = { fog: { a: {} } };
    notify();
    expect(drawn).toHaveBeenLastCalledWith(true);
    state.viewedLevel = 'upper';
    state.objects = { fog: { b: {} } };
    notify();
    expect(drawn).toHaveBeenLastCalledWith(false);
    state.mapPath = 'maps/b.atlasmap';
    state.objects = { fog: { c: {} } };
    notify();
    expect(drawn).toHaveBeenLastCalledWith(false);
    // The fog that comes with the end of a load
    state.isMapLoading = true;
    notify();
    drawn.mockClear();
    state.isMapLoading = false;
    state.objects = { fog: { d: {} } };
    notify();
    expect(drawn.mock.calls.every(([edit]) => edit === false)).toBe(true);
    expect(drawn).toHaveBeenCalled();
    // And an edit after it
    state.objects = { fog: { d: {}, e: {} } };
    notify();
    expect(drawn).toHaveBeenLastCalledWith(true);
  });

  it('draws nothing for a store write that changes no fog', () => {
    const { state, drawn, notify } = fogRenderer();
    state.fogTool = { ...state.fogTool, brushSize: 80 };
    notify();
    expect(drawn).not.toHaveBeenCalled();
  });

  it('starts the gesture with the fog tool and stops it with another', () => {
    const { state, gesture, notify } = fogRenderer();
    state.activeTool = 'fog';
    notify();
    expect(gesture.start).toHaveBeenCalledTimes(1);
    // Hiding to revealing: the tool is still the fog's
    state.activeTool = 'eraser';
    notify();
    expect(gesture.start).toHaveBeenCalledTimes(2);
    expect(gesture.stop).not.toHaveBeenCalled();
    state.activeTool = 'select';
    notify();
    expect(gesture.stop).toHaveBeenCalledTimes(1);
  });
});
