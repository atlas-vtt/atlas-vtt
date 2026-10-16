import { describe, expect, it, vi } from 'vitest';
import { DragRuler } from '../../src/app/pixi/token-renderer/DragRuler';
import type { DragRulerView } from '../../src/app/pixi/token-renderer/DragRulerView';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import type { ViewAtlasState } from '../../src/app/storeFactory';

const CELL = 70;
const center = (col: number, row: number): { x: number; y: number } => ({ x: CELL / 2 + col * CELL, y: CELL / 2 + row * CELL });

function makeRuler(token: { isHidden?: boolean } = {}): { ruler: DragRuler; view: { draw: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn>; layers: object[] } } {
  const view = { draw: vi.fn(), clear: vi.fn(), destroy: vi.fn(), layers: [{ visible: true }, { visible: true }] };
  const gridSystem = {
    getOptions: () => ({ type: 'square', size: CELL, offsetX: 0, offsetY: 0 }),
    snapTokenCenter: (x: number, y: number) => center(Math.floor(x / CELL), Math.floor(y / CELL)),
  };
  const state = { grid: { snapToGrid: true }, objects: { tokens: { t1: { id: 't1', size: 1, ...token } } } };
  const settings: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, diagonalRule: 'equidistant', rangeBands: [] };
  const ruler = new DragRuler(
    view as unknown as DragRulerView,
    gridSystem as unknown as GridSystem,
    { getState: () => state as unknown as ViewAtlasState },
    () => settings,
  );
  return { ruler, view };
}

const pressSpace = (init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(event);
  return event;
};

describe('DragRuler', () => {
  it('measures from the snapped start to the cell the token would land in', () => {
    const { ruler, view } = makeRuler();
    ruler.begin('t1', { x: 40, y: 30 });
    ruler.update({ x: 3 * CELL + 50, y: 20 });
    expect(view.draw).toHaveBeenLastCalledWith([center(0, 0), center(3, 0)], '15ft');
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
    expect(view.draw).toHaveBeenLastCalledWith([center(0, 0), center(2, 0), center(2, 3)], '25ft');
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
    expect(view.draw).toHaveBeenLastCalledWith([center(0, 0), center(1, 0), center(2, 0)], '10ft');
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
});
