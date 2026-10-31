// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { pickMapPoint, PICKING_POINT_CLASS } from '../../src/app/pixi/pickMapPoint';

function setup() {
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  document.body.appendChild(host);
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
  // Twice the screen offset, so a point that skipped the conversion shows
  const viewport = { toWorld: (x: number, y: number) => ({ x: x * 2, y: y * 2 }) };
  const onPick = vi.fn();
  const onEnd = vi.fn();
  const toolSaw = vi.fn();
  canvas.addEventListener('pointerdown', toolSaw);
  const cancel = pickMapPoint(canvas, viewport as never, onPick, onEnd);
  const press = (button = 0, target: Element = canvas): void => {
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button, clientX: 110, clientY: 70 }));
  };
  return { host, canvas, onPick, onEnd, toolSaw, cancel, press };
}

describe('picking a point on the map', () => {
  it('turns the next click into a world point the active tool never sees, then ends', () => {
    const { host, onPick, onEnd, toolSaw, press } = setup();
    expect(host.classList.contains(PICKING_POINT_CLASS)).toBe(true);
    press();
    expect(onPick).toHaveBeenCalledWith(200, 100);
    expect(toolSaw).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(host.classList.contains(PICKING_POINT_CLASS)).toBe(false);
    // Back to the tool
    press();
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(toolSaw).toHaveBeenCalledTimes(1);
  });

  it('is cancelled by Escape, a right click or the button, picking nothing', () => {
    for (const cancelBy of ['escape', 'right', 'button'] as const) {
      const { onPick, onEnd, cancel, press } = setup();
      if (cancelBy === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      if (cancelBy === 'right') press(2);
      if (cancelBy === 'button') cancel();
      cancel();
      expect(onPick).not.toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalledTimes(1);
    }
  });

  it('follows the pointer over the map in world units when asked to', () => {
    const host = document.body.appendChild(document.createElement('div'));
    const canvas = host.appendChild(document.createElement('canvas'));
    canvas.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
    const onMove = vi.fn();
    const toolSaw = vi.fn();
    canvas.addEventListener('pointermove', toolSaw);
    const cancel = pickMapPoint(canvas, { toWorld: (x: number, y: number) => ({ x: x * 2, y: y * 2 }) } as never, vi.fn(), vi.fn(), onMove);
    canvas.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 30, clientY: 40 }));
    expect(onMove).toHaveBeenCalledWith(40, 40);
    expect(toolSaw).toHaveBeenCalledTimes(1);
    cancel();
    canvas.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 30, clientY: 40 }));
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('leaves clicks on the panels over the map alone', () => {
    const { host, onPick, onEnd, press } = setup();
    const panel = host.appendChild(document.createElement('div'));
    press(0, panel);
    expect(onPick).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
