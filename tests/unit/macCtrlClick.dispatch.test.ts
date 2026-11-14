// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Point, type EventSystem, type FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { TokenRenderer } from '../../src/app/pixi/token-renderer';
import { isHandled, isHandledTap } from '../../src/app/pixi/utils/handledEvents';
import { setCtrlClickIsSecondary } from '../../src/app/pixi/utils/pointerButtons';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: vi.fn(),
  closeContextMenuGlobal: vi.fn(),
}));

type ViewStore = ReturnType<typeof createViewAtlasStore>;

/** A press at (120, 80) on an unzoomed viewport, where screen and world are one. */
const press = (button: number, ctrlKey: boolean): FederatedPointerEvent => ({
  button, ctrlKey, shiftKey: false, altKey: false, metaKey: false, pointerId: 1, pointerType: 'mouse',
  clientX: 420, clientY: 280, global: new Point(120, 80), stopPropagation: vi.fn(), preventDefault: vi.fn(),
}) as unknown as FederatedPointerEvent;
const ctrlClick = (): FederatedPointerEvent => press(0, true);
const rightPress = (): FederatedPointerEvent => press(2, false);

describe('a Ctrl+click on the map', () => {
  let renderer: TokenRenderer;
  let viewport: Viewport;
  let store: ViewStore;
  let restoreGraphics: () => void;
  let restorePlatform: () => void;

  const hexLinks = { hitTest: vi.fn((): string | null => null), hover: vi.fn(), press: vi.fn(), openContextMenu: vi.fn() };
  const doorMenu = { hitTest: vi.fn((): string | null => null), open: vi.fn() };
  const doorClick = vi.fn(() => false);
  const wallDown = vi.fn(() => true);
  const wallMenu = vi.fn();

  const runOn = (platform: 'mac' | 'windows'): void => { restorePlatform = setCtrlClickIsSecondary(platform === 'mac'); };

  beforeEach(() => {
    restoreGraphics = stubJsdomGraphics();
    restorePlatform = () => {};
    const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
    viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events });
    const { app } = createInMemoryApp();
    store = createViewAtlasStore(app, `ctrl-click-dispatch-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.setState({ activeTool: 'select', isGMView: true });
    const grid = { getOptions: () => ({ type: 'square', size: 70, offsetX: 0, offsetY: 0 }) } as unknown as GridSystem;
    renderer = new TokenRenderer(app, viewport, grid, () => {}, store, new EventEmitter(), 'ctrl-click-dispatch');
    renderer.setHexLinkHandlers(hexLinks);
    renderer.setDoorMenuHandlers(doorMenu);
    renderer.setDoorClickHandler(doorClick);
    renderer.setWallPointerDownHandler(wallDown);
    renderer.setWallContextMenuHandler(wallMenu);
  });

  afterEach(() => {
    renderer.destroy();
    viewport.destroy();
    restoreGraphics();
    restorePlatform();
    vi.clearAllMocks();
    hexLinks.hitTest.mockReturnValue(null);
    doorMenu.hitTest.mockReturnValue(null);
  });

  it('opens a linked hex\'s menu on macOS, at once, and does not open its note', () => {
    runOn('mac');
    hexLinks.hitTest.mockReturnValue('hex-1');

    viewport.emit('pointerdown', ctrlClick());

    expect(hexLinks.openContextMenu).toHaveBeenCalledOnce();
    expect(hexLinks.openContextMenu.mock.calls[0]![0]).toBe('hex-1');
    expect(hexLinks.press).not.toHaveBeenCalled();
  });

  it('stays a click on the linked hex on Windows and Linux', () => {
    runOn('windows');
    hexLinks.hitTest.mockReturnValue('hex-1');

    viewport.emit('pointerdown', ctrlClick());

    expect(hexLinks.press).toHaveBeenCalledOnce();
    expect(hexLinks.openContextMenu).not.toHaveBeenCalled();
  });

  it('opens a door\'s menu on macOS and leaves the door as it is', () => {
    runOn('mac');
    doorMenu.hitTest.mockReturnValue('door-1');

    viewport.emit('pointerdown', ctrlClick());

    expect(doorMenu.open).toHaveBeenCalledWith('door-1', 420, 280);
    expect(doorClick).not.toHaveBeenCalled();
  });

  it('opens the wall tool\'s menu on macOS and places no wall point', () => {
    runOn('mac');
    store.setState({ activeTool: 'wall' });

    viewport.emit('pointerdown', ctrlClick());

    expect(wallMenu).toHaveBeenCalledWith(120, 80, 420, 280);
    expect(wallDown).not.toHaveBeenCalled();
  });

  it('stays the wall tool\'s own click on Windows and Linux', () => {
    runOn('windows');
    store.setState({ activeTool: 'wall' });

    viewport.emit('pointerdown', ctrlClick());

    expect(wallDown).toHaveBeenCalledOnce();
    expect(wallMenu).not.toHaveBeenCalled();
  });

  it('keeps the selection on macOS where a click on the empty map clears it', () => {
    store.setState({ activeTool: 'move', selectedIds: ['a'] });
    runOn('mac');

    viewport.emit('pointerdown', ctrlClick());
    expect(store.getState().selectedIds).toEqual(['a']);

    restorePlatform();
    runOn('windows');
    viewport.emit('pointerdown', ctrlClick());
    expect(store.getState().selectedIds).toEqual([]);
  });

  it('is no tool\'s press or tap on macOS, whichever of Ctrl and the button is let go first', () => {
    runOn('mac');
    const down = ctrlClick();

    viewport.emit('pointerdown', down);

    expect(isHandled(down)).toBe(true);
    expect(isHandledTap(press(0, false))).toBe(true);
  });

  it('leaves a press of the right button to the pan: its menu still waits for a release in place', () => {
    runOn('mac');
    hexLinks.hitTest.mockReturnValue('hex-1');
    const down = rightPress();

    viewport.emit('pointerdown', down);
    expect(hexLinks.openContextMenu).not.toHaveBeenCalled();
    expect(isHandled(down)).toBe(false);

    viewport.emit('pointerup', rightPress());
    expect(hexLinks.openContextMenu).toHaveBeenCalledOnce();
  });
});
