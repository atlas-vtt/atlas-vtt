// @vitest-environment jsdom
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

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
afterEach(() => { PlayerWindowService.getInstance()?.destroy(); vi.restoreAllMocks(); vi.mocked(Notice).mockClear(); });

interface Harness {
  service: PlayerWindowService;
  source: PlayerFrameSource & { withPlayerSafeFrame: ReturnType<typeof vi.fn<PlayerFrameSource['withPlayerSafeFrame']>> };
  session: LocalPlayerSession;
  drawImage: ReturnType<typeof vi.fn>;
  /** What the players' canvas was given as text: the set-up screen's words. */
  fillText: ReturnType<typeof vi.fn>;
  /** The popout's document. */
  doc: Document;
  settings: SettingsService;
  setDmCamera(camera: PlayerCameraState): void;
  /** The DM's pane takes this size, as when a sidebar opens. */
  resizePane(width: number, height: number): void;
  /** Runs the last requested animation frame at `time` ms. */
  nextFrame(time?: number): void;
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
  const fillText = vi.fn();
  const drawing = Object.fromEntries(['save', 'restore', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'closePath', 'fill', 'stroke'].map((name) => [name, vi.fn()]));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ ...drawing, clearRect: vi.fn(), drawImage, fillText } as never);
  sizePlayerWindow();
  const { app } = createInMemoryApp();
  const store = createStore(() => ({})) as StoreApi<ViewAtlasState>;
  const settings = new SettingsService(app);
  const service = new PlayerWindowService(app, store, settings);
  const doc = document.implementation.createHTMLDocument();
  Object.defineProperty(doc, 'readyState', { value: 'complete' });
  Object.defineProperty(doc.body, 'win', { value: {
    document: doc, closed: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn(),
    requestAnimationFrame, cancelAnimationFrame: vi.fn(), devicePixelRatio: 1, performance: { now: () => 0 }, screen: { width: 1280, height: 720 },
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
    service, source, session, drawImage, fillText, doc, attach, settings,
    setDmCamera: (camera) => { dmCamera = camera; },
    resizePane: (width, height) => { pane = { width, height, resolution: 1 }; },
    nextFrame: (time = 0) => frame?.(time),
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
      const { service, session, settings, setDmCamera, nextFrame } = setup();
      // No dip to black: the frame comes with the next display frame
      settings.setTableTvSettings({ viewGlideMs: 0 });
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
      const { service, settings, nextFrame } = setup();
      settings.setTableTvSettings({ viewGlideMs: 0 });
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
      const { service, source, settings, setDmCamera, nextFrame, lastFrame } = setup();
      settings.setTableTvSettings({ viewGlideMs: 0 });
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

  it('presenting a scene leaves players who are not frozen following the DM', () => {
    const { service, source, nextFrame } = setup();
    nextFrame();
    service.presentCanvas(source, 'scene-b');
    expect(service.isFrozen()).toBe(false);
    expect(playerWindowStore.getState().isFrozen).toBe(false);
  });

  it('presenting another scene keeps the freeze, on the DM framing of that scene', () => {
    const { service, source, session, setDmCamera, nextFrame } = setup();
    nextFrame();
    service.toggleCameraFreeze();
    setDmCamera({ centerX: 500, centerY: 600, scale: 2 });
    service.presentCanvas(source, 'scene-b');
    expect(service.isFrozen()).toBe(true);
    expect(playerWindowStore.getState().isFrozen).toBe(true);
    expect(session).toMatchObject({ tabId: 'scene-b', frozen: true, camera: { centerX: 500, centerY: 600, scale: 2 } });
  });

  it('presenting the same scene again pushes the DM framing and stays frozen', () => {
    const { service, source, session, settings, setDmCamera, nextFrame } = setup();
    settings.setTableTvSettings({ viewGlideMs: 0 });
    nextFrame();
    service.toggleCameraFreeze();
    setDmCamera({ centerX: 500, centerY: 600, scale: 2 });
    service.presentCanvas(source, 'scene-a');
    expect(service.isFrozen()).toBe(true);
    expect(session.camera).toMatchObject({ centerX: 500, centerY: 600, scale: 2 });
  });

  it('glides frozen players to a view pushed on the same scene', () => {
    const { service, source, session, setDmCamera, nextFrame } = setup();
    nextFrame();
    service.toggleCameraFreeze();
    setDmCamera({ centerX: 100, centerY: 0, scale: 1 });
    service.presentCanvas(source, 'scene-a');
    // Halfway through the default 800 ms
    nextFrame(400);
    expect(session.camera).not.toMatchObject({ centerX: 100 });
    nextFrame(800);
    expect(service.isFrozen()).toBe(true);
    expect(session.camera).toMatchObject({ centerX: 100, centerY: 0, scale: 1 });
  });

  describe('players following the GM, sent to a frame of the same scene', () => {
    const FRAME_B = { centerX: 300, centerY: 400, scale: 1, width: 1280, height: 720 };

    it('glide from what they see, pinned from the first step, and land on it', () => {
      const { service, session, setDmCamera, nextFrame, lastFrame } = setup();
      setDmCamera({ centerX: 10, centerY: 20, scale: 1 });
      nextFrame();
      service.playersToCamera('scene-a', FRAME_B);
      expect(service.isFrozen()).toBe(true);
      expect(playerWindowStore.getState().isFrozen).toBe(true);
      expect(service.glassOf('scene-a')).toMatchObject({ centerX: 10, centerY: 20 });

      // Moving the GM's camera now moves them no more
      setDmCamera({ centerX: 9000, centerY: 9000, scale: 1 });
      nextFrame(400);
      const between = service.glassOf('scene-a')!;
      expect(between.centerX).toBeGreaterThan(10);
      expect(between.centerX).toBeLessThan(300);

      nextFrame(800);
      expect(session.camera).toEqual(FRAME_B);
      expect(session.frozen).toBe(true);
      expect(lastFrame().centerX).toBeLessThan(9000);
    });

    it('jump with no glide time, with reduced motion, and under the curtain', () => {
      const off = setup();
      off.settings.setTableTvSettings({ viewGlideMs: 0 });
      off.nextFrame();
      off.service.playersToCamera('scene-a', FRAME_B);
      expect(off.session.camera).toEqual(FRAME_B);
      off.service.destroy();

      const reduced = setup();
      reduced.nextFrame();
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
      reduced.service.playersToCamera('scene-a', FRAME_B);
      expect(reduced.session.camera).toEqual(FRAME_B);
      vi.mocked(window.matchMedia).mockRestore();
      reduced.service.destroy();

      const curtained = setup();
      curtained.nextFrame();
      curtained.service.setCurtain(true);
      curtained.service.playersToCamera('scene-a', FRAME_B);
      expect(curtained.session.camera).toEqual(FRAME_B);
    });

    it('stop gliding when the GM unpins them', () => {
      const { service, nextFrame } = setup();
      nextFrame();
      service.playersToCamera('scene-a', FRAME_B);
      service.unfreezeCamera();
      nextFrame(800);
      expect(service.isFrozen()).toBe(false);
    });

    it('glide too when the frame comes through a present of the scene they see', () => {
      const { service, source, session, setDmCamera, nextFrame } = setup();
      setDmCamera({ centerX: 10, centerY: 20, scale: 1 });
      nextFrame();
      service.presentCanvas(source, 'scene-a', undefined, FRAME_B);
      expect(service.glassOf('scene-a')).toMatchObject({ centerX: 10, centerY: 20 });
      nextFrame(800);
      expect(session.camera).toEqual(FRAME_B);
    });
  });

  it('returns players to the frame the GM set on a map when it is presented again', () => {
    const { service, source, session, settings, setDmCamera, nextFrame } = setup();
    settings.setTableTvSettings({ viewGlideMs: 0 });
    setDmCamera({ centerX: 10, centerY: 20, scale: 1.5 });
    nextFrame();
    service.framePlayersOn('scene-a', 300, 400);
    service.toggleCameraFreeze();

    setDmCamera({ centerX: 0, centerY: 0, scale: 3 });
    service.presentCanvas(source, 'scene-b', 'scene-b.atlasmap');
    expect(service.isFrozen()).toBe(false);
    service.presentCanvas(source, 'scene-a', 'scene-a.atlasmap');
    expect(service.isFrozen()).toBe(true);
    expect(session.camera).toMatchObject({ centerX: 300, centerY: 400, scale: 1.5 });
  });

  it('frames players on a picked point at their zoom, frozen there, only on the scene they see', () => {
    const { service, session, setDmCamera, nextFrame } = setup();
    setDmCamera({ centerX: 10, centerY: 20, scale: 1.5 });
    nextFrame();
    expect(service.framePlayersOn('scene-b', 300, 400)).toBe(false);
    expect(service.isFrozen()).toBe(false);

    expect(service.framePlayersOn('scene-a', 300, 400)).toBe(true);
    expect(service.isFrozen()).toBe(true);
    nextFrame(800);
    expect(session.camera).toMatchObject({ centerX: 300, centerY: 400, scale: 1.5 });
    // The DM's camera no longer moves them
    setDmCamera({ centerX: 0, centerY: 0, scale: 3 });
    nextFrame();
    expect(session.camera).toMatchObject({ centerX: 300, centerY: 400, scale: 1.5 });
  });

  it('outlines what players see of their scene, and none of another', () => {
    const { service, setDmCamera, nextFrame } = setup();
    setDmCamera({ centerX: 10, centerY: 20, scale: 1 });
    nextFrame();
    // The 800 × 600 pane fits into the 16:9 window by its height
    expect(service.playerViewFrame('scene-a')).toEqual({ centerX: 10, centerY: 20, width: 600 * 1280 / 720, height: 600 });
    expect(service.playerViewFrame('scene-b')).toBeNull();
  });

  it('presents another scene on a picked point, at the zoom players have', () => {
    const { service, source, session, setDmCamera, nextFrame } = setup();
    setDmCamera({ centerX: 10, centerY: 20, scale: 1.5 });
    nextFrame();
    const camera = service.playerCameraAt(300, 400);
    expect(camera).toMatchObject({ centerX: 300, centerY: 400, scale: 1.5 });

    setDmCamera({ centerX: 0, centerY: 0, scale: 3 });
    service.presentCanvas(source, 'scene-b', undefined, camera!);
    expect(playerWindowStore.getState().shownTabId).toBe('scene-b');
    expect(service.isFrozen()).toBe(true);
    expect(session.camera).toMatchObject({ centerX: 300, centerY: 400, scale: 1.5 });
  });

  describe('the glass', () => {
    it('drags players to a point at once, pinned, without remembering it or writing the session', () => {
      const { service, session, setDmCamera, nextFrame, lastFrame } = setup();
      setDmCamera({ centerX: 10, centerY: 20, scale: 1.5 });
      nextFrame();
      const saved = { ...session.camera };
      expect(service.dragPlayersTo('scene-b', 300, 400)).toBe(false);
      expect(service.isFrozen()).toBe(false);

      // A following glass is pinned by the drag, and with the default glide still lands at once
      expect(service.dragPlayersTo('scene-a', 300, 400)).toBe(true);
      expect(service.isFrozen()).toBe(true);
      expect(service.glassOf('scene-a')).toMatchObject({ centerX: 300, centerY: 400 });
      expect(service.dragPlayersTo('scene-a', 320, 410)).toBe(true);
      expect(service.glassOf('scene-a')).toMatchObject({ centerX: 320, centerY: 410 });
      expect(session.camera).toEqual(saved);
      expect(session.frames).toBeUndefined();
      nextFrame();
      expect(lastFrame()).toMatchObject({ centerX: 320, centerY: 410, scale: lastFrame().scale });

      // The drop remembers the frame
      expect(service.framePlayersOn('scene-a', 320, 410)).toBe(true);
      expect(session.frames?.['scene-a.atlasmap']).toMatchObject({ centerX: 320, centerY: 410 });
    });

    it('lets players follow the GM again without a notice, and does nothing while they follow', () => {
      const { service, session, setDmCamera, nextFrame, lastFrame } = setup();
      nextFrame();
      service.freezeCamera();
      const moved = vi.fn();
      service.onPlayersCameraChange(moved);
      vi.mocked(Notice).mockClear();

      service.unfreezeCamera();
      expect(service.isFrozen()).toBe(false);
      expect(playerWindowStore.getState().isFrozen).toBe(false);
      expect(session.frozen).toBe(false);
      expect(Notice).not.toHaveBeenCalled();
      expect(moved).toHaveBeenCalledOnce();
      setDmCamera({ centerX: 900, centerY: 900, scale: 1 });
      nextFrame();
      expect(lastFrame()).toMatchObject({ centerX: 900, centerY: 900 });

      moved.mockClear();
      service.unfreezeCamera();
      expect(moved).not.toHaveBeenCalled();
      expect(Notice).not.toHaveBeenCalled();
    });

    it('sends players to a whole camera on the scene they see, gliding there, and remembers it', () => {
      const { service, session, setDmCamera, nextFrame } = setup();
      setDmCamera({ centerX: 10, centerY: 20, scale: 1 });
      nextFrame();
      const saved = { centerX: 300, centerY: 400, scale: 2, width: 640, height: 360 };
      expect(service.playersToCamera('scene-b', saved)).toBe(false);
      expect(service.isFrozen()).toBe(false);

      service.freezeCamera();
      expect(service.playersToCamera('scene-a', saved)).toBe(true);
      expect(session.frames?.['scene-a.atlasmap']).toEqual(saved);
      // Halfway through the default 800 ms glide players are between the two
      nextFrame(400);
      expect(service.glassOf('scene-a')!.centerX).toBeGreaterThan(10);
      expect(service.glassOf('scene-a')!.centerX).toBeLessThan(300);
      nextFrame(800);
      expect(session.camera).toEqual(saved);
      expect(service.glassOf('scene-a')).toMatchObject({ centerX: 300, centerY: 400 });
    });

    it('is what players see, following or pinned, and none on another tab', () => {
      const { service, settings, setDmCamera, nextFrame } = setup();
      settings.setTableTvSettings({ viewGlideMs: 0 });
      setDmCamera({ centerX: 10, centerY: 20, scale: 1 });
      nextFrame();
      const size = { width: 600 * 1280 / 720, height: 600 };
      expect(service.glassOf('scene-a')).toEqual({ centerX: 10, centerY: 20, ...size });
      expect(service.glassOf('scene-b')).toBeNull();

      service.framePlayersOn('scene-a', 300, 400);
      setDmCamera({ centerX: 900, centerY: 900, scale: 1 });
      nextFrame();
      expect(service.glassOf('scene-a')).toEqual({ centerX: 300, centerY: 400, ...size });
      expect(service.glassOf('scene-b')).toBeNull();
      service.holdCurrentFrame();
      expect(service.glassOf('scene-a')).toBeNull();
    });

    it("tells its followers when the players' camera moves: a freeze, each glide step, a frame through another camera", () => {
      const { service, source, setDmCamera, nextFrame } = setup();
      const moved = vi.fn();
      const stop = service.onPlayersCameraChange(moved);
      // The window's first frame came as it opened: the same camera again moves nothing
      nextFrame();
      expect(moved).not.toHaveBeenCalled();
      setDmCamera({ centerX: 50, centerY: 0, scale: 1 });
      nextFrame();
      expect(moved).toHaveBeenCalledTimes(1);

      service.toggleCameraFreeze();
      expect(moved).toHaveBeenCalledTimes(2);
      setDmCamera({ centerX: 100, centerY: 0, scale: 1 });
      service.presentCanvas(source, 'scene-a');
      moved.mockClear();
      nextFrame(400);
      expect(moved).toHaveBeenCalled();

      stop();
      moved.mockClear();
      service.toggleCameraFreeze();
      expect(moved).not.toHaveBeenCalled();
    });
  });

  describe('setting the TV up', () => {
    it('names the open window\'s screen, and none once it closed', () => {
      const { service } = setup();
      expect(service.setupScreenKey()).toBe('1280x720');
      service.destroy();
      expect(service.setupScreenKey()).toBeNull();
    });

    it("shows the set-up screen over the players' frame, at the dial's pixels per mm, at true scale while a card is fitted", () => {
      const { service, source, fillText, nextFrame, lastFrame } = setup();
      Object.assign(source, { getGridSize: () => 70 });
      nextFrame();
      const scale = lastFrame().scale;

      service.showSetup({ kind: 'orientation' });
      nextFrame();
      expect(fillText.mock.calls.map(([text]) => text)).toEqual(['Which way is up?', 'Turn the picture until the arrow points away from the players']);
      expect(lastFrame().scale).toBe(scale);

      fillText.mockClear();
      service.showSetup({ kind: 'fit', pxPerMm: 5.512 });
      nextFrame();
      expect(fillText.mock.calls[0]).toEqual(['Lay a bank card inside the outline', expect.any(Number), expect.any(Number)]);
      // A cell of 70 world pixels spans 25.4 mm of the dial's 5.512 device pixels (140), at a pixel ratio of 1
      expect(lastFrame().scale).toBeCloseTo(2);

      fillText.mockClear();
      service.showSetup(null);
      nextFrame();
      expect(fillText).not.toHaveBeenCalled();
      expect(lastFrame().scale).toBe(scale);
    });

    it("turns the TV and zooms it to its fit as this device's settings say, and stores them on the device", () => {
      const { service, source, settings, doc, nextFrame, lastFrame } = setup();
      Object.assign(source, { getGridSize: () => 70 });
      const key = service.setupScreenKey()!;
      const saveData = vi.spyOn(settings as unknown as { scheduleSave(): void }, 'scheduleSave');

      settings.setTvScreenSetup(key, { rotation: 90 });
      expect(doc.body.dataset.tvRotation).toBe('90');
      expect(settings.getTableTvDevice().screens[key]).toEqual({ rotation: 90 });

      settings.setTvScreenSetup(key, { pxPerMm: 0 });
      settings.setTableTvDevice({ trueScale: true, cellMm: 30 });
      nextFrame();
      const unfitted = lastFrame().scale;
      settings.setTvScreenSetup(key, { pxPerMm: 7 });
      expect(settings.getTableTvDevice().screens[key]).toEqual({ rotation: 90, pxPerMm: 7 });
      nextFrame();
      expect(lastFrame().scale).not.toBe(unfitted);
      // 30 mm of 7 device pixels each over a cell of 70 world pixels
      expect(lastFrame().scale).toBeCloseTo(3);
      expect(saveData).not.toHaveBeenCalled();
    });
  });
});

