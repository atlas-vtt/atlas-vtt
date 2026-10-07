import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LaserPointerRenderer } from '../../src/app/pixi/LaserPointerRenderer';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

type Internals = { isPointing: boolean };

/** A renderer on a fake viewport (an event emitter) and a store that reports the laser tool as active. */
function makeRenderer(): {
  renderer: LaserPointerRenderer;
  canvas: HTMLCanvasElement;
  pressAt: (x: number, y: number) => void;
} {
  const viewport = Object.assign(new EventEmitter(), {
    scale: { x: 1 },
    toWorld: (point: { x: number; y: number }) => ({ x: point.x, y: point.y }),
  });
  // The active tool as the renderer reads it since #288: a read-only source.
  const activeTool = { get: () => 'laser-pointer', subscribe: () => (): void => undefined };
  const pixiApp = { renderer: { name: 'canvas' }, ticker: { add: vi.fn(), remove: vi.fn() } };
  const canvas = document.createElement('canvas');
  const renderer = new LaserPointerRenderer(
    viewport as never, pixiApp as never, activeTool as never, canvas, () => ({ color: '#ff0059', size: 16 }),
  );
  const pressAt = (x: number, y: number): void => {
    viewport.emit('pointerdown', { button: 0, global: { x, y }, stopPropagation: () => undefined });
  };
  return { renderer, canvas, pressAt };
}

let restoreGraphics: (() => void) | null = null;
afterEach(() => { restoreGraphics?.(); restoreGraphics = null; });

describe('laser pointer', () => {
  it('lets the laser go when the window loses focus mid-stroke', () => {
    restoreGraphics = stubJsdomGraphics();
    const { renderer, canvas, pressAt } = makeRenderer();
    pressAt(10, 10);
    expect((renderer as unknown as Internals).isPointing).toBe(true);
    canvas.ownerDocument.defaultView!.dispatchEvent(new Event('blur'));
    expect((renderer as unknown as Internals).isPointing).toBe(false);
    renderer.destroy();
  });

  it('stops listening for the window blur once destroyed', () => {
    restoreGraphics = stubJsdomGraphics();
    const { renderer, canvas } = makeRenderer();
    const view = canvas.ownerDocument.defaultView!;
    const remove = vi.spyOn(view, 'removeEventListener');
    renderer.destroy();
    expect(remove).toHaveBeenCalledWith('blur', expect.any(Function));
    remove.mockRestore();
  });

  it('hears the blur of the window the canvas moved into', () => {
    restoreGraphics = stubJsdomGraphics();
    const { renderer, canvas, pressAt } = makeRenderer();
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const popout = frame.contentDocument!;
    popout.body.appendChild(popout.adoptNode(canvas));
    pressAt(10, 10);
    popout.defaultView!.dispatchEvent(new Event('blur'));
    expect((renderer as unknown as Internals).isPointing).toBe(false);
    renderer.destroy();
    frame.remove();
  });
});
