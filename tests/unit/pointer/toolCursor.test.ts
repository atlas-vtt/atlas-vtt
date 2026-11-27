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

interface At { x: number; y: number }
/** A part of a token PIXI hits itself, with a cursor its code sets: the name badge, a rotate handle. */
interface Part { at: At; cursor: string }

const PIN: At = { x: 40, y: 40 };
const TOKEN: At = { x: 200, y: 200 };
const EMPTY: At = { x: 300, y: 300 };
const BESIDE: At = { x: 305, y: 300 };
const BADGE: Part = { at: { x: 200, y: 230 }, cursor: 'text' };
const ROTATE: Part = { at: { x: 200, y: 170 }, cursor: 'grab' };

type Tool = ViewState['activeTool'];

interface Map {
  canvas: HTMLCanvasElement;
  /** A mouse move; `part` is the child of the viewport PIXI hit. Returns the canvas's cursor once every write for the move is done. */
  moveTo(at: At, part?: Part): Promise<string>;
  moveOver(part: Part): Promise<string>;
  setTool(tool: Tool): void;
  middle(type: 'pointerdown' | 'pointerup'): void;
  openAlignment(): () => void;
}

const stops: Array<() => void> = [];
afterEach(() => stops.splice(0).forEach((stop) => stop()));

/**
 * A map's pointer bound to its viewport as a view binds it, with one pin and one token, the laser's real
 * renderer, and PIXI 8.23's own cursor write after the listeners: the hit target's cursor, written only
 * when it differs from the last one PIXI wrote, `default` as `inherit`.
 */
function mapWith(initial: Tool): Map {
  let tool = initial;
  const listeners: Array<(next: Tool) => void> = [];
  const host: MapPointerHost = {
    store: { getState: () => ({ activeTool: tool, selectedIds: [], clearSelection: () => undefined }) },
    gmView: () => true,
    placing: () => false,
  };
  const { pointer, viewport, canvas, stop } = boundPointer(host);
  // The laser reads the zoom where it lays its trail
  Object.assign(viewport, { scale: { x: 1, y: 1 } });
  const near = (point: At, x: number, y: number): boolean => Math.hypot(point.x - x, point.y - y) < 10;
  pointer.attach('pins', { hitTest: (x, y) => (near(PIN, x, y) ? 'pin-1' : null), press: () => undefined, hover: () => undefined });
  pointer.attach('tokens', {
    hitTest: (x, y) => (near(TOKEN, x, y) ? 'token-1' : null),
    press: () => null,
    offersMenu: () => true,
    hover: () => undefined,
    preview: () => undefined,
    barAt: () => null,
    pressBar: () => false,
    hoverBar: () => undefined,
    dragSelected: () => undefined,
    dragging: () => false,
  });
  const ticker = { add: (): void => undefined, remove: (): void => undefined };
  const laser = new LaserPointerRenderer(
    viewport as unknown as Viewport,
    { ticker } as unknown as Application,
    { get: () => tool, subscribe: (listener) => { listeners.push(listener); return () => undefined; } },
    canvas,
    () => DEFAULT_LASER_POINTER_SETTINGS,
  );
  stops.push(stop, () => laser.destroy());

  let pixiWrote: string | null = null;
  const pixiSetCursor = (mode: string | undefined): void => {
    const shown = mode || 'default';
    if (pixiWrote === shown) return;
    pixiWrote = shown;
    canvas.style.cursor = shown === 'default' ? 'inherit' : shown;
  };
  const moveTo = async (at: At, part?: Part): Promise<string> => {
    const target = part ? { cursor: part.cursor } : viewport;
    const move = { global: { x: at.x, y: at.y }, altKey: false, target, nativeEvent: { target: canvas }, stopPropagation: (): void => undefined };
    viewport.emit('pointermove', move as unknown as FederatedPointerEvent);
    pixiSetCursor(target.cursor);
    // The listener writes the canvas once PIXI has written its own cursor for the event
    await new Promise<void>((done) => queueMicrotask(done));
    return canvas.style.cursor;
  };
  const middle = (type: 'pointerdown' | 'pointerup'): void => {
    const press = { button: 1, buttons: type === 'pointerdown' ? 4 : 0, pointerType: 'mouse', global: { ...EMPTY }, stopPropagation: (): void => undefined, preventDefault: (): void => undefined };
    viewport.emit(type, press as unknown as FederatedPointerEvent);
  };
  const openAlignment = (): (() => void) => {
    const view = { renderer: { getCanvasElement: () => canvas } } as unknown as AlignmentTabProps['view'];
    return renderHook(() => useCrosshairCursor(false, view)).unmount;
  };
  return {
    canvas,
    moveTo,
    moveOver: (part) => moveTo(part.at, part),
    setTool: (next) => { tool = next; listeners.forEach((listener) => listener(next)); },
    middle,
    openAlignment,
  };
}

const showsArrow = (cursor: string): boolean => ['', 'default', 'inherit', 'auto'].includes(cursor);

describe('the cursor a tool or panel sets on the canvas', () => {
  it('keeps the laser\'s hidden arrow over the empty map', async () => {
    const map = mapWith('laser-pointer');
    expect([await map.moveTo(EMPTY), await map.moveTo(BESIDE)]).toEqual(['none', 'none']);
  });

  it('gives the laser its hidden arrow back once a pin under the pointer is left', async () => {
    const map = mapWith('select');
    await map.moveTo(EMPTY);
    map.setTool('laser-pointer');
    expect([await map.moveTo(EMPTY), await map.moveTo(PIN), await map.moveTo(EMPTY), await map.moveTo(BESIDE)]).toEqual(['none', 'pointer', 'none', 'none']);
  });

  it('gives the laser its hidden arrow back once a token\'s name badge is left', async () => {
    const map = mapWith('select');
    await map.moveTo(EMPTY);
    map.setTool('laser-pointer');
    expect([await map.moveTo(EMPTY), await map.moveOver(BADGE), await map.moveTo(EMPTY), await map.moveTo(BESIDE)]).toEqual(['none', 'text', 'none', 'none']);
  });

  it('keeps the arrow hidden while the middle button holds the laser with another tool in hand, and gives it back on release', async () => {
    const map = mapWith('measure');
    await map.moveTo(EMPTY);
    map.middle('pointerdown');
    const held = [await map.moveTo(BESIDE), await map.moveTo(EMPTY)];
    map.middle('pointerup');
    const after = await map.moveTo(BESIDE);
    expect({ held, afterShowsArrow: showsArrow(after) }).toEqual({ held: ['none', 'none'], afterShowsArrow: true });
  });

  it.each<Tool>(['measure', 'fog', 'note-pin', 'select', 'move', 'laser-pointer'])('keeps the grid alignment\'s crosshair with the %s tool in hand', async (tool) => {
    const map = mapWith(tool);
    stops.push(map.openAlignment());
    expect([await map.moveTo(EMPTY), await map.moveTo(PIN), await map.moveTo(EMPTY)]).toEqual(['crosshair', 'pointer', 'crosshair']);
  });

  it('keeps the grid alignment\'s crosshair once a token\'s rotate handle is left', async () => {
    const map = mapWith('select');
    await map.moveTo(EMPTY);
    stops.push(map.openAlignment());
    expect([await map.moveTo(EMPTY), await map.moveOver(ROTATE), await map.moveTo(EMPTY)]).toEqual(['crosshair', 'grab', 'crosshair']);
  });

  it('hides the arrow while the middle button holds the laser over the grid alignment, and gives the crosshair back on release', async () => {
    const map = mapWith('select');
    await map.moveTo(EMPTY);
    stops.push(map.openAlignment());
    map.middle('pointerdown');
    const held = await map.moveTo(BESIDE);
    map.middle('pointerup');
    expect({ held, after: await map.moveTo(EMPTY) }).toEqual({ held: 'none', after: 'crosshair' });
  });

  it('shows the cursor again once the grid alignment opened under the laser is closed after Select was chosen', async () => {
    const map = mapWith('laser-pointer');
    await map.moveTo(EMPTY);
    const closeAlignment = map.openAlignment();
    map.setTool('select');
    closeAlignment();
    const seen = [await map.moveTo(EMPTY), await map.moveTo(TOKEN), await map.moveTo(EMPTY)];
    expect(seen.map(showsArrow)).toEqual([true, false, true]);
  });

  it('keeps the laser\'s hidden arrow once the grid alignment opened before it is closed', async () => {
    const map = mapWith('select');
    await map.moveTo(EMPTY);
    const closeAlignment = map.openAlignment();
    map.setTool('laser-pointer');
    const open = await map.moveTo(BESIDE);
    closeAlignment();
    expect({ open, closed: await map.moveTo(EMPTY) }).toEqual({ open: 'none', closed: 'none' });
  });

  it('shows the map\'s own cursor over a pin and the system\'s again off it, where no tool or panel set one', async () => {
    const map = mapWith('select');
    const over = await map.moveTo(PIN);
    const off = await map.moveTo(EMPTY);
    expect({ over, offShowsArrow: showsArrow(off) }).toEqual({ over: 'pointer', offShowsArrow: true });
  });

  it('brings back no cursor of a token\'s part once the pointer left it by a pin for the empty map', async () => {
    const map = mapWith('select');
    const seen = [await map.moveOver(BADGE), await map.moveTo(PIN), await map.moveTo(EMPTY)];
    expect({ seen: seen.slice(0, 2), offShowsArrow: showsArrow(seen[2] ?? '') }).toEqual({ seen: ['text', 'pointer'], offShowsArrow: true });
  });

  it('leaves no pin\'s cursor behind once the grid alignment opened over a pin is closed', async () => {
    const map = mapWith('measure');
    const over = await map.moveTo(PIN);
    const closeAlignment = map.openAlignment();
    const openOff = await map.moveTo(EMPTY);
    closeAlignment();
    await map.moveTo(PIN);
    const closedOff = await map.moveTo(EMPTY);
    expect({ over, openOff, closedOffShowsArrow: showsArrow(closedOff) }).toEqual({ over: 'pointer', openOff: 'crosshair', closedOffShowsArrow: true });
  });
});

describe('the cursor of a token\'s own part with Select or Move', () => {
  it.each<[Tool, Part]>([['select', ROTATE], ['select', BADGE], ['move', ROTATE], ['move', BADGE]])(
    'with %s shows the cursor of %j whether the pointer comes from the empty map or from the token',
    async (tool, part) => {
      const fromEmpty = mapWith(tool);
      await fromEmpty.moveTo(EMPTY);
      const fromToken = mapWith(tool);
      await fromToken.moveTo(EMPTY);
      await fromToken.moveTo(TOKEN);
      expect({ fromEmpty: await fromEmpty.moveOver(part), fromToken: await fromToken.moveOver(part) }).toEqual({ fromEmpty: part.cursor, fromToken: part.cursor });
    },
  );
});
