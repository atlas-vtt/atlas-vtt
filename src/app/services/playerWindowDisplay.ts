import { Platform } from 'obsidian';
import { playerWindowStore } from '../stores/playerWindowStore';
import { electronWindowOf, type ElectronBrowserWindow, type ElectronDisplay, type ElectronScreen, type ElectronWindowHandle, type ScreenRect } from './electronRemote';

/**
 * Full screen on the table TV: the player window in full screen on a display other than the one
 * the main Obsidian window is on. `PlayerWindowService` hands the open popout over
 * (`watchPlayerWindowDisplay`); everything else reads the popout's own `BrowserWindow`.
 *
 * The store's `fullScreen` and `secondDisplay` are read anew when the popout opens, when it is
 * resized (entering and leaving full screen resize it, by any means: this module, the green
 * button, Escape) and when either window gains focus, which is where a GM who just plugged in a
 * TV comes back to. Electron's `display-added` / `display-removed` are not listened to: a callback
 * across `remote` is kept alive by the main process and leaks, and nothing here is polled.
 */

/** Longest wait for the popout to report its new size after a change of full screen. */
const SETTLE_MS = 1000;
/** Resizes come in bursts while a window is dragged larger; the store is read once they pause. */
const RESIZE_SYNC_MS = 100;

interface Watched {
  popout: Window;
  main: Window;
  /** Where the window stood when Atlas put it in full screen, on the display it went full screen on. */
  restoreBounds: ScreenRect | null;
}

let watched: Watched | null = null;

/** The open popout's Electron handle, or null while there is none or it has no `remote`. */
function popoutHandle(): (ElectronWindowHandle & { watch: Watched }) | null {
  if (!watched || watched.popout.closed) return null;
  const handle = electronWindowOf(watched.popout);
  return handle ? { ...handle, watch: watched } : null;
}

function sameRect(a: ScreenRect, b: ScreenRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function inFullScreen(window: ElectronBrowserWindow): boolean {
  return window.isFullScreen() || window.isSimpleFullScreen();
}

/** The display the main Obsidian window is on, asked through its own `remote`. */
function mainDisplay(screen: ElectronScreen, main: Window): ElectronDisplay | null {
  const mainWindow = electronWindowOf(main)?.window;
  return mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()) : null;
}

/** The display the TV most likely is: the largest of those the main window is not on. */
function otherDisplay(screen: ElectronScreen, main: ElectronDisplay | null): ElectronDisplay | null {
  const others = screen.getAllDisplays().filter((display) => display.id !== main?.id);
  const area = (display: ElectronDisplay): number => display.bounds.width * display.bounds.height;
  return others.reduce<ElectronDisplay | null>((best, display) => (best && area(best) >= area(display) ? best : display), null);
}

/**
 * Reads what the popout and the screens say now into the store's `fullScreen` and
 * `secondDisplay`: for a caller about to offer full screen, since a display can come or go
 * without either window noticing.
 */
export function refreshPlayerWindowDisplay(): void {
  const handle = popoutHandle();
  if (!handle) {
    playerWindowStore.setState({ fullScreen: false, secondDisplay: false });
    return;
  }
  try {
    const main = mainDisplay(handle.screen, handle.watch.main);
    playerWindowStore.setState({
      fullScreen: inFullScreen(handle.window),
      secondDisplay: main !== null && otherDisplay(handle.screen, main) !== null,
    });
  } catch (error) {
    console.error('[playerWindowDisplay] Could not read the player window\'s display:', error);
  }
}

/** Resolves once the popout reports a new size, or after `SETTLE_MS` where it reports none (already that size). */
function nextResize(popout: Window): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      popout.clearTimeout(timer);
      popout.removeEventListener('resize', done);
      resolve();
    };
    const timer = popout.setTimeout(done, SETTLE_MS);
    popout.addEventListener('resize', done);
  });
}

/** Whether the player window is open and its `BrowserWindow` can be put in full screen from here. */
export function fullScreenAvailable(): boolean {
  return Platform.isDesktopApp && popoutHandle() !== null;
}

/** Whether the player window is in full screen now, by whatever means it got there. */
export function isPlayerWindowFullScreen(): boolean {
  const handle = popoutHandle();
  try {
    return handle !== null && inFullScreen(handle.window);
  } catch {
    return false;
  }
}

/**
 * Puts the player window in full screen, or takes it out. On a display of its own it stays where
 * it is; on the main window's display it is moved to another display first, and where there is
 * none it stays as it is: full screen there would cover the GM's own Obsidian. macOS uses simple
 * full screen (instant, no Space of its own); Windows and Linux real full screen. Leaving puts the
 * window back where it stood when it entered (on the TV, where it was moved there). Never
 * rejects: what could not be done is logged, and the store says what is.
 */
export async function setPlayerWindowFullScreen(on: boolean): Promise<void> {
  const handle = popoutHandle();
  if (!handle) return;
  const { screen, window, watch } = handle;
  try {
    if (inFullScreen(window) === on) return;
    if (on) {
      const mainScreen = mainDisplay(screen, watch.main);
      const target = otherDisplay(screen, mainScreen);
      if (!mainScreen || !target) return;
      const resized = nextResize(watch.popout);
      // `setBounds` is ignored in full screen, and the window is not in it here
      if (screen.getDisplayMatching(window.getBounds()).id === mainScreen.id) window.setBounds(target.workArea);
      watch.restoreBounds = window.getBounds();
      if (Platform.isMacOS) window.setSimpleFullScreen(true);
      else window.setFullScreen(true);
      await resized;
    } else {
      const resized = nextResize(watch.popout);
      if (window.isSimpleFullScreen()) window.setSimpleFullScreen(false);
      if (window.isFullScreen()) window.setFullScreen(false);
      await resized;
      // macOS gives a window that was zoomed (filled its screen) its unzoomed frame back, which may lie on the GM's display
      const restore = watch.restoreBounds;
      watch.restoreBounds = null;
      if (restore && !inFullScreen(window) && !sameRect(window.getBounds(), restore)) window.setBounds(restore);
    }
  } catch (error) {
    console.error('[playerWindowDisplay] Could not change the player window\'s full screen:', error);
  } finally {
    refreshPlayerWindowDisplay();
  }
}

/**
 * Follows `popout`, the open player window, until the returned function is called: the store's
 * `fullScreen` and `secondDisplay` are read now and kept current (see the module's comment).
 * `main` is the main Obsidian window, whose display the TV is not.
 */
export function watchPlayerWindowDisplay(popout: Window, main: Window): () => void {
  const watch: Watched = { popout, main, restoreBounds: null };
  watched = watch;
  let timer: number | null = null;
  const onResize = (): void => {
    if (timer !== null) popout.clearTimeout(timer);
    timer = popout.setTimeout(() => {
      timer = null;
      refreshPlayerWindowDisplay();
    }, RESIZE_SYNC_MS);
  };
  popout.addEventListener('resize', onResize);
  popout.addEventListener('focus', refreshPlayerWindowDisplay);
  main.addEventListener('focus', refreshPlayerWindowDisplay);
  refreshPlayerWindowDisplay();
  return (): void => {
    if (timer !== null) popout.clearTimeout(timer);
    popout.removeEventListener('resize', onResize);
    popout.removeEventListener('focus', refreshPlayerWindowDisplay);
    main.removeEventListener('focus', refreshPlayerWindowDisplay);
    if (watched === watch) watched = null;
  };
}
