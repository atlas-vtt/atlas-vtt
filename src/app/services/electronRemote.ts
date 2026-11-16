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

/** The page a `BrowserWindow` shows. */
export interface ElectronWebContents {
  /** Whether the page is throttled, and reported hidden, while its window is covered or minimised. */
  setBackgroundThrottling(allowed: boolean): void;
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

/** The page `window` shows; null where its `webContents` does not have what Atlas uses. */
export function webContentsOf(window: ElectronBrowserWindow): ElectronWebContents | null {
  try {
    const contents: unknown = Reflect.get(window, 'webContents');
    // Checked: it answers the one method the interface names
    return hasMethods(contents, ['setBackgroundThrottling']) ? contents as unknown as ElectronWebContents : null;
  } catch {
    return null;
  }
}

/** The window's system dialog for picking a folder; null where this Obsidian has none, or none Atlas can reach. */
export function nativeFolderPicker(win: Window): ((title: string) => Promise<string | null>) | null {
  if (!Platform.isDesktopApp) return null;
  try {
    const load: unknown = Reflect.get(win, 'require');
    if (typeof load !== 'function') return null;
    const electron: unknown = Reflect.apply(load, win, ['electron']);
    const remote: unknown = isRecord(electron) ? electron.remote : null;
    if (!hasMethods(remote, ['getCurrentWindow'])) return null;
    const dialog: unknown = Reflect.get(remote, 'dialog');
    if (!hasMethods(dialog, ['showOpenDialog'])) return null;
    const parent: unknown = Reflect.apply(Reflect.get(remote, 'getCurrentWindow') as () => unknown, remote, []);
    return async (title) => {
      const shown: unknown = await Reflect.apply(Reflect.get(dialog, 'showOpenDialog') as () => unknown, dialog, [parent, { title, properties: ['openDirectory', 'createDirectory'] }]);
      const paths: unknown = isRecord(shown) && shown.canceled !== true ? shown.filePaths : null;
      const first: unknown = Array.isArray(paths) ? paths[0] : null;
      return typeof first === 'string' ? first : null;
    };
  } catch {
    return null;
  }
}

/** Moves a path to the system's trash, Electron's `shell.trashItem`; null where it cannot be reached. Never falls back on deleting. */
export function systemTrash(win: Window): ((absolute: string) => Promise<void>) | null {
  if (!Platform.isDesktopApp) return null;
  try {
    const load: unknown = Reflect.get(win, 'require');
    if (typeof load !== 'function') return null;
    const electron: unknown = Reflect.apply(load, win, ['electron']);
    if (!isRecord(electron)) return null;
    const remote = electron.remote;
    const shell: unknown = hasMethods(electron.shell, ['trashItem']) ? electron.shell
      : (isRecord(remote) || typeof remote === 'function') ? Reflect.get(remote, 'shell') : null;
    if (!hasMethods(shell, ['trashItem'])) return null;
    return async (absolute) => {
      await Reflect.apply(Reflect.get(shell, 'trashItem') as () => unknown, shell, [absolute]);
    };
  } catch {
    return null;
  }
}
