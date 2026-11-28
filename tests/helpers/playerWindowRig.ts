import { vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { LocalPlayerSession, LocalPlayerView, PlayerCameraState } from '../../src/app/local-player-view';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import { PLAYER_CURTAIN_CLASS } from '../../src/app/services/playerCurtain';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { presentedSceneOf } from '../../src/app/services/presentedScene';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { PlayerFrame, Screen } from '../../src/app/types/playerFrame';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { framePiece, sizePlayerWindow } from '../mocks/playerFrameSource';

/** A map view the player window renders from: its own camera, pane, grid and load. */
export interface RigView extends PlayerFrameSource {
  store: StoreApi<ViewAtlasState>;
  /** Every frame rendered of this view for players. */
  rendered: PlayerFrame[];
  look(camera: PlayerCameraState): void;
  resize(width: number, height: number): void;
  setLoading(loading: boolean): void;
}

export interface PlayerWindowRig {
  service: PlayerWindowService;
  settings: SettingsService;
  session: LocalPlayerSession;
  /** The view of scene-a the window opened on. */
  view: RigView;
  /** Another view, of its own scene. */
  createView(camera?: PlayerCameraState): RigView;
  /** Runs every display frame the window asked for before this call, at `time` ms, which is also the clock's time. */
  frame(time: number): void;
  /** The level the presenter says is presented, for a present of another level of the same tab. */
  presentLevel(tabId: string, levelId: string | undefined): void;
  /** Whether "Camera paused" shows in the window. */
  pausedLabel(): boolean;
  /** Whether a dip's or the curtain's black sheet is over the window. */
  sheetDown(): boolean;
  /** The window was closed by its own close button. */
  closeWindow(): void;
}

function createView(camera: PlayerCameraState = { centerX: 0, centerY: 0, scale: 1 }): RigView {
  let looking = camera;
  let pane: Screen = { width: 800, height: 600, resolution: 1 };
  const store = createStore(() => ({ isMapLoading: false })) as unknown as StoreApi<ViewAtlasState>;
  const rendered: PlayerFrame[] = [];
  return {
    store,
    rendered,
    withPlayerSafeFrame: (copy, _settings, frame) => {
      rendered.push(frame);
      copy(framePiece(frame));
    },
    getCamera: () => ({ ...looking, width: pane.width / looking.scale, height: pane.height / looking.scale }),
    getScreen: () => pane,
    getGridSize: () => 70,
    look: (next) => { looking = next; },
    resize: (width, height) => { pane = { width, height, resolution: 1 }; },
    setLoading: (loading) => store.setState({ isMapLoading: loading } as Partial<ViewAtlasState>),
  };
}

/**
 * A player window of 1280 × 720 open on scene-a, whose view's pane measures 800 × 600. Display
 * frames queue as a browser queues them: every callback asked for and not cancelled runs at the next frame, in order.
 */
export function openPlayerWindowRig(): PlayerWindowRig {
  let queue = new Map<number, FrameRequestCallback>();
  let due = new Map<number, FrameRequestCallback>();
  let lastId = 0;
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const drawing = Object.fromEntries(['save', 'restore', 'fillRect', 'clearRect', 'drawImage', 'fillText', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'closePath', 'fill', 'stroke'].map((name) => [name, vi.fn()]));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ ...drawing, measureText: () => ({ width: 0 }) } as never);
  sizePlayerWindow();
  const { app } = createInMemoryApp();
  const settings = new SettingsService(app);
  const view = createView();
  const service = new PlayerWindowService(app, view.store, settings);
  const doc = document.implementation.createHTMLDocument();
  Object.defineProperty(doc, 'readyState', { value: 'complete' });
  const win = {
    document: doc, closed: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn(),
    requestAnimationFrame: (callback: FrameRequestCallback): number => {
      queue.set(++lastId, callback);
      return lastId;
    },
    cancelAnimationFrame: (id: number): void => {
      queue.delete(id);
      due.delete(id);
    }, devicePixelRatio: 1, performance: { now: () => now }, screen: { width: 1280, height: 720 },
    innerWidth: 1280, innerHeight: 720,
  };
  Object.defineProperty(doc.body, 'win', { value: win });
  const session: LocalPlayerSession = { tabId: 'scene-a', filePath: '', frozen: false };
  const playerView = {
    contentEl: doc.body,
    getState: (): LocalPlayerSession => ({ ...session }),
    updateSession: (state: Partial<LocalPlayerSession>): void => { Object.assign(session, state); },
  };
  presentedSceneOf(app).set({ tabId: 'scene-a', filePath: 'scene-a.atlasmap' });
  service.attachToView(playerView as unknown as LocalPlayerView, view, { tabId: 'scene-a', filePath: 'scene-a.atlasmap' });
  return {
    service, settings, session, view, createView,
    frame: (time) => {
      now = time;
      due = queue;
      queue = new Map();
      for (const [id, callback] of due) {
        due.delete(id);
        callback(time);
      }
    },
    presentLevel: (tabId, levelId) => presentedSceneOf(app).set({ tabId, filePath: `${tabId}.atlasmap`, levelId }),
    pausedLabel: () => doc.getElementById('atlas-player-freeze-indicator')?.style.display === 'flex',
    sheetDown: () => doc.body.hasClass(PLAYER_CURTAIN_CLASS),
    closeWindow: () => { win.closed = true; },
  };
}
