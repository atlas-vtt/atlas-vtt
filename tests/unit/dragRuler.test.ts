// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DragRuler } from '../../src/app/pixi/token-renderer/DragRuler';
import type { DragRulerView } from '../../src/app/pixi/token-renderer/DragRulerView';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { movementTurn, type TurnMovesState } from '../../src/app/initiative/movedThisTurn';
import { BEYOND_SPEED } from '../../src/app/measure/dragMovement';
import type { MovementRules } from '../../src/app/measure/movementRules';
import type { TokenMovement } from '../../src/app/pixi/token-renderer/tokenMovement';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import { computeTokenPixelSize } from '../../src/app/pixi/token-renderer/tokenSizing';

const CELL = 70;
/** The dragged token's radius: the ruler's label keeps clear of it. */
const TOKEN_RADIUS = computeTokenPixelSize(CELL, 1) / 2;
const center = (col: number, row: number): { x: number; y: number } => ({ x: CELL / 2 + col * CELL, y: CELL / 2 + row * CELL });

/** What a ruler is built with beyond its token: the movement it reads, more of the view's state, other measurement settings. */
interface RulerOptions {
  movement?: Pick<TokenMovement, 'rules' | 'speedOf'>;
  state?: Record<string, unknown>;
  settings?: Partial<MeasurementSettings>;
  /** Whether the canvas shows the players' view. */
  playersView?: () => boolean;
}

interface FakeLayer { visible: boolean }
interface FakeView {
  draw: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  layers: FakeLayer[];
  /** The players' reading, held like the real view: there once a drag was drawn with one. */
  playersLayers: FakeLayer[];
}

/** A view that keeps its two readings as the real one does: the GM's, and the players' while the last drawing had one. */
function fakeView(): FakeView & { destroy: ReturnType<typeof vi.fn> } {
  const theirs = [{ visible: false }, { visible: false }];
  const view = {
    draw: vi.fn((_points: unknown, _distance: string, _radius: number, _grid: number, _color?: string, forPlayers?: string) => { view.playersLayers = forPlayers === undefined ? [] : theirs; }),
    clear: vi.fn(() => { view.playersLayers = []; }),
    destroy: vi.fn(),
    layers: [{ visible: true }, { visible: true }],
    playersLayers: [] as FakeLayer[],
  };
  return view;
}

/** A ruler for the token `t1`, by default one of the players' own (it sees), whose speed they may read. */
function makeRuler(token: { isHidden?: boolean; speed?: number; vision?: { enabled: boolean }; side?: string } = {}, shown: () => boolean = () => true, options: RulerOptions = {}): { ruler: DragRuler; view: FakeView } {
  const view = fakeView();
  const gridSystem = {
    getOptions: () => ({ type: 'square', size: CELL, offsetX: 0, offsetY: 0 }),
    snapTokenCenter: (x: number, y: number) => center(Math.floor(x / CELL), Math.floor(y / CELL)),
  };
  const state = { grid: { snapToGrid: true }, objects: { tokens: { t1: { id: 't1', size: 1, vision: { enabled: true }, ...token } } }, ...options.state };
  const settings = { mode: 'metric', unitType: 'feet', unitDistance: 5, diagonalRule: 'equidistant', rangeBands: [], ...options.settings } as MeasurementSettings;
  const ruler = new DragRuler(
    view as unknown as DragRulerView,
    gridSystem as unknown as GridSystem,
    { getState: () => state as unknown as ViewAtlasState },
    () => settings,
    () => true,
    shown,
    options.movement ?? null,
    options.playersView,
  );
  return { ruler, view };
}

const pressSpace = (init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(event);
  return event;
};

describe('DragRuler', () => {
  it('measures from the snapped start to the cell the token would land in, and draws its end under the token', () => {
    const { ruler, view } = makeRuler();
    ruler.begin('t1', { x: 40, y: 30 });
    ruler.update({ x: 3 * CELL + 50, y: 20 });
    expect(view.draw).toHaveBeenLastCalledWith([center(0, 0), { x: 3 * CELL + 50, y: 20 }], '15ft', TOKEN_RADIUS, CELL);
    expect(ruler.path()?.points).toEqual([center(0, 0), center(3, 0)]);
    ruler.end();
  });

  it('tells what it measures: the token and its start, waypoints and landing, none before it leaves its start', () => {
    const { ruler } = makeRuler();
    ruler.begin('t1', center(0, 0));
    expect(ruler.path()).toBeNull();
    ruler.update({ x: center(0, 0).x + 20, y: center(0, 0).y });
    expect(ruler.path()).toBeNull();
    ruler.update(center(2, 0));
    pressSpace();
    ruler.update(center(2, 3));
    expect(ruler.path()).toEqual({ tokenId: 't1', points: [center(0, 0), center(2, 0), center(2, 3)] });
    ruler.end();
    expect(ruler.path()).toBeNull();
  });

  it('shows nothing while the token stays in its cell', () => {
    const { ruler, view } = makeRuler();
    ruler.begin('t1', center(1, 1));
    ruler.update({ x: center(1, 1).x + 20, y: center(1, 1).y });
    expect(view.draw).not.toHaveBeenCalled();
    expect(view.clear).toHaveBeenCalled();
    ruler.end();
  });

  it('adds a waypoint on Space and keeps the command palette hotkey from firing', () => {
    const { ruler, view } = makeRuler();
    const hotkeyListener = vi.fn();
    window.addEventListener('keydown', hotkeyListener);
    ruler.begin('t1', center(0, 0));
    ruler.update(center(2, 0));

    const event = pressSpace();
    ruler.update(center(2, 3));

    expect(event.defaultPrevented).toBe(true);
    expect(hotkeyListener).not.toHaveBeenCalled();
    expect(view.draw).toHaveBeenLastCalledWith([center(0, 0), center(2, 0), center(2, 3)], '25ft', TOKEN_RADIUS, CELL);
    window.removeEventListener('keydown', hotkeyListener);
    ruler.end();
  });

  it('ignores repeated Space presses and duplicate waypoints', () => {
    const { ruler, view } = makeRuler();
    ruler.begin('t1', center(0, 0));
    ruler.update(center(1, 0));
    pressSpace();
    pressSpace();
    pressSpace({ repeat: true });
    ruler.update(center(2, 0));
    expect(view.draw).toHaveBeenLastCalledWith([center(0, 0), center(1, 0), center(2, 0)], '10ft', TOKEN_RADIUS, CELL);
    ruler.end();
  });

  it('releases Space once the drag ends', () => {
    const { ruler, view } = makeRuler();
    ruler.begin('t1', center(0, 0));
    ruler.update(center(1, 0));
    ruler.end();
    expect(pressSpace().defaultPrevented).toBe(false);
    expect(view.clear).toHaveBeenCalled();
  });

  it('shows no distance while the GM has them switched off, and follows the switch in the middle of a drag', () => {
    let shown = false;
    const { ruler, view } = makeRuler({}, () => shown);
    ruler.begin('t1', center(0, 0));
    ruler.update(center(2, 0));
    expect(view.draw).not.toHaveBeenCalled();
    expect(ruler.path()).toBeNull();
    // Space still never reaches the command palette mid-drag, and adds no corner nobody sees
    expect(pressSpace().defaultPrevented).toBe(true);

    shown = true;
    ruler.update(center(2, 3));
    expect(view.draw).toHaveBeenLastCalledWith([center(0, 0), center(2, 3)], '15ft', TOKEN_RADIUS, CELL);
    expect(ruler.path()?.points).toEqual([center(0, 0), center(2, 3)]);

    shown = false;
    ruler.update(center(2, 4));
    expect(view.clear).toHaveBeenCalled();
    ruler.refreshVisibility();
    expect(view.layers.every((layer) => !layer.visible)).toBe(true);
    ruler.end();
  });

  it('hides the ruler from players while it measures a hidden token', () => {
    const hidden = makeRuler({ isHidden: true });
    hidden.ruler.begin('t1', center(0, 0));
    expect(hidden.ruler.getPlayerViewLayers()).toEqual(hidden.view.layers.map(layer => ({ layer, visible: false })));
    hidden.ruler.end();

    const visible = makeRuler();
    visible.ruler.begin('t1', center(0, 0));
    expect(visible.ruler.getPlayerViewLayers()).toEqual([]);
    visible.ruler.end();
  });

  it('hides the ruler from players while they do not see the token it measures', () => {
    const { ruler, view } = makeRuler();
    ruler.begin('t1', center(0, 0));
    expect(ruler.getPlayerViewLayers((id) => id !== 't1')).toEqual(view.layers.map(layer => ({ layer, visible: false })));
    expect(ruler.getPlayerViewLayers(() => true)).toEqual([]);
    ruler.end();
    expect(ruler.getPlayerViewLayers(() => false)).toEqual([]);
  });

  describe('under movement rules', () => {
    const MOVE = { name: 'Move', multiple: 1, color: '#22c55e' };
    const DASH = { name: 'Dash', multiple: 2, color: '#f59e0b' };
    const steps = (countPerTurn = false): MovementRules => ({ steps: [MOVE, DASH], countPerTurn });
    /** Movement as the canvas hands it over: the rules, and the token's own speed. */
    const movement = (rules: MovementRules): RulerOptions['movement'] => ({
      rules: () => rules,
      speedOf: (token) => (typeof token.speed === 'number' ? token.speed : null),
    });
    /** A fight in round 1 whose turn `t1` holds, in which it has moved `moved` feet. */
    const fightWith = (moved: number): Record<string, unknown> => {
      const fight = { initiative: { isActive: true, round: 1, entries: [{ id: 'e1', tokenId: 't1', isActive: true }] }, fightsStarted: 1 };
      return { ...fight, turnMoves: { t1: { turn: movementTurn(fight as unknown as TurnMovesState), distance: moved } } };
    };

    it('takes the colour of the step the move lies in and sets the distance against the speed', () => {
      const { ruler, view } = makeRuler({ speed: 30 }, () => true, { movement: movement(steps()) });
      ruler.begin('t1', center(0, 0));
      ruler.update(center(5, 0));
      expect(view.draw).toHaveBeenLastCalledWith([center(0, 0), center(5, 0)], '25 / 30ft', TOKEN_RADIUS, CELL, MOVE.color);
      ruler.update(center(7, 0));
      expect(view.draw).toHaveBeenLastCalledWith([center(0, 0), center(7, 0)], '35 / 30ft', TOKEN_RADIUS, CELL, DASH.color);
      ruler.update(center(13, 0));
      expect(view.draw).toHaveBeenLastCalledWith([center(0, 0), center(13, 0)], '65 / 30ft', TOKEN_RADIUS, CELL, BEYOND_SPEED);
      ruler.end();
    });

    it('adds up over corners like the distance it shows', () => {
      const { ruler, view } = makeRuler({ speed: 30 }, () => true, { movement: movement(steps()) });
      ruler.begin('t1', center(0, 0));
      ruler.update(center(4, 0));
      pressSpace();
      ruler.update(center(4, 3));
      expect(view.draw).toHaveBeenLastCalledWith([center(0, 0), center(4, 0), center(4, 3)], '35 / 30ft', TOKEN_RADIUS, CELL, DASH.color);
      ruler.end();
    });

    it('goes on from what the token moved in its turn where movement counts per turn and a fight runs', () => {
      const counted = makeRuler({ speed: 30 }, () => true, { movement: movement(steps(true)), state: fightWith(20) });
      counted.ruler.begin('t1', center(0, 0));
      counted.ruler.update(center(3, 0));
      expect(counted.view.draw).toHaveBeenLastCalledWith([center(0, 0), center(3, 0)], '35 / 30ft', TOKEN_RADIUS, CELL, DASH.color);
      counted.ruler.end();

      // The same turn under rules that do not count: each drag starts at 0.
      const single = makeRuler({ speed: 30 }, () => true, { movement: movement(steps(false)), state: fightWith(20) });
      single.ruler.begin('t1', center(0, 0));
      single.ruler.update(center(3, 0));
      expect(single.view.draw).toHaveBeenLastCalledWith([center(0, 0), center(3, 0)], '15 / 30ft', TOKEN_RADIUS, CELL, MOVE.color);
      single.ruler.end();

      // Outside a fight nothing was moved "this turn".
      const idle = makeRuler({ speed: 30 }, () => true, { movement: movement(steps(true)), state: { ...fightWith(20), initiative: { isActive: false, round: 1, entries: [] } } });
      idle.ruler.begin('t1', center(0, 0));
      idle.ruler.update(center(3, 0));
      expect(idle.view.draw).toHaveBeenLastCalledWith([center(0, 0), center(3, 0)], '15 / 30ft', TOKEN_RADIUS, CELL, MOVE.color);
      idle.ruler.end();
    });

    it('draws today\'s line and label without steps, without a speed and in range bands', () => {
      const plain: Array<[string, { speed?: number }, RulerOptions]> = [
        ['no steps', { speed: 30 }, { movement: movement({ steps: [], countPerTurn: true }) }],
        ['no speed', {}, { movement: movement(steps()) }],
        ['range bands', { speed: 30 }, { movement: movement(steps()), settings: { mode: 'abstract', rangeBands: [{ name: 'Close', maxSquares: 6 }] } }],
      ];
      for (const [name, token, options] of plain) {
        const { ruler, view } = makeRuler(token, () => true, options);
        ruler.begin('t1', center(0, 0));
        ruler.update(center(3, 0));
        // Four arguments: no colour is named, so the view draws in the accent as it always did.
        expect(view.draw, name).toHaveBeenLastCalledWith([center(0, 0), center(3, 0)], name === 'range bands' ? 'Close' : '15ft', TOKEN_RADIUS, CELL);
        ruler.end();
      }
    });

    describe('of a token that is not the players\' own', () => {
      const CREATURES: Array<[string, { vision?: { enabled: boolean }; side?: string }]> = [
        ['a creature without sight', { vision: { enabled: false } }],
        ['a seeing token the GM put on the opponents\' side', { side: 'opponents' }],
      ];

      for (const [name, creature] of CREATURES) {
        it(`hands the view the plain distance for the players beside the GM's reading: ${name}`, () => {
          const { ruler, view } = makeRuler({ speed: 30, ...creature }, () => true, { movement: movement(steps(true)), state: fightWith(20) });
          ruler.begin('t1', center(0, 0));
          ruler.update(center(3, 0));
          // The GM reads 35 of 30 ft in the Dash colour; the players 15 ft, in the accent.
          expect(view.draw).toHaveBeenLastCalledWith([center(0, 0), center(3, 0)], '35 / 30ft', TOKEN_RADIUS, CELL, DASH.color, '15ft');
          ruler.end();
        });
      }

      it('shows the GM\'s reading on the GM\'s canvas and the players\' in their frame, which leaves out the GM\'s', () => {
        const { ruler, view } = makeRuler({ speed: 30, vision: { enabled: false } }, () => true, { movement: movement(steps()) });
        ruler.begin('t1', center(0, 0));
        ruler.update(center(3, 0));
        expect(view.layers.map((layer) => layer.visible)).toEqual([true, true]);
        expect(view.playersLayers.map((layer) => layer.visible)).toEqual([false, false]);
        expect(ruler.getPlayerViewLayers(() => true)).toEqual([
          ...view.layers.map((layer) => ({ layer, visible: false })),
          ...view.playersLayers.map((layer) => ({ layer, visible: true })),
        ]);
        // Of a token they do not see they have neither.
        expect(ruler.getPlayerViewLayers(() => false)).toEqual([...view.layers, ...view.playersLayers].map((layer) => ({ layer, visible: false })));
        ruler.end();
      });

      it('shows the players\' reading on the canvas while it shows their view, and the GM\'s again after', () => {
        let players = true;
        const { ruler, view } = makeRuler({ speed: 30, vision: { enabled: false } }, () => true, { movement: movement(steps()), playersView: () => players });
        ruler.begin('t1', center(0, 0));
        ruler.update(center(3, 0));
        expect(view.layers.map((layer) => layer.visible)).toEqual([false, false]);
        expect(view.playersLayers.map((layer) => layer.visible)).toEqual([true, true]);
        // A frame taken then shows the same.
        expect(ruler.getPlayerViewLayers(() => true)).toEqual([
          ...view.layers.map((layer) => ({ layer, visible: false })),
          ...view.playersLayers.map((layer) => ({ layer, visible: true })),
        ]);
        players = false;
        ruler.refreshVisibility();
        expect(view.layers.map((layer) => layer.visible)).toEqual([true, true]);
        expect(view.playersLayers.map((layer) => layer.visible)).toEqual([false, false]);
        ruler.end();
      });

      it('has one reading for everyone where the GM reads a plain distance too: no steps, no speed', () => {
        const { ruler, view } = makeRuler({ vision: { enabled: false } }, () => true, { movement: movement(steps()), playersView: () => true });
        ruler.begin('t1', center(0, 0));
        ruler.update(center(3, 0));
        expect(view.draw).toHaveBeenLastCalledWith([center(0, 0), center(3, 0)], '15ft', TOKEN_RADIUS, CELL);
        expect(view.layers.map((layer) => layer.visible)).toEqual([true, true]);
        expect(ruler.getPlayerViewLayers(() => true)).toEqual([]);
        ruler.end();
      });
    });

    it('shows the players their own token\'s move against its speed, as the GM reads it', () => {
      const { ruler, view } = makeRuler({ speed: 30 }, () => true, { movement: movement(steps()), playersView: () => true });
      ruler.begin('t1', center(0, 0));
      ruler.update(center(5, 0));
      expect(view.draw).toHaveBeenLastCalledWith([center(0, 0), center(5, 0)], '25 / 30ft', TOKEN_RADIUS, CELL, MOVE.color);
      expect(view.layers.map((layer) => layer.visible)).toEqual([true, true]);
      expect(ruler.getPlayerViewLayers(() => true)).toEqual([]);
      ruler.end();
    });

    it('shows nothing while distances are switched off, whatever the rules say', () => {
      const { ruler, view } = makeRuler({ speed: 30 }, () => false, { movement: movement(steps()) });
      ruler.begin('t1', center(0, 0));
      ruler.update(center(5, 0));
      expect(view.draw).not.toHaveBeenCalled();
      expect(ruler.path()).toBeNull();
      ruler.end();
    });
  });
});
