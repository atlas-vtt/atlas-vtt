// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TABLE_TV_SETTINGS } from '../../src/app/services/tableTvSettings';
import { DEFAULT_TABLE_TV_DEVICE } from '../../src/app/services/tableTvDevice';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { keepPlayerWindowAwake } from '../../src/app/services/playerWindowThrottling';
import { playerWindowStore } from '../../src/app/stores/playerWindowStore';
import { attachFakePlayerWindow } from '../mocks/playerPopout';

/** What the popout's own `require('electron')` answers: its `BrowserWindow` through `remote`, with `webContents` as given. */
function electronOf(webContents: unknown): { require: (id: string) => unknown } {
  const browserWindow = {
    getBounds: vi.fn(), setBounds: vi.fn(), isFullScreen: vi.fn(() => false), setFullScreen: vi.fn(),
    isSimpleFullScreen: vi.fn(() => false), setSimpleFullScreen: vi.fn(), webContents,
  };
  const screen = { getAllDisplays: vi.fn(() => []), getDisplayMatching: vi.fn() };
  return { require: (id) => (id === 'electron' ? { remote: { screen, getCurrentWindow: () => browserWindow } } : {}) };
}

function popout(webContents: unknown): Window & { closed: boolean } {
  return { closed: false, ...electronOf(webContents) } as unknown as Window & { closed: boolean };
}

afterEach(() => {
  PlayerWindowService.getInstance()?.destroy();
  vi.restoreAllMocks();
});

describe('keepPlayerWindowAwake', () => {
  it('switches throttling off, and on again when released while the popout stays open', () => {
    const contents = { setBackgroundThrottling: vi.fn() };
    const release = keepPlayerWindowAwake(popout(contents));
    expect(contents.setBackgroundThrottling).toHaveBeenCalledExactlyOnceWith(false);

    release();
    expect(contents.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
  });

  it('leaves a closed popout alone', () => {
    const contents = { setBackgroundThrottling: vi.fn() };
    const win = popout(contents);
    const release = keepPlayerWindowAwake(win);
    win.closed = true;
    release();
    expect(contents.setBackgroundThrottling).toHaveBeenCalledTimes(1);
  });

  it('does nothing where the popout has no remote or no throttling switch', () => {
    expect(() => keepPlayerWindowAwake({ closed: false } as unknown as Window)()).not.toThrow();
    expect(() => keepPlayerWindowAwake(popout({}))()).not.toThrow();
  });

  it('carries on where Electron refuses, and says so once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const contents = { setBackgroundThrottling: vi.fn(() => { throw new Error('Object has been destroyed'); }) };
    keepPlayerWindowAwake(popout(contents))();
    keepPlayerWindowAwake(popout(contents))();
    expect(contents.setBackgroundThrottling).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('PlayerWindowService and background throttling', () => {
  function service(): PlayerWindowService {
    const store = { getState: () => ({}), subscribe: vi.fn(() => vi.fn()) };
    const settings = {
      getLocalPlayerViewSettings: () => ({}),
      getTableTvSettings: () => DEFAULT_TABLE_TV_SETTINGS,
      getTableTvDevice: () => DEFAULT_TABLE_TV_DEVICE,
      onChange: () => vi.fn(),
      initiativeLayout: () => ({ fromTurn: true, dock: 'right', collapsed: false }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    // Test doubles: the service reads only what these give
    return new PlayerWindowService({ workspace: { on: vi.fn(() => ({})), offref: vi.fn() } } as never, store as never, settings as never);
  }

  it('keeps the player window awake while it is one, and lets a popout that stays open as something else sleep again', () => {
    const players = service();
    const contents = { setBackgroundThrottling: vi.fn() };
    attachFakePlayerWindow(players, { withPlayerSafeFrame: vi.fn() }, 'scene-a', electronOf(contents));
    expect(contents.setBackgroundThrottling).toHaveBeenCalledExactlyOnceWith(false);

    // The view closed in a popout that stays open
    players.destroy(false);
    expect(contents.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
  });

  it('opens a working player window where Electron refuses', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const players = service();
    const contents = { setBackgroundThrottling: vi.fn(() => { throw new Error('no'); }) };
    const doc = attachFakePlayerWindow(players, { withPlayerSafeFrame: vi.fn() }, 'scene-a', electronOf(contents));
    expect(doc.getElementById('atlas-player-canvas')).not.toBeNull();
    // Set up to the end
    expect(playerWindowStore.getState().isOpen).toBe(true);
  });
});
