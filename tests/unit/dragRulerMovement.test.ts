// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { DragRuler } from '../../src/app/pixi/token-renderer/DragRuler';
import type { DragRulerView } from '../../src/app/pixi/token-renderer/DragRulerView';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { movedThisTurn } from '../../src/app/initiative/movedThisTurn';
import type { MovementRules } from '../../src/app/measure/movementRules';
import { getHistoryStore } from '../../src/app/stores/history';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const CELL = 70;
const center = (col: number, row: number): { x: number; y: number } => ({ x: CELL / 2 + col * CELL, y: CELL / 2 + row * CELL });
const MOVE = { name: 'Move', multiple: 1, color: '#22c55e' };
const DASH = { name: 'Dash', multiple: 2, color: '#f59e0b' };
const FEET = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', difficultTerrain: 'double', rangeBands: [], coneAngle: 90 } as MeasurementSettings;

const token = (id: string, col: number, row: number): TokenEntity => ({ id, kind: 'token', imagePath: `${id}.png`, ...center(col, row), speed: 30 });

interface Table {
  store: ViewAtlasStore;
  draw: ReturnType<typeof vi.fn>;
  press: (tokenId: string) => void;
  moveTo: (point: { x: number; y: number }) => void;
  release: (point: { x: number; y: number }) => void;
  /** Presses `tokenId`, drags it by whole cells and lets go. */
  drag: (tokenId: string, cols: number, rows?: number) => void;
  moved: (tokenId: string) => number;
  steps: () => number;
  controller: InteractionController;
}

/** The tokens a (0, 0) and b (0, 2) in a fight whose turn a holds, dragged through the real controller and ruler. */
function table(rules: MovementRules, options: { shown?: boolean; fight?: boolean } = {}): Table {
  const store = createViewAtlasStore(createInMemoryApp().app, `drag-movement-${Math.random()}`);
  store.setState({ persistenceEnabled: false, activeTool: 'select', objects: { ...store.getState().objects, tokens: { a: token('a', 0, 0), b: token('b', 0, 2) } } });
  for (const id of ['a', 'b']) store.getState().addToInitiative({ tokenId: id, name: id, initiative: id === 'a' ? 20 : 10, initiativeModifier: 0, imagePath: '', isNPC: true });
  if (options.fight !== false) store.getState().startCombat();
  getHistoryStore(store)!.getState().clear();

  const handlers = new Map<string, (event: unknown) => void>();
  const viewport = {
    on: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
    off: (name: string) => handlers.delete(name),
    toWorld: (point: { x: number; y: number }) => point,
    plugins: { pause: vi.fn(), resume: vi.fn() },
    options: { events: { domElement: document.body.createEl('canvas') } },
  };
  const gridSystem = {
    getOptions: () => ({ type: 'square', size: CELL, offsetX: 0, offsetY: 0 }),
    snapTokenCenter: (x: number, y: number) => center(Math.floor(x / CELL), Math.floor(y / CELL)),
  };
  const controller = new InteractionController(viewport as never, store, gridSystem as never, {} as never, createInMemoryApp().app, false);
  controller.setTokenSpriteProvider((id) => {
    const entry = store.getState().objects.tokens[id];
    return entry ? { position: { x: entry.x, y: entry.y, set: vi.fn() }, getChildByLabel: () => null } as never : null;
  });
  const draw = vi.fn();
  const view = { draw, clear: vi.fn(), destroy: vi.fn(), layers: [] };
  controller.setDragRuler(new DragRuler(
    view as unknown as DragRulerView, gridSystem as never, store, () => FEET, () => true, () => options.shown ?? true,
    { rules: () => rules, speedOf: (dragged) => (typeof dragged.speed === 'number' ? dragged.speed : null) },
  ));

  let from = { x: 0, y: 0 };
  const press = (tokenId: string): void => {
    const pressed = store.getState().objects.tokens[tokenId]!;
    from = { x: pressed.x, y: pressed.y };
    controller.handleViewportTokenPointerDown(tokenId, { button: 0, shiftKey: false, altKey: false, global: from, stopPropagation: vi.fn() } as never);
  };
  const moveTo = (point: { x: number; y: number }): void => handlers.get('pointermove')?.({ global: point });
  const release = (point: { x: number; y: number }): void => handlers.get('pointerup')?.({ global: point });
  return {
    store, draw, press, moveTo, release, controller,
    drag: (tokenId, cols, rows = 0) => {
      press(tokenId);
      const to = { x: from.x + cols * CELL, y: from.y + rows * CELL };
      moveTo(to);
      release(to);
    },
    moved: (tokenId) => movedThisTurn(store.getState(), tokenId),
    steps: () => getHistoryStore(store)!.getState().pastStates.length,
  };
}

const counting: MovementRules = { steps: [MOVE, DASH], countPerTurn: true };

describe('what a dropped token moved in its turn', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('is counted with the drop, in the drop\'s own undo step', () => {
    const { store, drag, moved, steps } = table(counting);
    drag('a', 3);
    expect(store.getState().objects.tokens.a).toMatchObject(center(3, 0));
    expect(moved('a')).toBe(15);
    expect(moved('b')).toBe(0);
    expect(steps()).toBe(1);
  });

  it('comes back when the drop is undone, and counts again when it is redone', () => {
    const { store, drag, moved } = table(counting);
    const history = getHistoryStore(store)!.getState();
    drag('a', 3);
    drag('a', 2);
    expect(moved('a')).toBe(25);
    history.undo();
    expect(store.getState().objects.tokens.a).toMatchObject(center(3, 0));
    expect(moved('a')).toBe(15);
    history.undo();
    expect(store.getState().objects.tokens.a).toMatchObject(center(0, 0));
    expect(moved('a')).toBe(0);
    history.redo();
    history.redo();
    expect(moved('a')).toBe(25);
  });

  it('is what the next drag of the turn goes on from', () => {
    const { drag, press, moveTo, release, draw } = table(counting);
    drag('a', 4);
    press('a');
    moveTo(center(7, 0));
    expect(draw.mock.lastCall?.slice(1)).toEqual(['35 / 30ft', expect.any(Number), CELL, DASH.color]);
    release(center(7, 0));
  });

  it('counts for each token of a group drag its own path, with the difficult terrain on it', () => {
    const { store, drag, moved, steps } = table(counting);
    // Difficult ground over the cells (1, 0) and (2, 0): on a's way, not on b's two rows below.
    store.getState().addMapFeatures([{ name: 'Rubble', terrain: { difficult: true }, polygon: [{ x: CELL, y: 0 }, { x: 3 * CELL, y: 0 }, { x: 3 * CELL, y: CELL }, { x: CELL, y: CELL }] }]);
    getHistoryStore(store)!.getState().clear();
    store.getState().setSelection(['a', 'b']);
    drag('a', 3);
    expect(store.getState().objects.tokens.b).toMatchObject(center(3, 2));
    expect(moved('a')).toBe(25);
    expect(moved('b')).toBe(15);
    expect(steps()).toBe(1);
  });

  it('counts the corners of the measured path', () => {
    const { press, moveTo, release, moved } = table(counting);
    press('a');
    moveTo(center(2, 0));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    moveTo(center(2, 2));
    release(center(2, 2));
    // Two cells along and two down: 20 ft, where the straight way is 10 ft.
    expect(moved('a')).toBe(20);
  });

  it('is counted whether or not the drag shows its distance', () => {
    const { drag, moved, draw } = table(counting, { shown: false });
    drag('a', 3);
    expect(draw).not.toHaveBeenCalled();
    expect(moved('a')).toBe(15);
  });

  it('is not counted for a drag that never drops: the view closing in the middle of it', () => {
    const { store, press, moveTo, moved, controller } = table(counting);
    press('a');
    moveTo(center(3, 0));
    controller.destroyAll();
    expect(moved('a')).toBe(0);
    expect(store.getState().turnMoves).toEqual({});
  });

  it('is not counted under rules that do not count per turn, nor outside a fight', () => {
    const single = table({ steps: [MOVE, DASH], countPerTurn: false });
    single.drag('a', 3);
    expect(single.store.getState().turnMoves).toEqual({});

    const idle = table(counting, { fight: false });
    idle.drag('a', 3);
    expect(idle.store.getState().turnMoves).toEqual({});
    expect(idle.steps()).toBe(1);
  });
});
