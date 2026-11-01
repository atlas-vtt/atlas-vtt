import { Platform } from 'obsidian';
import { isRecord } from '../utils/guards';

/**
 * The part of Electron's `@electron/remote` Atlas uses: the player window's own `BrowserWindow`
 * and the screens it can stand on. Obsidian exposes `require('electron').remote` in every window
 * of the desktop app, but documents none of it, and could drop it one day: everything here is
 * feature-detected, and a window where it is missing reads as one without it.
 */

/** A rectangle in Electron's screen coordinates (device independent pixels). */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElectronDisplay {
  id: number;
  bounds: ScreenRect;
  /** The display less the menu bar, dock or task bar. */
  workArea: ScreenRect;
}

export interface ElectronScreen {
  getAllDisplays(): ElectronDisplay[];
  getDisplayMatching(rect: ScreenRect): ElectronDisplay;
}

export interface ElectronBrowserWindow {
  getBounds(): ScreenRect;
  /** Ignored while the window is in full screen. */
  setBounds(bounds: ScreenRect): void;
  isFullScreen(): boolean;
  setFullScreen(flag: boolean): void;
  /** macOS only: full screen without a Space of its own or its animation. */
  isSimpleFullScreen(): boolean;
  setSimpleFullScreen(flag: boolean): void;
}

/** One window's view of Electron: the screens, and the window it was asked from. */
export interface ElectronWindowHandle {
  screen: ElectronScreen;
  window: ElectronBrowserWindow;
}

const SCREEN_METHODS = ['getAllDisplays', 'getDisplayMatching'] as const;
const WINDOW_METHODS = ['getBounds', 'setBounds', 'isFullScreen', 'setFullScreen', 'isSimpleFullScreen', 'setSimpleFullScreen'] as const;

/** Whether `value` is an object answering every one of `names` (remote objects are proxies whose methods are functions). */
function hasMethods(value: unknown, names: readonly string[]): value is object {
  return (isRecord(value) || typeof value === 'function') && names.every((name) => typeof Reflect.get(value, name) === 'function');
}

/**
 * Electron's screens and the `BrowserWindow` of `win`, asked through `win`'s own `require` (a
 * popout's require answers for the popout); null outside the desktop app, where `remote` is
 * missing, or where it does not have what Atlas uses.
 */
export function electronWindowOf(win: Window): ElectronWindowHandle | null {
  if (!Platform.isDesktopApp) return null;
  try {
    const load: unknown = Reflect.get(win, 'require');
    if (typeof load !== 'function') return null;
    const electron: unknown = Reflect.apply(load, win, ['electron']);
    const remote: unknown = isRecord(electron) ? electron.remote : null;
    if (!hasMethods(remote, ['getCurrentWindow'])) return null;
    const screen: unknown = Reflect.get(remote, 'screen');
    if (!hasMethods(screen, SCREEN_METHODS)) return null;
    const window: unknown = Reflect.apply(Reflect.get(remote, 'getCurrentWindow') as () => unknown, remote, []);
    if (!hasMethods(window, WINDOW_METHODS)) return null;
    // Checked above: both answer every method the interfaces name
    return { screen: screen as unknown as ElectronScreen, window: window as unknown as ElectronBrowserWindow };
  } catch {
    return null;
  }
}
