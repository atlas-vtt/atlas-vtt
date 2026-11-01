// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { LocalPlayerSession, LocalPlayerView } from '../../src/app/local-player-view';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import { PLAYER_CURTAIN_CLASS } from '../../src/app/services/playerCurtain';
import { PlayerSceneFade, SCENE_DIP_MS, SCENE_FADE_LIMIT_MS } from '../../src/app/services/playerSceneFade';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { playerWindowStore } from '../../src/app/stores/playerWindowStore';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { MIRRORED, mirroring } from '../mocks/mirrorHarness';
import { framePiece, frameSource, sizePlayerWindow } from '../mocks/playerFrameSource';

afterEach(() => { PlayerWindowService.getInstance()?.destroy(); vi.restoreAllMocks(); });

function sceneFade(): { dip: PlayerSceneFade; sheet: boolean[]; curtain: { down: boolean } } {
  const sheet: boolean[] = [];
  const curtain = { down: false };
  return { dip: new PlayerSceneFade((down) => sheet.push(down), () => curtain.down), sheet, curtain };
}

describe('the dip to black', () => {
  it('keeps the picture until the sheet is down, and lifts at the first real frame', () => {
    const { dip, sheet } = sceneFade();
    dip.begin(1000);
    expect(sheet).toEqual([true]);
    expect(dip.withholds(1000 + SCENE_DIP_MS - 1)).toBe(true);
    expect(dip.withholds(1000 + SCENE_DIP_MS)).toBe(false);

    dip.finish();
    expect(sheet).toEqual([true, false]);
    dip.finish();
    expect(sheet).toEqual([true, false]);
  });

  it('never leaves players black past the limit', () => {
    const { dip, sheet } = sceneFade();
    dip.begin(1000);
    dip.expire(1000 + SCENE_FADE_LIMIT_MS - 1);
    expect(sheet).toEqual([true]);
    dip.expire(1000 + SCENE_FADE_LIMIT_MS);
    expect(sheet).toEqual([true, false]);
  });

  it('starts over when another scene comes during a dip', () => {
    const { dip } = sceneFade();
    dip.begin(1000);
    dip.begin(1000 + SCENE_DIP_MS);
    expect(dip.withholds(1000 + SCENE_DIP_MS + 1)).toBe(true);
    dip.expire(1000 + SCENE_FADE_LIMIT_MS);
    expect(dip.withholds(1000 + SCENE_DIP_MS + 1)).toBe(true);
  });

  it('does not start under the curtain, and never lifts it', () => {
    const { dip, sheet, curtain } = sceneFade();
    curtain.down = true;
    dip.begin(1000);
    expect(sheet).toEqual([]);
    expect(dip.withholds(1000)).toBe(false);

    curtain.down = false;
    dip.begin(2000);
    curtain.down = true;
    dip.finish();
    expect(sheet).toEqual([true, true]);
  });
});

describe('the dip in the mirror', () => {
  it('renders nothing while withheld, and owes players the frame after it', () => {
    const { events, frame, dm, state, onFrame } = mirroring();
    state.withheld = true;
    dm.change();
    frame(20);
    dm.tick(21);
    expect(events).toEqual(['render:dm']);
    expect(onFrame).not.toHaveBeenCalled();

    events.length = 0;
    state.withheld = false;
    frame(40);
    dm.tick(41);
    expect(events).toEqual(MIRRORED);
    expect(onFrame).toHaveBeenCalledOnce();
  });
});

/** A service attached to a fake popout on scene-a, its display frames run by hand. */
function openWindow(reducedMotion = false): {
  service: PlayerWindowService; settings: SettingsService; capture: Mock<PlayerFrameSource['withPlayerSafeFrame']>; next: PlayerFrameSource;
  sheetDown(): boolean; at(time: number): void;
} {
  let frame: FrameRequestCallback | null = null;
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn() } as never);
  sizePlayerWindow();
  const { app } = createInMemoryApp();
  const store = createStore(() => ({})) as StoreApi<ViewAtlasState>;
  const settings = new SettingsService(app);
  const service = new PlayerWindowService(app, store, settings);
  const doc = document.implementation.createHTMLDocument();
  Object.defineProperty(doc, 'readyState', { value: 'complete' });
  Object.defineProperty(doc.body, 'win', { value: {
    document: doc, closed: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn(),
    requestAnimationFrame: (callback: FrameRequestCallback): number => { frame = callback; return 1; },
    cancelAnimationFrame: vi.fn(), devicePixelRatio: 1, performance: { now: () => now },
  } });
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: reducedMotion } as MediaQueryList);
  const session: LocalPlayerSession = { tabId: 'scene-a', filePath: '', frozen: false };
  const view = {
    contentEl: doc.body,
    getState: (): LocalPlayerSession => ({ ...session }),
    updateSession: (state: Partial<LocalPlayerSession>): void => { Object.assign(session, state); },
  };
  service.attachToView(view as unknown as LocalPlayerView, frameSource(), { tabId: 'scene-a', filePath: 'scene-a.atlasmap' });
  const capture = vi.fn<PlayerFrameSource['withPlayerSafeFrame']>((copy, _settings, rendered) => copy(framePiece(rendered)));
  return {
    service, settings, capture,
    next: frameSource({ withPlayerSafeFrame: capture }),
    sheetDown: () => doc.body.hasClass(PLAYER_CURTAIN_CLASS),
    at: (time) => { now = time; frame?.(time); },
  };
}

describe('a change of the presented scene', () => {
  it('dips to black, keeps the old frame until it is, and lifts on the new scene', () => {
    const { service, capture, next, sheetDown, at } = openWindow();
    at(0);
    at(100);
    service.presentCanvas(next, 'scene-b', 'scene-b.atlasmap');
    expect(sheetDown()).toBe(true);
    // Everything but the picture has moved on
    expect(playerWindowStore.getState().shownTabId).toBe('scene-b');

    at(100 + SCENE_DIP_MS - 1);
    expect(capture).not.toHaveBeenCalled();
    expect(sheetDown()).toBe(true);

    at(100 + SCENE_DIP_MS);
    expect(capture).toHaveBeenCalledOnce();
    expect(sheetDown()).toBe(false);
    expect(service.isCurtained()).toBe(false);
  });

  it('lifts off the last frame at the limit where no frame of the new scene comes', () => {
    const { service, next, sheetDown, at } = openWindow();
    at(0);
    const failing = { ...next, canRender: (): boolean => false };
    service.presentCanvas(failing, 'scene-b', 'scene-b.atlasmap');

    at(SCENE_FADE_LIMIT_MS - 1);
    expect(sheetDown()).toBe(true);
    at(SCENE_FADE_LIMIT_MS);
    expect(sheetDown()).toBe(false);
  });

  it('leaves a curtain the GM lowered during the dip down, and it comes up only for the GM', () => {
    const { service, capture, next, sheetDown, at } = openWindow();
    at(0);
    service.presentCanvas(next, 'scene-b', 'scene-b.atlasmap');
    service.setCurtain(true);
    at(SCENE_DIP_MS);
    at(SCENE_FADE_LIMIT_MS);
    expect(sheetDown()).toBe(true);
    expect(service.isCurtained()).toBe(true);
    expect(capture).not.toHaveBeenCalled();

    service.setCurtain(false);
    expect(sheetDown()).toBe(false);
    expect(capture).toHaveBeenCalled();
  });

  it('does not touch a curtain that is down, which the new scene waits behind', () => {
    const { service, capture, next, sheetDown, at } = openWindow();
    at(0);
    service.setCurtain(true);
    service.presentCanvas(next, 'scene-b', 'scene-b.atlasmap');
    at(SCENE_DIP_MS);
    at(SCENE_FADE_LIMIT_MS);
    expect(sheetDown()).toBe(true);
    expect(capture).not.toHaveBeenCalled();
  });

  it('lifts at once when the GM leaves for another tab during the dip: the held frame is what players get', () => {
    const { service, next, sheetDown, at } = openWindow();
    at(0);
    service.presentCanvas(next, 'scene-b', 'scene-b.atlasmap');
    service.holdCurrentFrame();
    expect(sheetDown()).toBe(false);
  });

  it('does not dip when the scene players see is presented again, nor with no glide or reduced motion', () => {
    const same = openWindow();
    same.at(0);
    same.service.presentCanvas(same.next, 'scene-a', 'scene-a.atlasmap');
    expect(same.sheetDown()).toBe(false);
    same.service.destroy();

    const off = openWindow();
    off.at(0);
    off.settings.setTableTvSettings({ viewGlideMs: 0 });
    off.service.presentCanvas(off.next, 'scene-b', 'scene-b.atlasmap');
    expect(off.sheetDown()).toBe(false);
    expect(off.capture).toHaveBeenCalled();
    off.service.destroy();

    const reduced = openWindow(true);
    reduced.at(0);
    reduced.service.presentCanvas(reduced.next, 'scene-b', 'scene-b.atlasmap');
    expect(reduced.sheetDown()).toBe(false);
  });

  it('needs no dip for a window just opened', () => {
    const { sheetDown, at } = openWindow();
    at(0);
    expect(sheetDown()).toBe(false);
  });
});
