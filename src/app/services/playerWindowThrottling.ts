import { electronWindowOf, webContentsOf, type ElectronWebContents } from './electronRemote';

/**
 * Keeps the player window drawing while other windows cover it.
 *
 * Obsidian opens popouts with Electron's background throttling on. Chromium then reports a popout
 * that another window covers, or that is minimised, as hidden: its animation frames stop, and its
 * compositor stops presenting, so the OS window and any screen capture of it (a stream to Discord)
 * keep the last picture. On one screen the player window drops behind Obsidian as soon as the GM
 * clicks the main window. Drawing its frames from the main window cannot help: a hidden popout
 * presents nothing. So throttling is switched off for the popout while it is the player window,
 * and on again when it stays open as something else. Without the API (not public, feature-detected)
 * the window works as before.
 */

let warned = false;

/** Sets the page's background throttling; false where Electron refused. */
function setThrottling(contents: ElectronWebContents, allowed: boolean): boolean {
  try {
    contents.setBackgroundThrottling(allowed);
    return true;
  } catch (error) {
    if (!warned) console.warn('[playerWindowThrottling] Could not change the player window\'s background throttling:', error);
    warned = true;
    return false;
  }
}

/**
 * Switches background throttling off for `popout`, the player window, until the returned function
 * is called, which switches it on again if the popout is still open.
 */
export function keepPlayerWindowAwake(popout: Window): () => void {
  const handle = electronWindowOf(popout);
  const contents = handle ? webContentsOf(handle.window) : null;
  if (!contents || !setThrottling(contents, false)) return (): void => undefined;
  return (): void => {
    if (!popout.closed) setThrottling(contents, true);
  };
}
