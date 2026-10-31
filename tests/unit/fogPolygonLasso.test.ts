// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { FogPolygonLasso } from '../../src/app/pixi/fog/FogPolygonLasso';

function setup(): { canvas: HTMLCanvasElement; lasso: FogPolygonLasso; preview: ReturnType<typeof vi.fn>; complete: ReturnType<typeof vi.fn> } {
  const canvas = document.createElement('canvas');
  const preview = vi.fn();
  const complete = vi.fn();
  return { canvas, preview, complete, lasso: new FogPolygonLasso(canvas, preview, complete) };
}

const corners = [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 120 }];

describe('click-placed fog lasso', () => {
  it('previews the pointer without committing a corner, then closes at the first corner', () => {
    const { lasso, preview, complete } = setup();
    lasso.click(corners[0]!);
    lasso.move({ x: 600, y: 500 });
    expect(preview).toHaveBeenLastCalledWith([corners[0], { x: 600, y: 500 }]);
    lasso.click(corners[1]!);
    lasso.click(corners[2]!);
    expect(complete).not.toHaveBeenCalled();
    lasso.click(corners[0]!);
    expect(complete).toHaveBeenCalledExactlyOnceWith(corners);
    expect(preview).toHaveBeenLastCalledWith([]);
  });

  it.each(['contextmenu', 'dblclick'])('finishes with %s and removes its listeners', (type) => {
    const { canvas, lasso, complete } = setup();
    corners.forEach(point => lasso.click(point));
    const event = new MouseEvent(type, { button: type === 'contextmenu' ? 2 : 0, cancelable: true });
    canvas.dispatchEvent(event);
    expect(complete).toHaveBeenCalledExactlyOnceWith(corners);
    expect(event.defaultPrevented).toBe(true);
    canvas.dispatchEvent(new MouseEvent(type));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('reserves right clicks so object menus do not open while drawing', () => {
    const { canvas, lasso } = setup();
    lasso.click(corners[0]!);
    const objectMenu = vi.fn();
    canvas.addEventListener('pointerdown', objectMenu);
    const event = new MouseEvent('pointerdown', { button: 2, cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(objectMenu).not.toHaveBeenCalled();
    lasso.cancel();
    canvas.dispatchEvent(new MouseEvent('pointerdown', { button: 2 }));
    expect(objectMenu).toHaveBeenCalledOnce();
  });

  it('cancels with Escape and starts a fresh shape', () => {
    const { lasso, complete } = setup();
    corners.forEach(point => lasso.click(point));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(complete).toHaveBeenLastCalledWith(null);
    corners.forEach(point => lasso.click(point));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(complete).toHaveBeenLastCalledWith(corners);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('ignores duplicate corners and refuses to finish a line', () => {
    const { canvas, lasso, complete } = setup();
    lasso.click(corners[0]!);
    lasso.click(corners[0]!);
    lasso.click(corners[1]!);
    canvas.dispatchEvent(new MouseEvent('contextmenu', { button: 2 }));
    expect(complete).not.toHaveBeenCalled();
    lasso.click(corners[2]!);
    canvas.dispatchEvent(new MouseEvent('contextmenu', { button: 2 }));
    expect(complete).toHaveBeenCalledExactlyOnceWith(corners);
  });
});
