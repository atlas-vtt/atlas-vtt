import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { BeforeRenderCapture, PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));

const app = {
  vault: { adapter: { exists: async () => true, write: async () => {} } },
  workspace: { on: vi.fn(() => ({})), offref: vi.fn() },
} as any;
afterEach(() => { PlayerWindowService.getInstance()?.destroy(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

interface ScheduledRenders {
  requestRender: ReturnType<typeof vi.fn>;
  capture: ReturnType<typeof vi.fn>;
  stopListening: ReturnType<typeof vi.fn>;
  /** The DM canvas is about to render. */
  render(): void;
}

/** What a canvas that renders on change offers the mirror; `render` plays one of its renders. */
function scheduledRenders(): ScheduledRenders & { beforeRender: BeforeRenderCapture } {
  let listener: ((frameTime: number) => void) | null = null;
  const stopListening = vi.fn(() => { listener = null; });
  const requestRender = vi.fn();
  const capture = vi.fn((draw: () => void) => draw());
  return {
    requestRender, capture, stopListening,
    render: () => listener?.(performance.now()),
    beforeRender: {
      listen: (next) => { listener = next; return stopListening; },
      requestRender,
      withPlayerSafeFrame: capture,
    },
  };
}

/** A service mirroring into a fake popout; `nextFrame` runs the popout's pending animation frame. */
function mirror(renders?: ScheduledRenders & { beforeRender: BeforeRenderCapture }): {
  capture: ReturnType<typeof vi.fn>; nextFrame: () => void; settings: SettingsService; service: PlayerWindowService;
} {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const settings = new SettingsService(app);
  const service = new PlayerWindowService(app, createStore(() => ({})) as any, settings);
  const doc = document.implementation.createHTMLDocument();
  // setupPlayerWindow creates the target canvas; jsdom has no 2D context
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), drawImage: vi.fn() } as any);
  Object.defineProperty(doc, 'readyState', { value: 'complete' });
  (service as any).playerWindow = {
    document: doc, closed: false, requestAnimationFrame, cancelAnimationFrame,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn(),
  };
  const capture = vi.fn();
  const source: PlayerFrameSource = {
    canvas: document.createElement('canvas'), withPlayerSafeFrame: capture, ...(renders ? { beforeRender: renders.beforeRender } : {}),
  };
  (service as any).streamSource = source;
  (service as any).setupPlayerWindow();
  const nextFrame = (): void => vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](0);
  return { capture, nextFrame, settings, service };
}

describe('player window mirroring', () => {
  it('captures a canvas that renders on change right before its renders, never with renders of its own', () => {
    const renders = scheduledRenders();
    const { capture, nextFrame } = mirror(renders);
    expect(renders.requestRender).toHaveBeenCalledTimes(1);

    renders.render();
    expect(renders.capture).toHaveBeenCalledTimes(1);

    renders.requestRender.mockClear();
    nextFrame();
    nextFrame();
    expect(renders.requestRender).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it('asks for a render when player view settings change, even without a new DM frame', () => {
    const renders = scheduledRenders();
    const { nextFrame, settings } = mirror(renders);
    renders.render();
    renders.requestRender.mockClear();
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 100);

    settings.setLocalPlayerViewSettings({ showWidgets: false });
    nextFrame();

    expect(renders.requestRender).toHaveBeenCalled();
  });

  it('copies again when a collection changes what players see, even without a new DM frame', () => {
    const { capture, nextFrame } = mirror(() => 1);
    capture.mockClear();

    // The app is shared by every test here: the last registration belongs to this service
    const [, changed] = app.workspace.on.mock.calls.findLast(([name]: [string]) => name === 'atlas-vtt:collection-settings-changed');
    changed('Cairn');
    nextFrame();

    expect(capture).toHaveBeenCalled();
  });

  it('drops a closing view but keeps showing its last frame', () => {
    const renders = scheduledRenders();
    const { nextFrame, service } = mirror(renders);
    renders.render();
    const source = (service as any).streamSource;
    source.store = createStore(() => ({}));

    service.releaseSource(source.store);
    // At once: a hidden window has no next frame, and the closing view must not stay referenced
    expect(renders.stopListening).toHaveBeenCalledTimes(1);
    nextFrame();
    renders.render();

    expect((service as any).streamSource.store).toBeUndefined();
    expect(service.isWindowOpen()).toBe(true);
    expect(renders.capture).toHaveBeenCalledTimes(1);
  });

  it.each(['presentCanvas', 'releaseHeldFrame'] as const)('lets go of the previous canvas at once on %s', (swap) => {
    const previous = scheduledRenders();
    const next = scheduledRenders();
    const { service } = mirror(previous);
    previous.render();
    const source: PlayerFrameSource = { canvas: document.createElement('canvas'), withPlayerSafeFrame: vi.fn(), beforeRender: next.beforeRender };

    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 100);
    // No frame of the player window in between: it may be hidden
    if (swap === 'presentCanvas') service.presentCanvas(source, 'scene-b');
    else service.releaseHeldFrame(source);

    expect(previous.stopListening).toHaveBeenCalledTimes(1);
    next.render();
    expect(next.capture).toHaveBeenCalledTimes(1);
  });

  it('stops listening to the DM canvas when the window closes', () => {
    const renders = scheduledRenders();
    const { service } = mirror(renders);

    service.destroy();

    expect(renders.stopListening).toHaveBeenCalledTimes(1);
  });

  it('copies every frame for sources without a render schedule', () => {
    const { capture, nextFrame } = mirror();
    nextFrame();
    nextFrame();
    expect(capture).toHaveBeenCalledTimes(3);
  });
});
