import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Platform } from 'obsidian';
import type { ElectronDisplay, ScreenRect } from '../../src/app/services/electronRemote';
import {
  fullScreenAvailable, isPlayerWindowFullScreen, setPlayerWindowFullScreen, watchPlayerWindowDisplay,
} from '../../src/app/services/playerWindowDisplay';
import { playerWindowStore, resetPlayerWindowStore } from '../../src/app/stores/playerWindowStore';

const LAPTOP: ElectronDisplay = { id: 1, bounds: { x: 0, y: 0, width: 1728, height: 1117 }, workArea: { x: 0, y: 34, width: 1728, height: 1083 } };
const TV: ElectronDisplay = { id: 2, bounds: { x: 1728, y: 0, width: 1920, height: 1080 }, workArea: { x: 1728, y: 31, width: 1920, height: 1049 } };

/** A `BrowserWindow` as Electron behaves: bounds are ignored in full screen and come back when it is left. */
class FakeWindow {
  fullScreen = false;
  simpleFullScreen = false;
  calls: string[] = [];
  private restore: ScreenRect | null = null;
  /** What macOS gives a zoomed window back on leaving simple full screen: its frame from before the zoom. */
  unzoomedFrame: ScreenRect | null = null;
  constructor(public bounds: ScreenRect, private readonly resized: () => void = () => undefined) {}
  getBounds(): ScreenRect { return { ...this.bounds }; }
  setBounds(bounds: ScreenRect): void {
    this.calls.push('setBounds');
    if (!this.fullScreen && !this.simpleFullScreen) this.bounds = { ...bounds };
  }
  isFullScreen(): boolean { return this.fullScreen; }
  isSimpleFullScreen(): boolean { return this.simpleFullScreen; }
  setFullScreen(flag: boolean): void { this.calls.push(`setFullScreen(${flag})`); this.fullScreen = this.change(flag); }
  setSimpleFullScreen(flag: boolean): void { this.calls.push(`setSimpleFullScreen(${flag})`); this.simpleFullScreen = this.change(flag); }
  private change(flag: boolean): boolean {
    if (flag) this.restore = this.getBounds();
    else if (this.unzoomedFrame) this.bounds = this.unzoomedFrame;
    else if (this.restore) this.bounds = this.restore;
    this.resized();
    return flag;
  }
}

function fakeScreen(displays: ElectronDisplay[]): object {
  const contains = (display: ElectronDisplay, x: number, y: number): boolean =>
    x >= display.bounds.x && x < display.bounds.x + display.bounds.width && y >= display.bounds.y && y < display.bounds.y + display.bounds.height;
  return {
    getAllDisplays: (): ElectronDisplay[] => displays,
    getDisplayMatching: (rect: ScreenRect): ElectronDisplay =>
      displays.find((display) => contains(display, rect.x + rect.width / 2, rect.y + rect.height / 2)) ?? LAPTOP,
  };
}

/** A window whose own `require('electron').remote` answers for `browserWindow`. */
function fakeWindow(browserWindow: FakeWindow | null, displays: ElectronDisplay[]): Window {
  const target = new EventTarget();
  return Object.assign(target, {
    closed: false,
    setTimeout: (fn: () => void, ms: number): number => Number(globalThis.setTimeout(fn, ms)),
    clearTimeout: (id: number): void => globalThis.clearTimeout(id),
    require: (id: string): unknown => (id === 'electron' && browserWindow
      ? { remote: { screen: fakeScreen(displays), getCurrentWindow: (): FakeWindow => browserWindow } }
      : {}),
  }) as unknown as Window;
}

describe('playerWindowDisplay', () => {
  let stop: (() => void) | null = null;

  function open(displays: ElectronDisplay[], popoutBounds: ScreenRect): { popout: Window; player: FakeWindow } {
    const main = fakeWindow(new FakeWindow({ x: 87, y: 88, width: 1555, height: 975 }), displays);
    let popout: Window | null = null;
    const player = new FakeWindow(popoutBounds, () => popout?.dispatchEvent(new Event('resize')));
    popout = fakeWindow(player, displays);
    stop = watchPlayerWindowDisplay(popout, main);
    return { popout, player };
  }

  beforeEach(() => resetPlayerWindowStore());
  afterEach(() => {
    stop?.();
    stop = null;
    Platform.isMacOS = false;
  });

  it('moves a window on the GM\'s display to the other display before entering full screen', async () => {
    const { player } = open([LAPTOP, TV], { x: 352, y: 95, width: 1024, height: 800 });
    expect(playerWindowStore.getState()).toMatchObject({ fullScreen: false, secondDisplay: true });

    await setPlayerWindowFullScreen(true);

    expect(player.calls).toEqual(['setBounds', 'setFullScreen(true)']);
    expect(player.bounds).toEqual(TV.workArea);
    expect(isPlayerWindowFullScreen()).toBe(true);
    expect(playerWindowStore.getState().fullScreen).toBe(true);
  });

  it('enters full screen in place on a display of its own', async () => {
    const onTv = { x: 1736, y: 39, width: 1904, height: 1033 };
    const { player } = open([LAPTOP, TV], onTv);

    await setPlayerWindowFullScreen(true);

    expect(player.calls).toEqual(['setFullScreen(true)']);
  });

  it('refuses with one display, where full screen would cover the GM\'s Obsidian', async () => {
    const { player } = open([LAPTOP], { x: 352, y: 95, width: 1024, height: 800 });
    expect(fullScreenAvailable()).toBe(true);
    expect(playerWindowStore.getState().secondDisplay).toBe(false);

    await setPlayerWindowFullScreen(true);

    expect(player.calls).toEqual([]);
    expect(playerWindowStore.getState().fullScreen).toBe(false);
  });

  it('uses simple full screen on macOS', async () => {
    Platform.isMacOS = true;
    const { player } = open([LAPTOP, TV], { x: 352, y: 95, width: 1024, height: 800 });

    await setPlayerWindowFullScreen(true);

    expect(player.calls).toEqual(['setBounds', 'setSimpleFullScreen(true)']);
    expect(isPlayerWindowFullScreen()).toBe(true);
    expect(playerWindowStore.getState().fullScreen).toBe(true);
  });

  it('leaving full screen restores the bounds it had on the TV', async () => {
    Platform.isMacOS = true;
    const { player } = open([LAPTOP, TV], { x: 352, y: 95, width: 1024, height: 800 });
    await setPlayerWindowFullScreen(true);

    await setPlayerWindowFullScreen(false);

    expect(player.calls.at(-1)).toBe('setSimpleFullScreen(false)');
    expect(player.bounds).toEqual(TV.workArea);
    expect(playerWindowStore.getState().fullScreen).toBe(false);
  });

  it('puts back a zoomed window that macOS restores to its frame on the GM\'s display', async () => {
    Platform.isMacOS = true;
    const zoomedOnTv = { x: 1736, y: 39, width: 1904, height: 1033 };
    const { player } = open([LAPTOP, TV], zoomedOnTv);
    player.unzoomedFrame = { x: 352, y: 95, width: 1024, height: 800 };
    await setPlayerWindowFullScreen(true);

    await setPlayerWindowFullScreen(false);

    expect(player.bounds).toEqual(zoomedOnTv);
  });

  it('follows full screen entered or left outside Atlas through the popout\'s resize', async () => {
    const { popout, player } = open([LAPTOP, TV], { x: 1736, y: 39, width: 1904, height: 1033 });
    player.fullScreen = true;
    popout.dispatchEvent(new Event('resize'));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 150));

    expect(playerWindowStore.getState().fullScreen).toBe(true);
  });

  it('is unavailable where the window has no remote', () => {
    stop = watchPlayerWindowDisplay(fakeWindow(null, [LAPTOP, TV]), fakeWindow(null, [LAPTOP, TV]));

    expect(fullScreenAvailable()).toBe(false);
    expect(playerWindowStore.getState()).toMatchObject({ fullScreen: false, secondDisplay: false });
  });

  it('is unavailable once the watch of the closed window stopped', () => {
    open([LAPTOP, TV], { x: 352, y: 95, width: 1024, height: 800 });
    expect(fullScreenAvailable()).toBe(true);

    stop?.();

    expect(fullScreenAvailable()).toBe(false);
  });
});
