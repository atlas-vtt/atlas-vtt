// @vitest-environment jsdom
import type { Container } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { auraBadgePoint } from '../../../src/app/measure/auraArea';
import type { KeptMeasure } from '../../../src/app/measure/measureTypes';
import { mayEditMeasure } from '../../../src/app/pixi/measure/measurePopoverGuard';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { TokenEntity } from '../../../src/app/types';
import { GRID, measureFrom, measureScene, type MeasureScene } from '../../helpers/measureScene';
import { genericLight } from '../../mocks/lights';

let current: MeasureScene | undefined;
const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  current?.destroy();
  current = undefined;
});

interface Kept {
  s: MeasureScene;
  /** A kept ruler from (105, 105) to (315, 105): its handle is at its start. */
  id: string;
  ruler: () => KeptMeasure | undefined;
  /** A left press as the viewport's dispatch hands it on; true when a handle took it. */
  press: (x: number, y: number) => boolean;
  move: (x: number, y: number, alt?: boolean) => void;
  up: () => void;
  steps: () => number;
  undo: () => void;
  canvas: HTMLElement;
}

function scene(): Kept {
  const s = measureScene();
  current = s;
  const { store } = s;
  store.getState().setMeasureTool({ keep: true });
  store.getState().setActiveTool('measure');
  measureFrom(s, 100, 100, 300, 100);
  store.getState().setActiveTool('select');
  const id = Object.keys(store.getState().objects.measures ?? {})[0]!;
  const history = getHistoryStore(store)!;
  history.getState().clear();
  return {
    s, id,
    ruler: () => store.getState().objects.measures?.[id],
    press: (x, y) => s.measure.handles.pointer.pointerDown(x, y, { global: { x, y } } as never),
    move: (x, y, alt = false) => s.pointer('pointermove', x, y, { alt }),
    up: () => s.pointer('pointerup', 0, 0),
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
    canvas: s.viewport.options.events.domElement,
  };
}

const START = [{ x: 105, y: 105 }, { x: 315, y: 105 }];
/** The badges at the measurements' origins, and the dots at the areas' far ends. */
const badges = (s: MeasureScene): Container[] => s.measure.handles.layer.getChildByLabel('measure-origin-handles')?.children ?? [];
const ends = (s: MeasureScene): Container[] => s.measure.handles.layer.getChildByLabel('measure-end-handles')?.children ?? [];
/** Lets a cancelled drag's undo step close, which waits for the store write that cancelled it. */
const settled = (): Promise<void> => Promise.resolve();

describe('a press on a kept measurement', () => {
  it('opens its popover on a click on its handle with any tool, without an undo step', () => {
    const { s, id, press, up, steps } = scene();
    for (const tool of ['select', 'move', 'measure', 'fog'] as const) {
      s.store.getState().closeMeasurePopover();
      s.store.getState().setActiveTool(tool);
      expect(press(108, 102)).toBe(true);
      up();
      expect(s.store.getState().measurePopover).toBe(id);
    }
    expect(steps()).toBe(0);
  });

  it('still counts as a click when the pointer wobbles less than the threshold', () => {
    const { s, id, ruler, press, move, up } = scene();
    press(105, 105);
    move(108, 108);
    up();
    expect(s.store.getState().measurePopover).toBe(id);
    expect(ruler()?.points).toEqual(START);
  });

  it('takes no press on its line, its end or its label: only the handle is its own', () => {
    const { s, press } = scene();
    for (const [x, y] of [[210, 105], [315, 105], [210, 90], [150, 105]]) expect(press(x!, y!)).toBe(false);
    expect(s.store.getState().measurePopover).toBeNull();
    expect(s.measure.handles.pointer.cursorAt(210, 105)).toBeNull();
    expect(s.measure.handles.pointer.cursorAt(105, 105)).toBe('pointer');
  });

  it('leaves the press to a measurement being made, which may end where another began, and to the lighting tool', () => {
    const { s, press } = scene();
    s.store.getState().setActiveTool('measure');
    s.click(400, 400);
    expect(press(105, 105)).toBe(false);
    expect(s.measure.handles.pointer.cursorAt(105, 105)).toBeNull();
    s.key('Escape');
    expect(press(105, 105)).toBe(true);
    s.measure.handles.cancel();
    s.store.getState().setActiveTool('wall');
    expect(press(105, 105)).toBe(false);
  });

  it('closes the popover on a press beside it and measures nothing with that press; the next press measures', () => {
    const { s, id, press, up, canvas } = scene();
    const kept = (): number => Object.keys(s.store.getState().objects.measures ?? {}).length;
    document.body.appendChild(canvas);
    cleanups.push(() => canvas.remove());
    s.store.getState().setActiveTool('measure');
    press(105, 105);
    up();
    expect(s.store.getState().measurePopover).toBe(id);
    // The press as the browser sends it: the document hears it first, then the map's own dispatch gets the same event.
    const native = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 400, clientY: 400 }) as PointerEvent;
    canvas.dispatchEvent(native);
    expect(s.store.getState().measurePopover).toBeNull();
    s.pointer('pointerdown', 400, 400, { native });
    s.pointer('pointermove', 540, 400);
    s.pointer('pointerup', 540, 400);
    expect(kept()).toBe(1);
    expect(s.measure.measurements.get().live).toBeNull();
    measureFrom(s, 400, 400, 540, 400);
    expect(kept()).toBe(2);
  });
});

describe('a kept measurement dragged by its handle', () => {
  it('moves whole, its start on a cell\'s centre, as one undo step that opens only once the drag starts', () => {
    const { s, ruler, press, move, up, steps, undo } = scene();
    // Grabbed off-centre: the measurement keeps its distance to the pointer.
    press(108, 103);
    move(110, 105);
    expect(steps()).toBe(0);
    move(258, 183);
    expect(ruler()?.points).toEqual([{ x: 245, y: 175 }, { x: 455, y: 175 }]);
    expect(s.measure.handles.pointer.cursorAt(258, 183)).toBe('grabbing');
    move(400, 330);
    up();
    expect(ruler()?.points).toEqual([{ x: 385, y: 315 }, { x: 595, y: 315 }]);
    expect(s.store.getState().measurePopover).toBeNull();
    expect(steps()).toBe(1);
    undo();
    expect(ruler()?.points).toEqual(START);
  });

  it('writes nothing while the pointer stays in the cell the start lies in', () => {
    const { s, press, move, up, steps } = scene();
    const record = s.store.getState().objects.measures;
    press(105, 105);
    move(125, 118);
    move(130, 90);
    expect(s.store.getState().objects.measures).toBe(record);
    up();
    expect(steps()).toBe(0);
  });

  it('is placed freely with Alt, and where the grid\'s Snap is off', () => {
    const { s, ruler, press, move, up } = scene();
    press(105, 105);
    move(255, 185, true);
    expect(ruler()?.points).toEqual([{ x: 255, y: 185 }, { x: 465, y: 185 }]);
    up();
    s.store.getState().setSnapToGrid(false);
    press(255, 185);
    move(301, 222);
    expect(ruler()?.points).toEqual([{ x: 301, y: 222 }, { x: 511, y: 222 }]);
    up();
  });

  it.each([
    ['Escape', ({ s }: Kept): void => { expect(s.measure.handles.handleEscape()).toBe(true); }],
    ['a cancelled pointer', ({ canvas }: Kept): void => { canvas.dispatchEvent(new Event('pointercancel')); }],
    ['the window losing focus', (): void => { window.dispatchEvent(new Event('blur')); }],
  ])('is put back by %s, which leaves no undo step', (_case, cancel) => {
    const kept = scene();
    const { s, id, ruler, press, move, up, steps } = kept;
    press(105, 105);
    move(258, 183);
    expect(ruler()?.points).not.toEqual(START);
    cancel(kept);
    expect(ruler()?.points).toEqual(START);
    expect(steps()).toBe(0);
    // The pointer's release then commits nothing and opens nothing.
    move(400, 330);
    up();
    expect(ruler()?.points).toEqual(START);
    expect(s.store.getState().measurePopover).toBeNull();
    // The drag's undo step is closed: the next change is a step of its own.
    s.store.getState().updateMeasure(id, { color: '#e93147' });
    expect(steps()).toBe(1);
  });

  it('is let go when its measurement is taken away under it, and leaves no step', async () => {
    const { s, press, move, up, steps } = scene();
    const other = s.store.getState().addMeasure({ shape: 'circle', points: [{ x: 525, y: 525 }, { x: 665, y: 525 }] })!;
    getHistoryStore(s.store)!.getState().clear();
    press(105, 105);
    move(258, 183);
    s.store.getState().clearMeasures();
    await settled();
    expect(s.measure.handles.dragging).toBe(false);
    up();
    expect(s.store.getState().objects.measures?.[other]).toBeUndefined();
    s.store.getState().addMeasure({ shape: 'ruler', points: START });
    expect(steps()).toBeGreaterThan(0);
  });
});

describe('Delete', () => {
  it('removes the measurement whose handle the pointer is over, in one undo step', () => {
    const { s, ruler, steps, undo } = scene();
    expect(s.measure.handles.handleDelete()).toBe(false);
    s.measure.handles.pointer.cursorAt(107, 104);
    expect(s.measure.handles.handleDelete()).toBe(true);
    expect(ruler()).toBeUndefined();
    expect(steps()).toBe(1);
    undo();
    expect(ruler()?.points).toEqual(START);
    // The pointer has to find the handle again.
    expect(s.measure.handles.handleDelete()).toBe(false);
  });

  it('is not the handle\'s once the pointer has left it or the canvas', () => {
    const { s, ruler } = scene();
    s.measure.handles.pointer.cursorAt(105, 105);
    s.measure.handles.pointer.cursorAt(200, 200);
    expect(s.measure.handles.handleDelete()).toBe(false);
    s.measure.handles.pointer.cursorAt(105, 105);
    s.measure.handles.pointer.leave();
    expect(s.measure.handles.handleDelete()).toBe(false);
    expect(ruler()).toBeDefined();
  });

  it('removes the measurement whose popover is open while the pointer is over no handle', () => {
    const { s, id, ruler } = scene();
    const other = s.store.getState().addMeasure({ shape: 'circle', points: [{ x: 525, y: 525 }, { x: 665, y: 525 }] })!;
    s.store.getState().openMeasurePopover(id);
    s.measure.handles.pointer.cursorAt(525, 525);
    expect(s.measure.handles.handleDelete()).toBe(true);
    expect(s.store.getState().objects.measures?.[other]).toBeUndefined();
    expect(s.store.getState().measurePopover).toBe(id);
    s.measure.handles.pointer.leave();
    expect(s.measure.handles.handleDelete()).toBe(true);
    expect(ruler()).toBeUndefined();
    expect(s.store.getState().measurePopover).toBeNull();
  });
});

describe('the popover of a kept measurement', () => {
  it('closes on Escape, which is then the popover\'s', () => {
    const { s, id } = scene();
    expect(s.measure.handles.handleEscape()).toBe(false);
    s.store.getState().openMeasurePopover(id);
    expect(s.measure.handles.handleEscape()).toBe(true);
    expect(s.store.getState().measurePopover).toBeNull();
  });

  it('closes when its measurement goes by any path, or the view is no longer the GM\'s of a loaded scene', () => {
    const { s, id } = scene();
    const { store } = s;
    const open = (): void => {
      store.getState().setGMView(true);
      store.getState().setMapLoading(false);
      store.getState().openMeasurePopover(id);
      expect(store.getState().measurePopover).toBe(id);
    };
    const history = getHistoryStore(store)!;
    open();
    store.getState().updateMeasure(id, { color: '#e93147' });
    expect(store.getState().measurePopover).toBe(id);
    open();
    store.getState().setGMView(false);
    expect(store.getState().measurePopover).toBeNull();
    open();
    store.getState().setMapLoading(true);
    expect(store.getState().measurePopover).toBeNull();
    open();
    store.getState().deleteMeasure(id);
    expect(store.getState().measurePopover).toBeNull();
    // Undo brings the measurement back, and redo takes it away again under the open popover.
    history.getState().undo();
    open();
    history.getState().redo();
    expect(store.getState().objects.measures?.[id]).toBeUndefined();
    expect(store.getState().measurePopover).toBeNull();
  });

  it('may not be open for a measurement on a level the view does not show', () => {
    const { s, id } = scene();
    const levels = [
      { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
      { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
    ];
    const state = { ...s.store.getState(), levels };
    expect(mayEditMeasure({ ...state, viewedLevel: 'ground' }, id)).toBe(true);
    expect(mayEditMeasure({ ...state, viewedLevel: 'upper' }, id)).toBe(false);
    expect(mayEditMeasure({ ...state, viewedLevel: 'ground' }, 'gone')).toBe(false);
  });

  it('is the only one of the light, zone and measurement popovers that is open', () => {
    const { s, id } = scene();
    const { store } = s;
    const light = store.getState().addLight({ x: 500, y: 300, emission: { ...genericLight('torch'), kind: 'torch' } });
    const zone = store.getState().addLightZone({ polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], ambient: 0 });
    store.getState().openMeasurePopover(id);
    store.getState().openLightPopover(light);
    expect(store.getState().measurePopover).toBeNull();
    store.getState().openMeasurePopover(id);
    expect(store.getState().lightPopover).toBeNull();
    store.getState().openLightZonePopover(zone);
    expect(store.getState().measurePopover).toBeNull();
    store.getState().openMeasurePopover(id);
    expect(store.getState().lightZonePopover).toBeNull();
  });

  it('closes on a press anywhere but in the popover and on a handle on the map', () => {
    const { s, id, canvas } = scene();
    const popover = document.body.appendChild(createDiv({ cls: 'atlas-measure-popover' }));
    const inside = popover.appendChild(createEl('button'));
    document.body.appendChild(canvas);
    cleanups.push(() => { popover.remove(); canvas.remove(); });
    const pressOn = (target: Element, clientX = 0, clientY = 0): void => {
      target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX, clientY }));
    };
    const isOpen = (): boolean => s.store.getState().measurePopover === id;
    s.store.getState().openMeasurePopover(id);
    pressOn(inside);
    expect(isOpen()).toBe(true);
    pressOn(canvas, 106, 104);
    expect(isOpen()).toBe(true);
    pressOn(canvas, 210, 105);
    expect(isOpen()).toBe(false);
    s.store.getState().openMeasurePopover(id);
    pressOn(document.body);
    expect(isOpen()).toBe(false);
    // Closed, it listens to no press.
    pressOn(document.body);
  });
});

describe('the handles and the players', () => {
  it('show on the GM\'s canvas alone: a players\' frame and a picture of the scene leave their layer out', () => {
    const { s } = scene();
    const { layer } = s.measure.handles;
    expect(layer.visible).toBe(true);
    expect(badges(s)).toHaveLength(1);
    expect(s.measure.getPlayerViewLayers(() => true)).toContainEqual({ layer, visible: false });
    expect(s.measure.getGmViewLayers()).toContainEqual({ layer, visible: false });
  });

  it('go while the canvas shows the players\' view, with the popover and a drag under way, and come back with the GM\'s', async () => {
    const { s, id, ruler, press, move, up, steps } = scene();
    const canvasShows = { players: false };
    s.measure.playersView = { footprints: () => [], seenAtStart: () => () => true, seenOnCanvas: () => (canvasShows.players ? () => true : null) };
    s.store.getState().openMeasurePopover(id);
    press(105, 105);
    move(258, 183);
    canvasShows.players = true;
    s.measure.refreshVisibility();
    await settled();
    expect(s.measure.handles.layer.visible).toBe(false);
    expect(s.store.getState().measurePopover).toBeNull();
    expect(ruler()?.points).toEqual(START);
    expect(steps()).toBe(0);
    up();
    expect(press(105, 105)).toBe(false);
    s.measure.handles.pointer.cursorAt(105, 105);
    expect(s.measure.handles.handleDelete()).toBe(false);
    canvasShows.players = false;
    s.measure.refreshVisibility();
    expect(s.measure.handles.layer.visible).toBe(true);
    expect(press(105, 105)).toBe(true);
  });

  it('have one handle for each kept measurement, at its first point, which follows it', () => {
    const { s, id, press, move, up } = scene();
    const layer = { get children(): Container[] { return badges(s); } };
    const other = s.store.getState().addMeasure({ shape: 'cone', points: [{ x: 525, y: 525 }, { x: 665, y: 525 }] })!;
    expect(layer.children.map(({ position }) => [position.x, position.y])).toEqual([[105, 105], [525, 525]]);
    // The cone, an area, has a second handle at its far end; the ruler has none.
    expect(ends(s).map(({ position }) => [position.x, position.y])).toEqual([[665, 525]]);
    press(105, 105);
    move(258, 183);
    up();
    expect(layer.children.map(({ position }) => [position.x, position.y])).toEqual([[245, 175], [525, 525]]);
    // Handles keep their size on screen: twice the world pixels at half the zoom, where a press reaches twice as far.
    expect(layer.children.map(({ scale }) => scale.x)).toEqual([1, 1]);
    s.viewport.scale.set(0.5);
    s.viewport.emit('zoomed', { viewport: s.viewport, type: 'wheel' });
    expect(layer.children.map(({ scale }) => scale.x)).toEqual([2, 2]);
    expect(s.measure.handles.pointer.cursorAt(245 + 20, 175)).toBe('pointer');
    s.viewport.scale.set(1);
    s.viewport.emit('zoomed', { viewport: s.viewport, type: 'wheel' });
    expect(s.measure.handles.pointer.cursorAt(245 + 20, 175)).toBeNull();
    s.store.getState().deleteMeasure(id);
    expect(layer.children.map(({ position }) => [position.x, position.y])).toEqual([[525, 525]]);
    s.store.getState().deleteMeasure(other);
    expect(layer.children).toHaveLength(0);
    expect(ends(s)).toHaveLength(0);
  });
});

describe('the handle of a measurement that starts on a token', () => {
  const tokenAt = (id: string, x: number, y: number, more: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'character', name: id, imagePath: '', x, y, ...more });
  const places = (s: MeasureScene): number[][] => badges(s).map(({ position }) => [position.x, position.y]);
  const near = ([x, y]: number[], at: { x: number; y: number }): void => {
    expect(x).toBeCloseTo(at.x, 9);
    expect(y).toBeCloseTo(at.y, 9);
  };
  /** The scene's ruler, which starts at (105, 105), with a token standing there. */
  function onToken(more: Partial<TokenEntity> = {}): Kept & { rim: (place?: number) => { x: number; y: number } } {
    const made = scene();
    const hero = tokenAt('hero', 105, 105, more);
    made.s.store.setState({ objects: { ...made.s.store.getState().objects, tokens: { hero } } });
    getHistoryStore(made.s.store)!.getState().clear();
    return { ...made, rim: (place = 0) => auraBadgePoint(made.s.store.getState().objects.tokens.hero!, { size: GRID }, place) };
  }

  it('stands on the token\'s rim, and leaves the token\'s middle to the token', () => {
    const { s, press, rim, up } = onToken();
    near(places(s)[0]!, rim());
    expect(Math.hypot(rim().x - 105, rim().y - 105)).toBeCloseTo(GRID / 2, 9);
    // A press on the token's middle is the token's: no handle takes it, and no popover opens.
    expect(press(105, 105)).toBe(false);
    expect(s.measure.handles.pointer.cursorAt(105, 105)).toBeNull();
    expect(s.store.getState().measurePopover).toBeNull();
    // On the rim it is the measurement's.
    expect(s.measure.handles.pointer.cursorAt(rim().x, rim().y)).toBe('pointer');
    expect(press(rim().x, rim().y)).toBe(true);
    up();
    expect(s.store.getState().measurePopover).not.toBeNull();
  });

  it('goes with the token as it moves and grows, and back to the origin once the token has left it', () => {
    const { s, rim } = onToken();
    // Moved within its cell, the token still holds the origin: the badge goes along on its rim.
    s.store.getState().updateTokens([{ id: 'hero', changes: { x: 115, y: 100 } }]);
    near(places(s)[0]!, rim());
    s.store.getState().updateTokens([{ id: 'hero', changes: { x: 105, y: 105, size: 2 } }]);
    near(places(s)[0]!, rim());
    expect(Math.hypot(rim().x - 105, rim().y - 105)).toBeCloseTo(GRID * 1.5, 9);
    s.store.getState().updateTokens([{ id: 'hero', changes: { x: 525, y: 525, size: 1 } }]);
    expect(places(s)).toEqual([[105, 105]]);
    s.store.getState().deleteToken('hero');
    expect(places(s)).toEqual([[105, 105]]);
  });

  it('moves the whole measurement when it is dragged from the rim, and stands on the origin once that lies on no token', () => {
    const { s, ruler, press, move, up, rim, steps } = onToken();
    const from = rim();
    press(from.x, from.y);
    move(from.x + 140, from.y + 70);
    up();
    expect(ruler()?.points).toEqual([{ x: 245, y: 175 }, { x: 455, y: 175 }]);
    expect(steps()).toBe(1);
    expect(places(s)).toEqual([[245, 175]]);
  });

  it('stands beside the others of the same token: several measurements and an aura fan out along the rim', () => {
    const { s, id, rim, press } = onToken();
    const second = s.store.getState().addMeasure({ shape: 'ruler', points: [{ x: 105, y: 105 }, { x: 105, y: 315 }] })!;
    s.store.getState().setTokenAuras([{ tokenId: 'hero', aura: 10, points: [{ x: 105, y: 105 }, { x: 280, y: 105 }] }]);
    const spots = places(s);
    expect(spots).toHaveLength(3);
    [0, 1, 2].forEach((place) => near(spots[place]!, rim(place)));
    // Each is pressed on its own spot.
    const aura = Object.keys(s.store.getState().objects.measures ?? {}).find((key) => key !== id && key !== second)!;
    for (const [place, measureId] of [id, second, aura].entries()) {
      expect(press(rim(place).x, rim(place).y)).toBe(true);
      s.pointer('pointerup', 0, 0);
      expect(s.store.getState().measurePopover).toBe(measureId);
    }
    expect(press(105, 105)).toBe(false);
  });
});

describe('the handle at an area\'s far end', () => {
  const CIRCLE = [{ x: 525, y: 385 }, { x: 665, y: 385 }];

  /** The scene's ruler and a kept circle of two cells around (525, 385), its far end at (665, 385). */
  function withCircle(): Kept & { circle: () => KeptMeasure | undefined; circleId: string } {
    const kept = scene();
    const circleId = kept.s.store.getState().addMeasure({ shape: 'circle', points: CIRCLE.map((point) => ({ ...point })) })!;
    getHistoryStore(kept.s.store)!.getState().clear();
    return { ...kept, circleId, circle: () => kept.s.store.getState().objects.measures?.[circleId] };
  }

  it('resizes and turns the area in whole cells, its origin staying, as one undo step', () => {
    const { circle, press, move, up, steps, undo } = withCircle();
    expect(press(667, 383)).toBe(true);
    // Grabbed two pixels off its middle, it keeps that distance: its end comes to (525, 600), 215 px below the origin, three cells.
    move(600, 500);
    move(527, 598);
    expect(circle()?.points).toEqual([{ x: 525, y: 385 }, { x: 525, y: 595 }]);
    up();
    expect(steps()).toBe(1);
    undo();
    expect(circle()?.points).toEqual(CIRCLE);
  });

  it('is never smaller than one cell, and takes any size with Alt', () => {
    const { circle, press, move, up } = withCircle();
    press(665, 385);
    move(540, 385);
    expect(circle()?.points[1]).toEqual({ x: 595, y: 385 });
    move(540, 389, true);
    expect(circle()?.points[1]).toEqual({ x: 540, y: 389 });
    up();
  });

  it('is put back by Escape and by a press elsewhere, and leaves no undo step', async () => {
    const { s, circle, press, move, up, steps } = withCircle();
    press(665, 385);
    move(525, 600);
    expect(circle()?.points[1]).toEqual({ x: 525, y: 595 });
    expect(s.measure.handles.handleEscape()).toBe(true);
    await settled();
    expect(circle()?.points).toEqual(CIRCLE);
    up();
    expect(steps()).toBe(0);
  });

  it('opens the popover on a click, and Delete over it deletes the measurement', () => {
    const { s, circleId, circle, press, up } = withCircle();
    press(665, 385);
    up();
    expect(s.store.getState().measurePopover).toBe(circleId);
    s.store.getState().closeMeasurePopover();
    expect(s.measure.handles.pointer.cursorAt(663, 387)).toBe('pointer');
    expect(s.measure.handles.handleDelete()).toBe(true);
    expect(circle()).toBeUndefined();
  });

  it('closes the popover and puts a drag back when another tab comes to the front', async () => {
    const { s, circleId, circle, press, move, steps } = withCircle();
    s.store.getState().openMeasurePopover(circleId);
    press(665, 385);
    move(525, 600);
    s.measure.handles.leave();
    await settled();
    expect(s.store.getState().measurePopover).toBeNull();
    expect(circle()?.points).toEqual(CIRCLE);
    expect(steps()).toBe(0);
  });
});
