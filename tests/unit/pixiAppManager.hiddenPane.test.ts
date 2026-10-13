import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rectangle, Ticker, type Application, type ApplicationOptions } from 'pixi.js';
import { PixiAppManager } from '../../src/app/pixi/PixiAppManager';

vi.mock('obsidian', () => ({ Notice: class {} }));

/** What `Application.init` leaves on the app, as far as `PixiAppManager` reads it. */
function startRenderer(app: Application, options: Partial<ApplicationOptions>): ReturnType<typeof vi.fn> {
  const ticker = new Ticker();
  ticker.autoStart = false;
  const resize = vi.fn();
  Object.assign(app, {
    ticker,
    render: vi.fn(),
    renderer: {
      name: 'webgl',
      canvas: options.canvas,
      screen: new Rectangle(0, 0, options.width, options.height),
      events: { domElement: options.canvas },
      runners: { contextChange: { add: vi.fn(), remove: vi.fn() } },
      render: vi.fn(),
      resize,
    },
  });
  return resize;
}

describe('PixiAppManager.resize', () => {
  let manager: PixiAppManager;
  let resizeRenderer: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ getExtension: (): null => null } as never);
    manager = new PixiAppManager(800, 600);
    manager.app.init = (options: Partial<ApplicationOptions> = {}): Promise<void> => {
      resizeRenderer = startRenderer(manager.app, options);
      return Promise.resolve();
    };
    await manager.init(document.createElement('div'));
  });

  afterEach(() => {
    manager.getApp().ticker?.stop();
    vi.restoreAllMocks();
  });

  /** What the screen shows: the world point in its middle and the size of the world rectangle. */
  function view(): { centerX: number; centerY: number; width: number; height: number } {
    const viewport = manager.getViewport()!;
    return { centerX: viewport.center.x, centerY: viewport.center.y, width: viewport.screenWidth / viewport.scale.x, height: viewport.screenHeight / viewport.scale.y };
  }

  it('leaves what the screen shows as it is when the pane is hidden: players are still shown it', () => {
    const viewport = manager.getViewport()!;
    viewport.setZoom(2);
    viewport.moveCenter(1000, 500);
    const shown = view();
    expect(shown).toEqual({ centerX: 1000, centerY: 500, width: 400, height: 300 });

    // What a pane measures while another Obsidian tab covers it (`display: none`)
    manager.resize(0, 0);

    expect(view()).toEqual(shown);
    expect(resizeRenderer).not.toHaveBeenCalled();
  });

  it.each([
    ['narrower, as when a sidebar opens', 500, 600],
    ['wider', 1300, 600],
    ['lower', 800, 250],
    ['another shape altogether', 333, 911],
  ])('keeps the centre of the view when the pane becomes %s', (_name, width, height) => {
    const viewport = manager.getViewport()!;
    viewport.setZoom(0.5);
    viewport.moveCenter(1234, 567);

    manager.resize(width, height);

    expect(viewport.center.x).toBeCloseTo(1234, 6);
    expect(viewport.center.y).toBeCloseTo(567, 6);
    expect(viewport.scale.x).toBe(0.5);
    // The view loses or gains the same on both sides
    expect(viewport.left).toBeCloseTo(1234 - width, 6);
    expect(viewport.right).toBeCloseTo(1234 + width, 6);
  });

  it('tells what follows the camera that it moved, once per change of size', () => {
    const viewport = manager.getViewport()!;
    const moved = vi.fn();
    viewport.on('moved', moved);

    manager.resize(500, 600);
    expect(moved).toHaveBeenCalledTimes(1);
    manager.resize(500, 600);
    manager.resize(0, 0);
    expect(moved).toHaveBeenCalledTimes(1);
  });

  it('comes back to the same view when the pane takes its old size again', () => {
    const viewport = manager.getViewport()!;
    viewport.moveCenter(300, 200);
    const corner = { x: viewport.left, y: viewport.top };

    manager.resize(450, 600);
    manager.resize(800, 600);

    expect({ x: viewport.left, y: viewport.top }).toEqual(corner);
  });

  it('keeps the size of the screen while one side of the pane is gone', () => {
    manager.resize(0, 600);
    manager.resize(800, 0);

    const viewport = manager.getViewport()!;
    expect([viewport.screenWidth, viewport.screenHeight]).toEqual([800, 600]);
    expect(manager.getCanvasElement().style.width).toBe('800px');
  });

  it('draws the picture again in the same task, before the browser paints the cleared canvas', () => {
    const render = vi.mocked(manager.app.render);
    render.mockClear();

    manager.resize(1000, 700);

    expect(render).toHaveBeenCalledTimes(1);
    expect(resizeRenderer.mock.invocationCallOrder[0]).toBeLessThan(render.mock.invocationCallOrder[0]!);
  });

  it('leaves the frame a load holds alone: with the ticker stopped the render waits for it', () => {
    const render = vi.mocked(manager.app.render);
    manager.getApp().ticker.stop();
    render.mockClear();

    manager.resize(1000, 700);

    expect(render).not.toHaveBeenCalled();
  });

  it('follows a pane that changes size', () => {
    manager.resize(1000, 700);

    const viewport = manager.getViewport()!;
    expect([viewport.screenWidth, viewport.screenHeight]).toEqual([1000, 700]);
    expect(resizeRenderer).toHaveBeenCalledWith(1000, 700);
    expect(manager.getCanvasElement().style.width).toBe('1000px');
  });
});
