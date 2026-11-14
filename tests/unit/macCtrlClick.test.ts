import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { EventEmitter } from 'events';
import type { App } from 'obsidian';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { ShapeStroke } from '../../src/app/tools/shapeStroke';
import { PointerTap, type TapEvent, type TapViewport } from '../../src/app/online/marks/PointerTap.ts';
import { setCtrlClickIsSecondary } from '../../src/app/pixi/utils/pointerButtons';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Token } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const openContextMenuGlobal = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal,
  closeContextMenuGlobal: () => {},
}));

let restore: (() => void) | undefined;
/** The application says where it runs: on macOS a Ctrl+click is a secondary click. */
const runOn = (platform: 'mac' | 'windows'): void => { restore = setCtrlClickIsSecondary(platform === 'mac'); };
afterEach(() => {
  restore?.();
  restore = undefined;
  openContextMenuGlobal.mockClear();
});

/** A press of the primary button with Ctrl held, as macOS sends a Ctrl+click and Windows a Ctrl+left click. */
const ctrlPress = (at = 140): FederatedPointerEvent => ({
  button: 0, ctrlKey: true, shiftKey: false, altKey: false, pointerId: 1,
  clientX: 520, clientY: 310, global: { x: at, y: at }, stopPropagation: () => {},
}) as unknown as FederatedPointerEvent;

describe('Ctrl+click on a token', () => {
  const token = (id: string): Token => ({ id, kind: 'token', imagePath: `${id}.png`, x: 0, y: 0 });

  function tokens(): { store: ReturnType<typeof createViewAtlasStore>; press: () => void; dragsPrepared: () => number } {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, `ctrl-click-${Math.random()}`);
    store.setState({
      persistenceEnabled: false, activeTool: 'select', selectedIds: ['a'],
      objects: { ...store.getState().objects, tokens: { a: token('a'), b: token('b') } },
    });
    const pause = vi.fn();
    const viewport = {
      plugins: { pause, resume: vi.fn() }, on: vi.fn(), off: vi.fn(), options: {},
      toWorld: (point: { x: number; y: number }) => point,
    };
    const controller = new InteractionController(
      viewport as unknown as Viewport, store, {} as GridSystem, {} as EventEmitter, app as unknown as App,
    );
    return { store, press: () => controller.handleViewportTokenPointerDown('b', ctrlPress()), dragsPrepared: () => pause.mock.calls.length };
  }

  it('opens the token menu on macOS and starts no drag', () => {
    runOn('mac');
    const { store, press, dragsPrepared } = tokens();

    press();

    expect(openContextMenuGlobal).toHaveBeenCalledOnce();
    expect(openContextMenuGlobal.mock.calls[0]![1]).toEqual({ x: 520, y: 310 });
    expect(dragsPrepared()).toBe(0);
    expect(store.getState().selectedIds).toEqual(['a']);
  });

  it('stays the start of a drag on Windows and Linux', () => {
    runOn('windows');
    const { press, dragsPrepared } = tokens();

    press();

    expect(openContextMenuGlobal).not.toHaveBeenCalled();
    expect(dragsPrepared()).toBe(1);
  });
});

describe('Ctrl+click with the fog tool', () => {
  interface FogToolHarness {
    stroke: ShapeStroke;
    onPointerDown(event: FederatedPointerEvent): void;
    handleViewportFogPointerDown(fogId: string, event: FederatedPointerEvent): void;
  }

  function fogTool(): { tool: FogToolHarness; setSelection: ReturnType<typeof vi.fn> } {
    const setSelection = vi.fn();
    const state = { activeTool: 'fog', isMapLoading: false, isPlayerView: false, grid: { size: 70 }, objects: { fog: {} }, setSelection };
    const tool = Object.assign(Object.create(FogOfWarRenderer.prototype) as FogOfWarRenderer, {
      store: { getState: () => state },
      viewport: { pause: false, toWorld: (point: { x: number; y: number }) => point },
      stroke: Object.assign(new ShapeStroke(), { mode: 'rectangle' }),
      container: {},
      fogSprites: new Map(),
      previewSprite: {},
      renderPreviewFromStore: vi.fn(),
      refreshBounds: vi.fn(),
      rectPreviewGraphics: { clear: vi.fn(), rect: vi.fn(), stroke: vi.fn().mockReturnThis(), fill: vi.fn() },
    }) as unknown as FogToolHarness;
    return { tool, setSelection };
  }

  it('paints no fog on macOS', () => {
    runOn('mac');
    const { tool } = fogTool();

    tool.onPointerDown(ctrlPress());

    expect(tool.stroke.active).toBe(false);
  });

  it('paints fog on Windows and Linux as before', () => {
    runOn('windows');
    const { tool } = fogTool();

    tool.onPointerDown(ctrlPress());

    expect(tool.stroke.active).toBe(true);
  });

  it('opens a fog area\'s menu on macOS without selecting it', () => {
    runOn('mac');
    const { tool, setSelection } = fogTool();

    tool.handleViewportFogPointerDown('fog-1', ctrlPress());

    expect(openContextMenuGlobal).toHaveBeenCalledWith(expect.any(Array), { x: 520, y: 310 });
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('selects a fog area on Windows and Linux as before', () => {
    runOn('windows');
    const { tool, setSelection } = fogTool();

    tool.handleViewportFogPointerDown('fog-1', ctrlPress());

    expect(openContextMenuGlobal).not.toHaveBeenCalled();
    expect(setSelection).toHaveBeenCalledOnce();
  });
});

describe('Ctrl+click with the Laser tool, as the players are told of it', () => {
  function tapped(): { tap: PointerTap; down: (event: TapEvent) => void } {
    const listeners = new Map<string, (event: TapEvent) => void>();
    const viewport: TapViewport = {
      on: (event, listener) => void listeners.set(event, listener),
      off: (event) => void listeners.delete(event),
      toWorld: (point) => point,
      scale: { x: 1 },
    };
    const tap = new PointerTap(viewport, new EventTarget(), () => true, () => 0);
    return { tap, down: (event) => listeners.get('pointerdown')?.(event) };
  }
  const ctrlDown: TapEvent = { button: 0, ctrlKey: true, global: { x: 10, y: 0 } };

  it('draws no laser and counts as no press on macOS', () => {
    runOn('mac');
    const { tap, down } = tapped();

    down(ctrlDown);

    expect(tap.state().on).toBe(false);
    expect(tap.lastPress()).toBeNull();
  });

  it('draws the laser on Windows and Linux as before', () => {
    runOn('windows');
    const { tap, down } = tapped();

    down(ctrlDown);

    expect(tap.state().on).toBe(true);
    expect(tap.lastPress()?.serial).toBe(1);
  });
});
