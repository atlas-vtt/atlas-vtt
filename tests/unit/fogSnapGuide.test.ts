// @vitest-environment jsdom
import { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { expect, it, vi } from 'vitest';
import { FogSnapGuide } from '../../src/app/pixi/fog/FogSnapGuide';

function guide(): { camera: Container; snap: FogSnapGuide; drawn: ReturnType<typeof vi.spyOn> } {
  const camera = new Container();
  const snap = new FogSnapGuide(camera as unknown as Viewport, () => 0x7755ff);
  return { camera, snap, drawn: vi.spyOn(snap.view, 'clear') };
}

it('shows a ring round the place a point snapped to, and nothing for a point that did not snap', () => {
  const { snap } = guide();
  expect(snap.view.visible).toBe(false);
  snap.show({ point: { x: 70, y: 140 } });
  expect(snap.view.visible).toBe(true);
  expect(snap.view.position).toMatchObject({ x: 70, y: 140 });
  // A ring of five pixels' radius, with its dark casing: large enough to notice.
  expect(snap.view.getLocalBounds().width).toBeCloseTo(14.5, 5);
  snap.show(null);
  expect(snap.view.visible).toBe(false);
  snap.destroy();
});

it('is moved, not drawn anew, while the pointer goes from one point of the grid to the next', () => {
  const { snap, drawn } = guide();
  snap.show({ point: { x: 0, y: 0 } });
  expect(drawn).toHaveBeenCalledTimes(1);
  snap.show({ point: { x: 70, y: 0 } });
  snap.show({ point: { x: 70, y: 70 } });
  expect(drawn).toHaveBeenCalledTimes(1);
  expect(snap.view.position).toMatchObject({ x: 70, y: 70 });
  snap.destroy();
});

it('draws the line a point lies on, from end to end', () => {
  const { snap, drawn } = guide();
  snap.show({ point: { x: 180, y: 97 }, from: { x: 104, y: 97 }, to: { x: 304, y: 97 } });
  expect(drawn).toHaveBeenCalledTimes(1);
  const bounds = snap.view.getBounds();
  expect(bounds.minX).toBeLessThanOrEqual(104);
  expect(bounds.maxX).toBeGreaterThanOrEqual(304);
  // Back on a place without a line: only the ring is left.
  snap.show({ point: { x: 104, y: 97 } });
  expect(drawn).toHaveBeenCalledTimes(2);
  expect(snap.view.getLocalBounds().width).toBeCloseTo(14.5, 5);
  snap.destroy();
});

it('keeps its size on screen when the map is zoomed, and follows no zoom once it is gone', () => {
  const { camera, snap, drawn } = guide();
  snap.show({ point: { x: 10, y: 10 } });
  camera.scale.set(2);
  camera.emit('zoomed', {});
  expect(drawn).toHaveBeenCalledTimes(2);
  // Half the size on the map is the same size on screen.
  expect(snap.view.getLocalBounds().width).toBeCloseTo(7.25, 5);
  // Hidden, a zoom draws nothing: the next place shown is drawn for the zoom there is then.
  snap.show(null);
  camera.scale.set(4);
  camera.emit('zoomed', {});
  expect(drawn).toHaveBeenCalledTimes(2);
  snap.show({ point: { x: 10, y: 10 } });
  expect(drawn).toHaveBeenCalledTimes(3);
  snap.destroy();
  camera.emit('zoomed', {});
  expect(drawn).toHaveBeenCalledTimes(3);
});
