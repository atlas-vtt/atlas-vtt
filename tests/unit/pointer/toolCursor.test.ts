// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { Application, FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it } from 'vitest';
import { LaserPointerRenderer } from '../../../src/app/pixi/LaserPointerRenderer';
import type { MapPointerHost } from '../../../src/app/pixi/pointer/MapPointer';
import { useCrosshairCursor } from '../../../src/app/react/hooks/useGridAlignmentEffects';
import type { AlignmentTabProps } from '../../../src/app/react/hooks/useGridAlignmentEffects';
import { DEFAULT_LASER_POINTER_SETTINGS } from '../../../src/app/tools/laserPointerSettings';
import type { ViewState } from '../../../src/app/types/viewState';
import { boundPointer } from './mapPointerDriver';

const PIN = { x: 40, y: 40 };
const EMPTY = { x: 300, y: 300 };

type Tool = ViewState['activeTool'];

/** A map's pointer bound to its viewport as a view binds it, with one pin and one token on the map. */
function mapWith(tool: Tool): ReturnType<typeof boundPointer> & { moveTo(at: { x: number; y: number }): Promise<string> } {
  const host: MapPointerHost = {
    store: { getState: () => ({ activeTool: tool, selectedIds: [], clearSelection: () => undefined }) },
    gmView: () => true,
    placing: () => false,
  };
  const bound = boundPointer(host);
  // The laser reads the zoom where it lays its trail
  Object.assign(bound.viewport, { scale: { x: 1, y: 1 } });
  const near = (point: { x: number; y: number }, x: number, y: number): boolean => Math.hypot(point.x - x, point.y - y) < 10;
  bound.pointer.attach('pins', { hitTest: (x, y) => (near(PIN, x, y) ? 'pin-1' : null), press: () => undefined, hover: () => undefined });
  const moveTo = async (at: { x: number; y: number }): Promise<string> => {
    const move = { global: { x: at.x, y: at.y }, altKey: false, nativeEvent: { target: bound.canvas }, stopPropagation: (): void => undefined };
    bound.viewport.emit('pointermove', move as unknown as FederatedPointerEvent);
    // The listener writes the canvas once PIXI has written its own cursor for the event
    await new Promise<void>((done) => queueMicrotask(done));
    return bound.canvas.style.cursor;
  };
  return { ...bound, moveTo };
}

/** The laser pointer's real renderer, with `tool` in hand: the laser tool hides the arrow under its dot. */
function laserOn(map: ReturnType<typeof mapWith>, tool: Tool = 'laser-pointer'): LaserPointerRenderer {
  const ticker = { add: (): void => undefined, remove: (): void => undefined };
  return new LaserPointerRenderer(
    map.viewport as unknown as Viewport,
    { ticker } as unknown as Application,
    { get: () => tool, subscribe: () => () => undefined },
    map.canvas,
    () => DEFAULT_LASER_POINTER_SETTINGS,
  );
}

/** The grid alignment panel open on the map, placing points: its real crosshair hook. */
function alignmentCrosshair(canvas: HTMLCanvasElement): () => void {
  const view = { renderer: { getCanvasElement: () => canvas } } as unknown as AlignmentTabProps['view'];
  return renderHook(() => useCrosshairCursor(false, view)).unmount;
}

const stops: Array<() => void> = [];
afterEach(() => stops.splice(0).forEach((stop) => stop()));

describe('the cursor a tool or panel sets on the canvas', () => {
  it('keeps the laser\'s hidden arrow over the empty map', async () => {
    const map = mapWith('laser-pointer');
    const laser = laserOn(map);
    stops.push(map.stop, () => laser.destroy());
    expect([await map.moveTo(EMPTY), await map.moveTo({ x: EMPTY.x + 5, y: EMPTY.y })]).toEqual(['none', 'none']);
  });

  it('gives the laser its hidden arrow back once a pin under the pointer is left', async () => {
    const map = mapWith('laser-pointer');
    const laser = laserOn(map);
    stops.push(map.stop, () => laser.destroy());
    expect([await map.moveTo(EMPTY), await map.moveTo(PIN), await map.moveTo(EMPTY)]).toEqual(['none', 'pointer', 'none']);
  });

  it('keeps the arrow hidden while the middle button holds the laser with another tool in hand', async () => {
    const map = mapWith('measure');
    const laser = laserOn(map, 'measure');
    stops.push(map.stop, () => laser.destroy());
    const press = { button: 1, buttons: 4, pointerType: 'mouse', global: { x: EMPTY.x, y: EMPTY.y }, stopPropagation: (): void => undefined, preventDefault: (): void => undefined };
    map.viewport.emit('pointerdown', press as unknown as FederatedPointerEvent);
    expect([await map.moveTo(EMPTY), await map.moveTo({ x: EMPTY.x + 5, y: EMPTY.y })]).toEqual(['none', 'none']);
  });

  it.each<Tool>(['measure', 'fog', 'note-pin', 'select', 'move', 'laser-pointer'])('keeps the grid alignment\'s crosshair with the %s tool in hand', async (tool) => {
    const map = mapWith(tool);
    stops.push(map.stop, alignmentCrosshair(map.canvas));
    expect([await map.moveTo(EMPTY), await map.moveTo(PIN), await map.moveTo(EMPTY)]).toEqual(['crosshair', 'pointer', 'crosshair']);
  });

  it('shows the map\'s own cursor over a pin and the system\'s again off it, where no tool or panel set one', async () => {
    const map = mapWith('select');
    stops.push(map.stop);
    const over = await map.moveTo(PIN);
    const off = await map.moveTo(EMPTY);
    expect({ over, offShowsArrow: ['', 'default', 'inherit'].includes(off) }).toEqual({ over: 'pointer', offShowsArrow: true });
  });

  it('brings back no cursor PIXI showed for a token\'s part once the pointer left a pin for the empty map', async () => {
    const map = mapWith('select');
    stops.push(map.stop);
    // PIXI writes the cursor of what lies under the pointer (a token's name, a rotation handle) itself
    map.canvas.style.cursor = 'text';
    const over = await map.moveTo(PIN);
    const off = await map.moveTo(EMPTY);
    expect({ over, offShowsArrow: ['', 'default', 'inherit'].includes(off) }).toEqual({ over: 'pointer', offShowsArrow: true });
  });

  it('leaves no pin\'s cursor behind once the grid alignment opened over a pin is closed', async () => {
    const map = mapWith('measure');
    stops.push(map.stop);
    const over = await map.moveTo(PIN);
    const closeAlignment = alignmentCrosshair(map.canvas);
    const openOff = await map.moveTo(EMPTY);
    closeAlignment();
    await map.moveTo(PIN);
    const closedOff = await map.moveTo(EMPTY);
    expect({ over, openOff, closedOffShowsArrow: ['', 'default', 'inherit'].includes(closedOff) })
      .toEqual({ over: 'pointer', openOff: 'crosshair', closedOffShowsArrow: true });
  });
});
