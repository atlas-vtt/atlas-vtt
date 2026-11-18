import { isDesktopApp } from './desktopOnly';

/** A window as far as its clipboard goes: `ClipboardItem` is missing in some web views. */
type ClipboardWindow = Pick<Window, 'navigator'> & { readonly ClipboardItem?: typeof ClipboardItem };

/**
 * Whether `win` copies pictures (and anything else that is no plain text): its clipboard takes
 * items. Where it does not, the action that would copy one is not offered.
 */
export function canCopyItems(win: ClipboardWindow = activeWindow): boolean {
  return typeof win.ClipboardItem === 'function' && typeof win.navigator.clipboard?.write === 'function';
}

/**
 * Copies a text that is still on its way. WebKit takes a clipboard write only within the press
 * that asked for it, so a write after an `await` is refused there; an item made within the press
 * may hold a promise for its data. So outside the desktop app the item is made at once and takes
 * the text when it is there. The desktop app, and a web view without items, write the text once
 * it is there, as before. Rejects where the clipboard refused or `text` did.
 */
export async function copyTextWhenReady(text: Promise<string>, win: ClipboardWindow = activeWindow, desktop: boolean = isDesktopApp()): Promise<void> {
  if (desktop || !canCopyItems(win) || !win.ClipboardItem) {
    await win.navigator.clipboard.writeText(await text);
    return;
  }
  const data = text.then((value) => new Blob([value], { type: 'text/plain' }));
  await win.navigator.clipboard.write([new win.ClipboardItem({ 'text/plain': data })]);
}
