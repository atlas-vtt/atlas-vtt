import { beforeEach, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import { PinRenderer } from '../../src/app/pixi/PinRenderer';
import { DrawingInteraction } from '../../src/app/pixi/DrawingInteraction';
import type { ViewAtlasState } from '../../src/app/storeFactory';

const openContextMenuGlobal = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal }));
vi.mock('../../src/app/addons/addonRegistry', () => ({ installedAddons: () => [] }));

/** A right press 300 px into the window from where it lies on the canvas, as beside an open sidebar. */
const rightPress = {
  button: 2, clientX: 520, clientY: 310, global: { x: 220, y: 270 },
} as unknown as FederatedPointerEvent;

beforeEach(() => openContextMenuGlobal.mockClear());

it('opens a pin\'s menu at the pointer in the window, not at its position on the canvas', () => {
  const pin = { id: 'pin-1', x: 10, y: 20, notePath: 'note.md' };
  const renderer = Object.assign(Object.create(PinRenderer.prototype) as PinRenderer, {
    store: { getState: () => ({ objects: { pins: { 'pin-1': pin } } }) },
  });

  renderer.handleViewportPinPointerDown('pin-1', rightPress);

  expect(openContextMenuGlobal).toHaveBeenCalledWith(expect.any(Array), { x: 520, y: 310 });
});

it('opens a drawing\'s menu at the pointer in the window, not at its position on the canvas', () => {
  const state = {
    isPlayerView: false,
    selectedIds: ['drawing-1'],
    objects: { drawings: { 'drawing-1': { id: 'drawing-1', type: 'freehand', color: '#ffffff' } } },
  };
  const store = { getState: () => state } as unknown as StoreApi<ViewAtlasState>;
  const interaction = new DrawingInteraction({} as Viewport, store);

  interaction.handleViewportPointerDown('drawing-1', rightPress);

  expect(openContextMenuGlobal).toHaveBeenCalledWith(expect.any(Array), { x: 520, y: 310 });
});
