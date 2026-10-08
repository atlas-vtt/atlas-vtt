import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { LocalPlayerSession, LocalPlayerView, PlayerCameraState } from '../../src/app/local-player-view';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { playerWindowStore } from '../../src/app/stores/playerWindowStore';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));
afterEach(() => { PlayerWindowService.getInstance()?.destroy(); vi.restoreAllMocks(); });

interface Harness {
  service: PlayerWindowService;
  source: PlayerFrameSource & { withPlayerSafeFrame: ReturnType<typeof vi.fn> };
  session: LocalPlayerSession;
  drawImage: ReturnType<typeof vi.fn>;
  setDmCamera(camera: PlayerCameraState): void;
  nextFrame(): void;
}

function setup(): Harness {
  let frame: FrameRequestCallback | null = null;
  const requestAnimationFrame = (callback: FrameRequestCallback): number => { frame = callback; return 1; };
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), drawImage } as never);
  const { app } = createInMemoryApp();
  const store = createStore(() => ({})) as StoreApi<ViewAtlasState>;
  const service = new PlayerWindowService(app, store, new SettingsService(app));
  const doc = document.implementation.createHTMLDocument();
  Object.defineProperty(doc, 'readyState', { value: 'complete' });
  Object.defineProperty(doc.body, 'win', { value: {
    document: doc, closed: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn(),
    requestAnimationFrame, cancelAnimationFrame: vi.fn(),
  } });
  let dmCamera: PlayerCameraState = { centerX: 0, centerY: 0, scale: 1 };
  const source = {
    canvas: createEl('canvas'),
    withPlayerSafeFrame: vi.fn((capture: () => void) => capture()),
    getCamera: (): PlayerCameraState => dmCamera,
    store,
  };
  const session: LocalPlayerSession = { tabId: 'scene-a', filePath: '', frozen: false };
  const view = {
    contentEl: doc.body,
    getState: (): LocalPlayerSession => ({ ...session }),
    updateSession: (state: Partial<LocalPlayerSession>): void => { Object.assign(session, state); },
  };
  service.attachToView(view as unknown as LocalPlayerView, source, { tabId: 'scene-a', filePath: 'scene-a.atlasmap' });
  return {
    service, source, session, drawImage,
    setDmCamera: (camera) => { dmCamera = camera; },
    nextFrame: () => frame?.(0),
  };
}

describe('player camera freeze', () => {
  it('keeps rendering the live scene through the camera players saw when frozen', () => {
    const { service, source, session, setDmCamera, nextFrame } = setup();
    setDmCamera({ centerX: 100, centerY: 200, scale: 1.5 });
    nextFrame();
    service.toggleCameraFreeze();
    expect(playerWindowStore.getState().isFrozen).toBe(true);
    expect(session).toMatchObject({ frozen: true, camera: { centerX: 100, centerY: 200, scale: 1.5 } });

    setDmCamera({ centerX: 900, centerY: 900, scale: 3 });
    source.withPlayerSafeFrame.mockClear();
    nextFrame();
    nextFrame();

    // Every frame is still rendered, so token moves and fog reveals reach players.
    expect(source.withPlayerSafeFrame).toHaveBeenCalledTimes(2);
    expect(source.withPlayerSafeFrame).toHaveBeenLastCalledWith(
      expect.any(Function), expect.anything(), { centerX: 100, centerY: 200, scale: 1.5 },
    );
    expect(session.camera).toEqual({ centerX: 100, centerY: 200, scale: 1.5 });

    service.toggleCameraFreeze();
    nextFrame();
    expect(source.withPlayerSafeFrame).toHaveBeenLastCalledWith(expect.any(Function), expect.anything(), undefined);
    expect(session).toMatchObject({ frozen: false, camera: { centerX: 900, centerY: 900, scale: 3 } });
  });

  it('holds a still frame while the DM is on another tab and returns to the frozen camera', () => {
    const { service, source, drawImage, setDmCamera, nextFrame } = setup();
    setDmCamera({ centerX: 10, centerY: 20, scale: 1 });
    nextFrame();
    service.toggleCameraFreeze();

    service.holdCurrentFrame();
    source.withPlayerSafeFrame.mockClear();
    drawImage.mockClear();
    nextFrame();
    nextFrame();
    expect(source.withPlayerSafeFrame).not.toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalledTimes(1);

    setDmCamera({ centerX: 500, centerY: 500, scale: 2 });
    service.releaseHeldFrame(source);
    nextFrame();
    expect(service.isFrozen()).toBe(true);
    expect(source.withPlayerSafeFrame).toHaveBeenLastCalledWith(
      expect.any(Function), expect.anything(), { centerX: 10, centerY: 20, scale: 1 },
    );
  });

  it('presenting a scene lifts the freeze', () => {
    const { service, source, nextFrame } = setup();
    nextFrame();
    service.toggleCameraFreeze();
    service.presentCanvas(source, 'scene-b');
    expect(service.isFrozen()).toBe(false);
    expect(playerWindowStore.getState().isFrozen).toBe(false);
  });
});
