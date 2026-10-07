import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { LocalPlayerSession, LocalPlayerView } from '../../src/app/local-player-view';
import type { PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { playerWindowStore, resetPlayerWindowStore } from '../../src/app/stores/playerWindowStore';
import type { PlayerFrame } from '../../src/app/types/playerFrame';
import type { ViewportRect } from '../../src/app/types/viewportTypes';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { framePiece, frameSource, PLAYER_WINDOW, sizePlayerWindow } from '../mocks/playerFrameSource';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));
afterEach(() => { PlayerWindowService.getInstance()?.destroy(); resetPlayerWindowStore(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const rect = (overrides: Partial<ViewportRect> = {}): ViewportRect =>
  ({ id: 'tv', kind: 'viewport', x: 100, y: 200, width: 400, height: 300, locked: true, active: true, ...overrides });

function setup(viewports: Record<string, ViewportRect>) {
  let frame: FrameRequestCallback | null = null;
  const requestAnimationFrame = (callback: FrameRequestCallback): number => { frame = callback; return 1; };
  sizePlayerWindow();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), drawImage: vi.fn() } as never);
  const { app } = createInMemoryApp();
  const setFollowViewport = vi.fn();
  const store = createStore(() => ({ objects: { viewports }, setFollowViewport })) as unknown as StoreApi<ViewAtlasState>;
  const service = new PlayerWindowService(app, store, new SettingsService(app));
  const doc = document.implementation.createHTMLDocument();
  Object.defineProperty(doc, 'readyState', { value: 'complete' });
  Object.defineProperty(doc.body, 'win', { value: {
    document: doc, closed: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn(),
    requestAnimationFrame, cancelAnimationFrame: vi.fn(),
  } });
  const capture = vi.fn<PlayerFrameSource['withPlayerSafeFrame']>((copy, _settings, frame) => copy(framePiece(frame)));
  const source = frameSource({ withPlayerSafeFrame: capture, store });
  const session: LocalPlayerSession = { tabId: 'scene-a', filePath: '', frozen: false };
  const view = {
    contentEl: doc.body,
    getState: (): LocalPlayerSession => ({ ...session }),
    updateSession: (state: Partial<LocalPlayerSession>): void => { Object.assign(session, state); },
  };
  service.attachToView(view as unknown as LocalPlayerView, source, 'scene-a');
  const lastFrame = (): PlayerFrame | undefined => capture.mock.calls.at(-1)?.[2];
  return { service, setFollowViewport, lastFrame, nextFrame: (): void => frame?.(0) };
}

/** What the players' frame shows of the world, in world units: the window's size over the frame's scale. */
const shown = (frame: PlayerFrame): { width: number; height: number } => ({ width: PLAYER_WINDOW.width / frame.scale, height: PLAYER_WINDOW.height / frame.scale });

describe('following the TV viewport', () => {
  it('shows players the active rectangle, centred and whole, whatever shape the DM\'s pane has', () => {
    const { service, setFollowViewport, lastFrame, nextFrame } = setup({ tv: rect() });
    expect(service.toggleViewportFollow()).toBe(true);
    nextFrame();

    const frame = lastFrame()!;
    expect([frame.centerX, frame.centerY]).toEqual([300, 350]);
    // The 4:3 rectangle fills the 16:9 window's height; the window shows map beside it, never less than the rectangle
    expect(shown(frame).height).toBeCloseTo(300);
    expect(shown(frame).width).toBeGreaterThanOrEqual(400);
    expect(setFollowViewport).toHaveBeenCalledWith(true);
    expect(playerWindowStore.getState().isFollowingViewport).toBe(true);
  });

  it('goes back to the DM\'s camera when toggled off', () => {
    const { service, setFollowViewport, lastFrame, nextFrame } = setup({ tv: rect() });
    service.toggleViewportFollow();
    service.toggleViewportFollow();
    nextFrame();
    expect([lastFrame()!.centerX, lastFrame()!.centerY]).toEqual([0, 0]);
    expect(setFollowViewport).toHaveBeenLastCalledWith(false);
    expect(playerWindowStore.getState().isFollowingViewport).toBe(false);
  });

  it('follows the rectangle rather than a frozen camera', () => {
    const { service, lastFrame, nextFrame } = setup({ tv: rect() });
    service.freezeCamera({ centerX: 9, centerY: 9, scale: 9 });
    service.toggleViewportFollow();
    nextFrame();
    expect([lastFrame()!.centerX, lastFrame()!.centerY]).toEqual([300, 350]);
  });

  it('keeps the frozen camera when there is no active rectangle to follow', () => {
    const { service, lastFrame, nextFrame } = setup({ tv: rect({ active: false }) });
    service.freezeCamera({ centerX: 9, centerY: 9, scale: 9 });
    service.toggleViewportFollow();
    nextFrame();
    expect([lastFrame()!.centerX, lastFrame()!.centerY]).toEqual([9, 9]);
  });

  it('follows only the active rectangle among several', () => {
    const { service, lastFrame, nextFrame } = setup({ a: rect({ id: 'a', active: false }), b: rect({ id: 'b', x: 0, y: 0, width: 100, height: 100 }) });
    service.toggleViewportFollow();
    nextFrame();
    expect([lastFrame()!.centerX, lastFrame()!.centerY]).toEqual([50, 50]);
  });
});
