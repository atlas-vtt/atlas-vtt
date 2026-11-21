import type { App } from 'obsidian';
import { StatblockPreviewWindow, type OutsideNote } from './StatblockPreviewWindow';
import type { TokenVitals } from './statblockVitalsSync';
import { watchPressOutside } from './previewByHand';

/** The class that lifts a preview window over a dialog (the asset manager). */
const OVER_MODAL = 'atlas-statblock-preview-window--over-modal';

let open: { preview: StatblockPreviewWindow; stop: () => void } | null = null;

function close(): void {
  open?.stop();
  open?.preview.hide();
  open = null;
}

/**
 * Opens the statblock of a token in a list (the asset manager) in the window Mod held over its
 * card opens, from the card's menu: in the middle of the window, over the dialog, one at a time,
 * until a press lands outside it or Escape is pressed. `outsideNote` is the note where the vault
 * does not have it (a collection being imported).
 */
export function previewStatblockByHand(app: App, notePath: string, token: TokenVitals, outsideNote?: OutsideNote): void {
  close();
  const win = activeWindow;
  const preview = new StatblockPreviewWindow(app, notePath, token, null, { x: win.innerWidth / 2, y: win.innerHeight / 3 }, outsideNote, undefined, undefined, win.document);
  preview.element?.addClass(OVER_MODAL);
  const stop = watchPressOutside(win.document, (target) => preview.element?.contains(target) === true, close);
  open = { preview, stop };
}
