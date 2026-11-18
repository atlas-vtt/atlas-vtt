import type { Plugin } from 'obsidian';
import { followVisualViewport, visibleViewport } from '../host/visibleViewport';
import { inEveryDocument } from './atlasDocuments';
import { deviceProfile, type DeviceProfile } from './deviceProfile';
import { focusedAtlasInput, revealInput } from './revealFocusedInput';

/** On `body` while an on-screen keyboard covers the window's lower part: how much of it, in px. `_viewport.scss` reads it. */
export const KEYBOARD_INSET_PROPERTY = '--atlas-keyboard-inset';

/** What of the layout viewport's height lies below the visual viewport: the keyboard, where the app does not resize the web view for it. */
export function keyboardInset(layoutHeight: number, visual: Pick<VisualViewport, 'offsetTop' | 'height'>): number {
  return Math.max(0, Math.round(layoutHeight - visual.offsetTop - visual.height));
}

/**
 * Follows one window's visual viewport: keeps the keyboard's inset on its `body`, and when the
 * viewport gets lower (the keyboard rises) brings the Atlas field being typed into back into
 * sight. Returns the function that stops it.
 */
export function watchKeyboard(doc: Document): () => void {
  const win = doc.defaultView;
  const visual = win?.visualViewport;
  if (!win || !visual) return () => undefined;
  let height = visual.height;
  let frame = 0;
  const reveal = (): void => {
    frame = 0;
    const input = focusedAtlasInput(doc);
    if (input) revealInput(input, visibleViewport(win));
  };
  const update = (): void => {
    const inset = keyboardInset(doc.documentElement.clientHeight, visual);
    if (inset > 0) doc.body.style.setProperty(KEYBOARD_INSET_PROPERTY, `${inset}px`);
    else doc.body.style.removeProperty(KEYBOARD_INSET_PROPERTY);
    const lower = visual.height < height;
    height = visual.height;
    // After the frame's layout: Obsidian shrinks its workspace for the keyboard in the same turn.
    if (lower && frame === 0) frame = win.requestAnimationFrame(reveal);
  };
  update();
  visual.addEventListener('resize', update);
  visual.addEventListener('scroll', update);
  return () => {
    visual.removeEventListener('resize', update);
    visual.removeEventListener('scroll', update);
    if (frame !== 0) win.cancelAnimationFrame(frame);
    doc.body.style.removeProperty(KEYBOARD_INSET_PROPERTY);
  };
}

/**
 * On mobile, where a keyboard rises over the window: placements ask the visual viewport
 * (`visibleViewport`), and every window keeps its inset and its focused field in sight. The
 * desktop app has no such keyboard and keeps asking its windows for their own size.
 */
export function registerKeyboardViewport(plugin: Plugin, profile: DeviceProfile = deviceProfile()): void {
  if (!profile.isMobileApp) return;
  plugin.register(followVisualViewport(true));
  inEveryDocument(plugin, watchKeyboard);
}
