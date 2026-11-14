// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import { PinRenderer } from '../../src/app/pixi/PinRenderer';
import { drawScene } from '../helpers/drawScene';

const openContextMenuGlobal = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal }));

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
  const scene = drawScene();
  const id = scene.store.getState().addDrawing({ type: 'pen', points: [{ x: 200, y: 270 }, { x: 260, y: 270 }], color: '#ffffff', width: 4, opacity: 1 });
  scene.store.getState().setActiveTool('move');

  expect(scene.renderer.selecting.pointer.menuAt(220, 270)).toBe(true);
  expect(scene.store.getState().selectedIds).toEqual([]);
  expect(scene.renderer.selecting.pointer.openMenu(220, 270, rightPress)).toBe(true);

  expect(scene.store.getState().selectedIds).toEqual([id]);
  expect(openContextMenuGlobal).toHaveBeenCalledWith(expect.any(Array), { x: 520, y: 310 });
  scene.destroy();
});
