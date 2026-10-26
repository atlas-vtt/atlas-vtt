// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { Container, Sprite } from 'pixi.js';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { snapTokenCenter } from '../../src/app/grid/gridPlacement';
import { GroupRotation, type GroupTurnHost } from '../../src/app/pixi/selection/GroupRotation';
import { gridPivot } from '../../src/app/pixi/selection/groupTurn';
import type { DrawingStroke, TokenEntity } from '../../src/app/types';
import { SelectionManager } from '../../src/app/pixi/SelectionManager';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// jsdom draws no glyphs: the button's rotate glyph never arrives
vi.mock('../../src/app/pixi/rotateHandleLook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/pixi/rotateHandleLook')>()),
  rotateIconTexture: () => new Promise(() => undefined),
}));

// jsdom cannot measure text: the angle is shown on a label that records what it was given
vi.mock('../../src/app/pixi/utils/measureLabel', async () => {
  const { Container: View } = await import('pixi.js');
  return {
    MeasureLabel: class {
      readonly view = new View();
      text = '';
      show(text: string): void { this.text = text; }
      destroy(): void { this.view.destroy(); }
    },
  };
});

const CELL = 70;
const squareCell = (point: { x: number; y: number }): { x: number; y: number } =>
  ({ x: (Math.floor(point.x / CELL) + 0.5) * CELL, y: (Math.floor(point.y / CELL) + 0.5) * CELL });

function token(id: string, x: number, y: number, size = 1): TokenEntity {
  return { id, kind: 'token', imagePath: `${id}.png`, x, y, size };
}

/** Two tokens side by side and a stroke, all selected, in a frame whose centre is (105, 35). */
function setup(activeTool: 'select' | 'draw-pen' = 'select') {
  const store = createViewAtlasStore(createInMemoryApp().app, `group-rotation-${Math.random()}`);
  const pen: DrawingStroke = { id: 'pen', kind: 'drawing', timestamp: 0, type: 'pen', color: '#000', width: 2, opacity: 1, points: [{ x: 105, y: 0 }] };
  store.setState({
    persistenceEnabled: false,
    activeTool,
    selectedIds: ['a', 'b', 'pen'],
    objects: { ...store.getState().objects, tokens: { a: token('a', 35, 35), b: token('b', 175, 35), other: { ...token('other', 500, 500), layer: 4 } }, drawings: { pen } },
  });
  const history = getHistoryStore(store)!;
  history.getState().clear();

  const canvas = document.createElement('canvas');
  const plugins = { pause: vi.fn(), resume: vi.fn() };
  const viewport = Object.assign(new Container(), { toWorld: (point: { x: number; y: number }) => ({ x: point.x, y: point.y }), plugins, options: { events: { domElement: canvas } } });
  const facings: Array<ReadonlyMap<string, number> | null> = [];
  const host: GroupTurnHost = {
    pivot: (middle) => gridPivot(middle, false, (point, size) => snapTokenCenter(point, size, 'square', CELL, squareCell)),
    showFacings: (shown) => facings.push(shown),
  };
  const frame = { x: 0, y: 0, width: 210, height: 70 };
  const turnFrame = vi.fn();
  const rotation = new GroupRotation({
    viewport: viewport as never, store, host: () => host, frame: () => frame, turnFrame, refresh: () => undefined,
    accent: () => 0x8a5cf5, reducedMotion: () => true,
  });
  rotation.follow(frame, ['a', 'b'], false);
  const handle = rotation.layer.getChildByLabel('groupRotateHandle', true)!;
  const at = (x: number, y: number, shiftKey = false) => ({ button: 0, global: { x, y }, shiftKey, stopPropagation: vi.fn() });
  return {
    store, history, rotation, viewport, canvas, facings, turnFrame, plugins,
    press: (x: number, y: number) => handle.emit('pointerdown', at(x, y) as never),
    move: (x: number, y: number, shiftKey = false) => viewport.emit('pointermove', at(x, y, shiftKey) as never),
    release: () => viewport.emit('pointerup', at(0, 0) as never),
    tokens: () => store.getState().objects.tokens,
  };
}

describe('GroupRotation', () => {
  it('turns the group a quarter turn about its pivot onto cells and puts it down as one undo step', () => {
    const { store, history, press, move, release, tokens, plugins } = setup();
    press(105, -30);
    move(170, 35);
    // While turning the tokens are held and the store follows the turn unsnapped
    expect(Object.keys(store.getState().heldTokens).sort()).toEqual(['a', 'b']);
    expect(tokens().a).toMatchObject({ x: 105, y: -35 });
    expect(history.getState().pastStates).toHaveLength(0);
    release();

    expect(history.getState().pastStates).toHaveLength(1);
    expect(tokens().a).toMatchObject({ x: 105, y: -35, rotation: 90 });
    expect(tokens().b).toMatchObject({ x: 105, y: 105, rotation: 90 });
    expect(store.getState().objects.drawings.pen!.points).toEqual([{ x: 140, y: 35 }]);
    // Put down like a drop: let go of, and on top of every other token
    expect(store.getState().heldTokens).toEqual({});
    expect(tokens().a!.layer).toBeGreaterThan(4);
    expect(plugins.resume).toHaveBeenCalledWith('drag');

    history.getState().undo();
    expect(tokens().a).toMatchObject({ x: 35, y: 35 });
    expect(tokens().a!.rotation).toBeUndefined();
    expect(store.getState().objects.drawings.pen!.points).toEqual([{ x: 105, y: 0 }]);
  });

  it('puts the tokens down exactly where the last step of the turn showed them, off the grid at 45°', () => {
    const { store, press, move, release, tokens } = setup();
    press(105, -30);
    move(105 + 65 * Math.sin(Math.PI / 4), 35 - 65 * Math.cos(Math.PI / 4));
    const shown = { a: { ...tokens().a! }, b: { ...tokens().b! } };
    release();
    expect(tokens().a).toMatchObject({ x: shown.a.x, y: shown.a.y, rotation: 45 });
    expect(tokens().b).toMatchObject({ x: shown.b.x, y: shown.b.y, rotation: 45 });
    // Turned about the pivot (105, 35): still a cell and a half apart, now along the diagonal
    expect(tokens().a!.x).toBeCloseTo(105 - 70 * Math.SQRT1_2, 9);
    expect(Math.hypot(tokens().a!.x - tokens().b!.x, tokens().a!.y - tokens().b!.y)).toBeCloseTo(140, 9);
    expect(store.getState().heldTokens).toEqual({});
  });

  it('snaps the angle to 15°, or 45° with Shift', () => {
    const { press, move, release, tokens } = setup();
    press(105, -30);
    // 35° clockwise from the press, seen from the centre
    move(105 + 65 * Math.sin((35 * Math.PI) / 180), 35 - 65 * Math.cos((35 * Math.PI) / 180), true);
    release();
    expect(tokens().a!.rotation).toBe(45);
  });

  it('puts everything back and leaves no undo step on Escape', () => {
    const { store, history, rotation, press, move, tokens, facings, turnFrame } = setup();
    press(105, -30);
    move(170, 35);
    expect(rotation.cancel()).toBe(true);

    expect(history.getState().pastStates).toHaveLength(0);
    expect(tokens().a).toMatchObject({ x: 35, y: 35 });
    expect(tokens().a!.rotation).toBeUndefined();
    expect(store.getState().objects.drawings.pen!.points).toEqual([{ x: 105, y: 0 }]);
    expect(store.getState().heldTokens).toEqual({});
    expect(facings.at(-1)).toBeNull();
    expect(turnFrame).toHaveBeenLastCalledWith(null);
    expect(rotation.cancel()).toBe(false);
  });

  it('cancels when the window loses focus or the pointer is cancelled', () => {
    for (const lose of ['blur', 'pointercancel'] as const) {
      const { history, press, move, tokens, canvas } = setup();
      press(105, -30);
      move(40, 35);
      if (lose === 'blur') window.dispatchEvent(new Event('blur'));
      else canvas.dispatchEvent(new Event('pointercancel'));
      expect(history.getState().pastStates).toHaveLength(0);
      expect(tokens().b).toMatchObject({ x: 175, y: 35 });
    }
  });

  it('leaves no step for a press that never turned, or a turn brought back to where it began', () => {
    const { history, press, move, release } = setup();
    press(105, -30);
    release();
    press(105, -30);
    move(170, 35);
    move(106, -30);
    release();
    expect(history.getState().pastStates).toHaveLength(0);
  });

  it('is offered only with the selection tools, outside a marquee, for a selection holding a token', () => {
    const { rotation } = setup();
    const frame = { x: 0, y: 0, width: 210, height: 70 };
    rotation.follow(frame, ['a', 'b'], true);
    expect(rotation.layer.visible).toBe(false);
    rotation.follow(frame, [], false);
    expect(rotation.layer.visible).toBe(false);
    rotation.follow(frame, ['a'], false);
    expect(rotation.layer.visible).toBe(true);
    expect(setup('draw-pen').rotation.layer.visible).toBe(false);
  });

  it('ignores a press with another button', () => {
    const { rotation, viewport, plugins } = setup();
    const handle = rotation.layer.getChildByLabel('groupRotateHandle', true)!;
    handle.emit('pointerdown', { button: 2, global: { x: 105, y: -30 }, stopPropagation: vi.fn() } as never);
    viewport.emit('pointermove', { button: 2, global: { x: 170, y: 35 } } as never);
    expect(plugins.pause).not.toHaveBeenCalled();
  });

  it('lets go of a turn without writing when another scene loads, and ignores moves while it loads', () => {
    const { store, history, rotation, press, move, release, facings, turnFrame, plugins } = setup();
    press(105, -30);
    move(170, 35);
    store.setState({ isMapLoading: true });
    const loading = store.getState().objects;
    move(40, 35);
    expect(store.getState().objects).toBe(loading);

    // The next scene arrives with history cleared, as a load leaves it
    store.setState({ objects: { ...store.getState().objects, tokens: { x: token('x', 35, 35) }, drawings: {} } });
    history.getState().clear();
    const loaded = store.getState().objects;
    const writes = vi.fn();
    const stop = store.subscribe(writes);
    rotation.drop();
    store.setState({ isMapLoading: false });
    stop();

    // The load finishing, then letting go of the held tokens: the scene itself is not written
    expect(writes).toHaveBeenCalledTimes(2);
    expect(store.getState().heldTokens).toEqual({});
    expect(store.getState().objects).toBe(loaded);
    expect(facings.at(-1)).toBeNull();
    expect(turnFrame).toHaveBeenLastCalledWith(null);
    expect(plugins.resume).toHaveBeenCalledWith('drag');
    release();
    expect(rotation.cancel()).toBe(false);
    // No transaction is left open: the next edit is a step of its own
    store.getState().updateTokens([{ id: 'x', changes: { x: 105 } }]);
    expect(history.getState().pastStates).toHaveLength(1);
  });

  it('lets go of the held tokens once the same scene has loaded again, writing nothing else', () => {
    const { store, rotation, press, move } = setup();
    press(105, -30);
    move(170, 35);
    expect(Object.keys(store.getState().heldTokens).sort()).toEqual(['a', 'b']);
    store.setState({ isMapLoading: true });
    // The same scene comes back: the same tokens where its file has them
    const reloaded = { ...store.getState().objects, tokens: { a: token('a', 35, 35), b: token('b', 175, 35) } };
    store.setState({ objects: reloaded });
    rotation.drop();
    expect(Object.keys(store.getState().heldTokens).sort()).toEqual(['a', 'b']);
    store.setState({ isMapLoading: false });

    expect(store.getState().heldTokens).toEqual({});
    expect(store.getState().objects).toBe(reloaded);
  });

  it('writes nothing when the pointer is let go while a scene loads', () => {
    const { store, press, move, release } = setup();
    press(105, -30);
    move(170, 35);
    store.setState({ isMapLoading: true });
    const loading = store.getState().objects;
    release();
    expect(store.getState().objects).toBe(loading);
  });
});

describe('turning a selection with fog in it', () => {
  it('turns a frame that holds only the tokens and leaves the fog where it is', () => {
    const store = createViewAtlasStore(createInMemoryApp().app, `group-rotation-fog-${Math.random()}`);
    store.setState({
      persistenceEnabled: false, activeTool: 'select', selectedIds: ['a', 'b', 'smoke'],
      objects: { ...store.getState().objects, tokens: { a: token('a', 35, 35), b: token('b', 175, 35) } },
    });
    const group = (x: number, y: number): Container => {
      const view = new Container();
      const art = view.addChild(new Sprite());
      art.label = 'tokenSprite';
      art.width = 70;
      art.height = 70;
      view.position.set(x, y);
      return view;
    };
    const sprites = { a: group(35, 35), b: group(175, 35) };
    const viewport = Object.assign(new Container(), {
      toWorld: (point: { x: number; y: number }) => ({ x: point.x, y: point.y }),
      plugins: { pause: vi.fn(), resume: vi.fn() },
      options: { events: { domElement: document.createElement('canvas') } },
    });
    const fog = viewport.addChild(new Sprite());
    fog.position.set(600, 300);
    fog.width = 100;
    fog.height = 100;
    const manager = new SelectionManager(viewport as never, () => sprites, () => ({ smoke: fog }), store, new EventEmitter());
    manager.setGroupTurnHost({ pivot: (middle) => middle, showFacings: () => undefined });
    const withoutFog = manager['highlights'].groupFrameBox();

    const handle = viewport.getChildByLabel('groupRotateHandle', true)!;
    handle.emit('pointerdown', { button: 0, global: { x: 105, y: -60 }, stopPropagation: vi.fn() } as never);
    viewport.emit('pointermove', { button: 0, global: { x: 200, y: 35 }, shiftKey: false } as never);

    expect(manager['highlights'].groupFrameBox()).toEqual(withoutFog);
    expect(withoutFog!.x + withoutFog!.width).toBeLessThan(600);
    expect(fog.position).toMatchObject({ x: 600, y: 300 });
    expect(store.getState().objects.tokens.a).toMatchObject({ x: 105, y: -35 });
    manager.destroy();
  });
});
