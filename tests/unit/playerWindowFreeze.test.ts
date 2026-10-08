import { afterEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { LocalPlayerSession, LocalPlayerView, PlayerCameraState } from '../../src/app/local-player-view';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { playerWindowStore } from '../../src/app/stores/playerWindowStore';
import type { PlayerFrame, Screen } from '../../src/app/types/playerFrame';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { framePiece, sizePlayerWindow } from '../mocks/playerFrameSource';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));
vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
afterEach(() => { PlayerWindowService.getInstance()?.destroy(); vi.restoreAllMocks(); vi.mocked(Notice).mockClear(); });

interface Harness {
  service: PlayerWindowService;
  source: PlayerFrameSource & { withPlayerSafeFrame: ReturnType<typeof vi.fn<PlayerFrameSource['withPlayerSafeFrame']>> };
  session: LocalPlayerSession;
  drawImage: ReturnType<typeof vi.fn>;
  setDmCamera(camera: PlayerCameraState): void;
  /** The DM's pane takes this size, as when a sidebar opens. */
  resizePane(width: number, height: number): void;
  nextFrame(): void;
  /** The frame rendered last. */
  lastFrame(): PlayerFrame;
  /** Attaches the player window; a harness made with `attach: false` has not yet. */
  attach(): void;
}

/** The world rectangle a frame shows: left, top, width, height. */
function shown(frame: PlayerFrame): number[] {
  const width = frame.width / frame.resolution / frame.scale;
  const height = frame.height / frame.resolution / frame.scale;
  return [frame.centerX - width / 2, frame.centerY - height / 2, width, height].map((value) => Math.round(value * 1e6) / 1e6);
}

/** A player window of 1280 × 720 on a view whose pane measures 800 × 600. */
function setup({ attach: attachNow = true } = {}): Harness {
  let frame: FrameRequestCallback | null = null;
  const requestAnimationFrame = (callback: FrameRequestCallback): number => { frame = callback; return 1; };
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), drawImage } as never);
  sizePlayerWindow();
  const { app } = createInMemoryApp();
  const store = createStore(() => ({})) as StoreApi<ViewAtlasState>;
  const service = new PlayerWindowService(app, store, new SettingsService(app));
  const doc = document.implementation.createHTMLDocument();
  Object.defineProperty(doc, 'readyState', { value: 'complete' });
  Object.defineProperty(doc.body, 'win', { value: {
    document: doc, closed: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn(),
    requestAnimationFrame, cancelAnimationFrame: vi.fn(), devicePixelRatio: 1,
  } });
  let dmCamera: PlayerCameraState = { centerX: 0, centerY: 0, scale: 1 };
  let pane: Screen = { width: 800, height: 600, resolution: 1 };
  const source = {
    withPlayerSafeFrame: vi.fn<PlayerFrameSource['withPlayerSafeFrame']>((copy, _settings, rendered) => copy(framePiece(rendered))),
    getCamera: (): PlayerCameraState => ({ ...dmCamera, width: pane.width / dmCamera.scale, height: pane.height / dmCamera.scale }),
    getScreen: (): Screen => pane,
    store,
  };
  const session: LocalPlayerSession = { tabId: 'scene-a', filePath: '', frozen: false };
  const view = {
    contentEl: doc.body,
    getState: (): LocalPlayerSession => ({ ...session }),
    updateSession: (state: Partial<LocalPlayerSession>): void => { Object.assign(session, state); },
  };
  const attach = (): void => service.attachToView(view as unknown as LocalPlayerView, source, { tabId: 'scene-a', filePath: 'scene-a.atlasmap' });
  if (attachNow) attach();
  return {
    service, source, session, drawImage, attach,
    setDmCamera: (camera) => { dmCamera = camera; },
    resizePane: (width, height) => { pane = { width, height, resolution: 1 }; },
    nextFrame: () => frame?.(0),
    lastFrame: () => source.withPlayerSafeFrame.mock.lastCall![2],
  };
}

const NOTHING_TO_FREEZE = 'Players are not shown this scene yet, so there is nothing to freeze';

describe('player camera freeze', () => {
  it('keeps rendering the live scene through the camera players saw when frozen', () => {
    const { service, source, session, setDmCamera, nextFrame, lastFrame } = setup();
    setDmCamera({ centerX: 100, centerY: 200, scale: 2 });
    nextFrame();
    const before = shown(lastFrame());
    service.toggleCameraFreeze();
    expect(playerWindowStore.getState().isFrozen).toBe(true);
    // With the world rectangle the pane showed: 800 × 600 at a scale of 2
    expect(session).toMatchObject({ frozen: true, camera: { centerX: 100, centerY: 200, scale: 2, width: 400, height: 300 } });

    setDmCamera({ centerX: 900, centerY: 900, scale: 3 });
    source.withPlayerSafeFrame.mockClear();
    nextFrame();
    nextFrame();

    // Every frame is still rendered, so token moves and fog reveals reach players.
    expect(source.withPlayerSafeFrame).toHaveBeenCalledTimes(2);
    expect(shown(lastFrame())).toEqual(before);
    expect(session.camera).toEqual({ centerX: 100, centerY: 200, scale: 2, width: 400, height: 300 });

    service.toggleCameraFreeze();
    nextFrame();
    expect(lastFrame()).toMatchObject({ centerX: 900, centerY: 900 });
    expect(session).toMatchObject({ frozen: false, camera: { centerX: 900, centerY: 900, scale: 3 } });
  });

  it('keeps frozen players on the same picture when the DM\'s pane changes size', () => {
    const { service, resizePane, nextFrame, lastFrame } = setup();
    nextFrame();
    service.toggleCameraFreeze();
    nextFrame();
    const frozen = lastFrame();

    for (const [width, height] of [[500, 600], [1400, 300], [800, 900]] as const) {
      resizePane(width, height);
      nextFrame();
      expect(lastFrame()).toEqual(frozen);
    }
  });

  it('follows the pane while players are not frozen: they are shown all the pane shows', () => {
    const { resizePane, nextFrame, lastFrame } = setup();
    nextFrame();
    expect(shown(lastFrame())[3]).toBe(600);
    resizePane(800, 300);
    nextFrame();
    // The window is 16:9: now the pane's width fills it
    expect(shown(lastFrame())[2]).toBe(800);
  });

  it('holds a still frame while the DM is on another tab and returns to the frozen camera', () => {
    const { service, source, drawImage, setDmCamera, nextFrame, lastFrame } = setup();
    setDmCamera({ centerX: 10, centerY: 20, scale: 1 });
    nextFrame();
    service.toggleCameraFreeze();
    nextFrame();
    const frozen = lastFrame();

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
    expect(lastFrame()).toEqual(frozen);
  });

  it('gives a frozen camera an older Atlas saved the rectangle the pane shows when the window comes back, and keeps it', () => {
    const { service, session, attach, resizePane, nextFrame, lastFrame } = setup({ attach: false });
    // As the presenter restores a frozen window: frozen first, then attached
    service.freezeCamera({ centerX: 300, centerY: 400, scale: 2 });
    attach();
    expect(session.camera).toEqual({ centerX: 300, centerY: 400, scale: 2, width: 400, height: 300 });
    nextFrame();
    const frozen = lastFrame();
    expect(shown(frozen)).toEqual([300 - 300 * 1280 / 720 / 2, 250, 300 * 1280 / 720, 300].map((value) => Math.round(value * 1e6) / 1e6));

    resizePane(500, 900);
    nextFrame();
    expect(lastFrame()).toEqual(frozen);
  });

  describe('on the scene players are shown, never on another one\'s rectangle', () => {
    /** Another scene's view, still loading: its own store, camera and pane. `loaded` ends the load. */
    function otherScene(camera: PlayerCameraState): Harness['source'] & { loaded(): void } {
      const store = createStore(() => ({ isMapLoading: true }));
      return {
        store: store as unknown as StoreApi<ViewAtlasState>,
        withPlayerSafeFrame: vi.fn<PlayerFrameSource['withPlayerSafeFrame']>((copy, _settings, rendered) => copy(framePiece(rendered))),
        getCamera: (): PlayerCameraState => ({ ...camera, width: 800 / camera.scale, height: 600 / camera.scale }),
        getScreen: (): Screen => ({ width: 800, height: 600, resolution: 1 }),
        loaded: () => store.setState({ isMapLoading: false }),
      };
    }

    it('does not freeze players on the rectangle they saw of the scene before, nor on a camera read while the new scene loads', () => {
      const { service, session, setDmCamera, nextFrame } = setup();
      // Zoomed far out on the first scene: a rectangle much larger than the next scene's view
      setDmCamera({ centerX: 5000, centerY: 5000, scale: 0.1 });
      nextFrame();
      expect(session.camera).toMatchObject({ centerX: 5000, width: 8000 });

      const next = otherScene({ centerX: 300, centerY: 200, scale: 2 });
      service.presentCanvas(next, 'scene-b');
      // Nothing of the new scene was shown yet: it still loads
      expect(next.withPlayerSafeFrame).not.toHaveBeenCalled();
      // The rectangle of the scene before is not kept for the new one
      expect(session.camera).toBeNull();
      // And while it loads the view's camera is not the scene's yet: there is nothing to freeze on, and the DM is told so
      vi.mocked(Notice).mockClear();
      expect(service.toggleCameraFreeze()).toBe(false);
      expect(service.isFrozen()).toBe(false);
      expect(vi.mocked(Notice).mock.calls).toEqual([[NOTHING_TO_FREEZE]]);

      next.loaded();
      nextFrame();
      const frame = next.withPlayerSafeFrame.mock.lastCall![2];
      expect(frame).toMatchObject({ centerX: 300, centerY: 200 });
      expect(shown(frame)[3]).toBe(300);

      // Once players were shown the scene, they are frozen on what they saw of it
      vi.mocked(Notice).mockClear();
      service.toggleCameraFreeze();
      expect(session.camera).toMatchObject({ centerX: 300, centerY: 200, width: 400, height: 300 });
      expect(vi.mocked(Notice).mock.calls).toEqual([['Player view camera frozen']]);
      service.toggleCameraFreeze();
      expect(vi.mocked(Notice).mock.calls.at(-1)).toEqual(['Player view camera unfrozen']);
    });

    it('freezes players on the new scene\'s own view when it is frozen before its first frame comes', () => {
      const { service, nextFrame } = setup();
      nextFrame();
      const next = otherScene({ centerX: 300, centerY: 200, scale: 2 });
      next.loaded();
      // Presented and frozen in one go, as from a view that renders on change: its frame comes with the next render
      const frames = next.withPlayerSafeFrame;
      next.withPlayerSafeFrame = vi.fn();
      service.presentCanvas(next, 'scene-b');
      service.toggleCameraFreeze();
      expect(service.isFrozen()).toBe(true);
      next.withPlayerSafeFrame = frames;
      nextFrame();
      expect(frames.mock.lastCall![2]).toMatchObject({ centerX: 300, centerY: 200 });
      expect(shown(frames.mock.lastCall![2])[3]).toBe(300);
    });

    it('does not freeze on the camera of the scene the DM browses while players are held on theirs and were shown nothing of it yet', () => {
      const { service, source, setDmCamera, nextFrame, lastFrame } = setup();
      nextFrame();
      const next = otherScene({ centerX: 300, centerY: 200, scale: 2 });
      service.presentCanvas(next, 'scene-b');
      // The DM leaves the presented tab before its first frame: the view now shows another scene, through another camera
      service.holdCurrentFrame();
      vi.mocked(Notice).mockClear();
      service.toggleCameraFreeze();
      expect(service.isFrozen()).toBe(false);
      expect(vi.mocked(Notice).mock.calls).toEqual([[NOTHING_TO_FREEZE]]);

      // Held on a scene they were shown, players are frozen on what they saw of it
      service.presentCanvas(source, 'scene-a');
      setDmCamera({ centerX: 40, centerY: 50, scale: 1 });
      nextFrame();
      service.holdCurrentFrame();
      setDmCamera({ centerX: 9000, centerY: 9000, scale: 0.1 });
      service.toggleCameraFreeze();
      expect(service.isFrozen()).toBe(true);
      service.releaseHeldFrame(source);
      nextFrame();
      expect(lastFrame()).toMatchObject({ centerX: 40, centerY: 50 });
    });
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
