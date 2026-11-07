import { portalHost } from '../host/portalHost';
export interface DialogShell {
  /** Backdrop covering the window; removing it closes the dialog. */
  root: HTMLElement;
  dialog: HTMLElement;
}

/**
 * Mounts a centred, titled dialog in Atlas' host under `document.body`. It stacks above Atlas
 * overlays such as the asset manager and the dialogs opened from it, which
 * Obsidian's own modals do not.
 */
export function createDialogShell(title: string): DialogShell {
  const root = portalHost().createDiv({ cls: 'atlas-vtt-plugin atlas-text-dialog-backdrop' });
  const dialog = root.createDiv({ cls: 'atlas-text-dialog' });
  dialog.createEl('h3', { cls: 'atlas-text-dialog__title', text: title });
  return { root, dialog };
}
