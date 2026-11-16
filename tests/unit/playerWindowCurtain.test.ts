// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { LocalPlayerSession, LocalPlayerView } from '../../src/app/local-player-view';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { playerWindowStore } from '../../src/app/stores/playerWindowStore';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { CURTAIN_DOWN_MS } from '../../src/app/services/playerCurtain';
import { SCENE_FADE_LIMIT_MS } from '../../src/app/services/playerSceneFade';
import { MIRRORED, mirroring } from '../mocks/mirrorHarness';
import { frameSource, sizePlayerWindow } from '../mocks/playerFrameSource';

afterEach(() => { PlayerWindowService.getInstance()?.destroy(); vi.restoreAllMocks(); });

describe('the curtain in the mirror', () => {
  it('blacks the canvas once and renders nothing for players while it is down', () => {
    const { events, frame, dm, state, mirror } = mirroring();
    state.curtain = true;

    frame(20);
    mirror.markStale();
    dm.change();
    dm.tick(21);
    frame(40);
    dm.tick(41);

    // The DM's own renders go on; no players' frame is rendered or asked for
    expect(events).toEqual(['draw:curtain', 'render:dm']);
  });

  it('keeps its picture while the sheet is falling, and draws nothing new', () => {
    const { events, frame, dm, state, mirror } = mirroring();
    state.curtain = true;
    state.curtainFalling = true;

    frame(20);
    mirror.markStale();
    dm.change();
    dm.tick(21);
    frame(40);
    expect(events).toEqual(['render:dm']);

    state.curtainFalling = false;
    frame(60);
    expect(events).toEqual(['render:dm', 'draw:curtain']);
  });

  it('owes players a frame once it is lifted', () => {
    const { events, frame, dm, state } = mirroring();
    state.curtain = true;
    frame(20);
    events.length = 0;

    state.curtain = false;
    frame(40);
    dm.tick(41);
    expect(events).toEqual(MIRRORED);
  });

  it('draws a held frame again once it is lifted', () => {
    const { events, frame, state } = mirroring();
    state.held = document.createElement('canvas');
    frame(20);
    state.curtain = true;
    frame(40);
    state.curtain = false;
    frame(60);
    expect(events).toEqual(['draw:held', 'draw:curtain', 'draw:held']);
  });
});

/** A service attached to a fake popout whose session is `saved`. */
function openWindow(saved: Partial<LocalPlayerSession> = {}): {
  service: PlayerWindowService; session: LocalPlayerSession; doc: Document;
  fillRect: ReturnType<typeof vi.fn>; capture: ReturnType<typeof vi.fn>; nextFrame(): void;
} {
  let frame: FrameRequestCallback | null = null;
  const fillRect = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect, clearRect: vi.fn(), drawImage: vi.fn() } as never);
  sizePlayerWindow();
  const { app } = createInMemoryApp();
  const store = createStore(() => ({})) as StoreApi<ViewAtlasState>;
  const service = new PlayerWindowService(app, store, new SettingsService(app));
  const doc = document.implementation.createHTMLDocument();
  Object.defineProperty(doc, 'readyState', { value: 'complete' });
  Object.defineProperty(doc.body, 'win', { value: {
    document: doc, closed: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn(),
    requestAnimationFrame: (callback: FrameRequestCallback): number => { frame = callback; return 1; },
    cancelAnimationFrame: vi.fn(), devicePixelRatio: 1, performance: { now: () => 0 },
    matchMedia: () => ({ matches: false }),
    getComputedStyle: (element: Element) => window.getComputedStyle(element),
  } });
  const session: LocalPlayerSession = { tabId: 'scene-a', filePath: '', frozen: false, ...saved };
  const view = {
    contentEl: doc.body,
    getState: (): LocalPlayerSession => ({ ...session }),
    updateSession: (state: Partial<LocalPlayerSession>): void => { Object.assign(session, state); },
  };
  const capture = vi.fn();
  service.attachToView(view as unknown as LocalPlayerView, frameSource({ withPlayerSafeFrame: capture }), { tabId: 'scene-a', filePath: 'scene-a.atlasmap' });
  return { service, session, doc, fillRect, capture, nextFrame: () => frame?.(0) };
}

describe('the curtain on the player window', () => {
  it('blacks the window once its sheet is down, keeps it in the session and lifts it again', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { service, session, doc, fillRect, capture, nextFrame } = openWindow();
    nextFrame();
    capture.mockClear();
    fillRect.mockClear();

    service.setCurtain(true);
    nextFrame();
    expect(fillRect).not.toHaveBeenCalled();
    clock.mockReturnValue(1000 + CURTAIN_DOWN_MS);
    nextFrame();
    expect(fillRect).toHaveBeenCalledTimes(1);
    expect(playerWindowStore.getState().curtain).toBe(true);
    expect(session.curtain).toBe(true);
    expect(doc.body.hasClass('atlas-player-window--curtain')).toBe(true);
    expect(doc.body.querySelector(':scope > .atlas-player-curtain')).not.toBeNull();
    nextFrame();
    nextFrame();
    expect(capture).not.toHaveBeenCalled();

    service.setCurtain(false);
    nextFrame();
    expect(capture).toHaveBeenCalled();
    expect(session.curtain).toBe(false);
    expect(playerWindowStore.getState().curtain).toBe(false);
    // The sheet waits for a picture to lift off; this source never gives one
    expect(doc.body.hasClass('atlas-player-window--curtain')).toBe(true);
    clock.mockReturnValue(1000 + CURTAIN_DOWN_MS + SCENE_FADE_LIMIT_MS);
    nextFrame();
    expect(doc.body.hasClass('atlas-player-window--curtain')).toBe(false);
  });

  it('stays down when another scene is presented', () => {
    const { service, capture, nextFrame } = openWindow();
    service.setCurtain(true);
    capture.mockClear();
    service.presentCanvas(frameSource({ withPlayerSafeFrame: capture }), 'scene-b', 'scene-b.atlasmap');
    nextFrame();
    expect(capture).not.toHaveBeenCalled();
    expect(service.isCurtained()).toBe(true);
  });

  it('comes back down in a window restored from a session saved with it down', () => {
    const { service, doc, capture, nextFrame } = openWindow({ curtain: true });
    nextFrame();
    expect(service.isCurtained()).toBe(true);
    expect(playerWindowStore.getState().curtain).toBe(true);
    expect(doc.body.hasClass('atlas-player-window--curtain')).toBe(true);
    expect(capture).not.toHaveBeenCalled();
  });

  it('goes with the window', () => {
    const { service, doc } = openWindow();
    service.setCurtain(true);
    service.destroy();
    expect(playerWindowStore.getState().curtain).toBe(false);
    expect(doc.body.querySelector('.atlas-player-curtain')).toBeNull();
  });
});
