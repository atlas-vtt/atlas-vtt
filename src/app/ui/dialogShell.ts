import { setIcon } from 'obsidian';
import { portalHost } from '../host/portalHost';
import { t } from '../i18n';
import { keepTabWithin } from '../packages/components/primitives/tabStops';

export interface DialogShell {
  /** Backdrop covering the window; removing it closes the dialog. */
  root: HTMLElement;
  /** The dialog's body, under its header: what it says and asks. */
  dialog: HTMLElement;
  /** The row of buttons at the dialog's foot, below a divider; not shown while empty. */
  footer: HTMLElement;
}

export interface DialogShellOptions {
  /** Lucide icon before the title, as the asset manager's dialogs show one. */
  icon?: string | undefined;
  /** Called by the header's close button; without it the dialog has none. */
  onDismiss?: () => void;
}

let shellCount = 0;

/** Marks Atlas' host while it holds a dialog, so `tooltip.css` hides the tooltips behind it. */
const HOLDS_DIALOG = 'atlas-portal-host--dialog';

/** Marks `host` until `root` and every other dialog in it are gone: callers close a dialog by removing its root. */
function markHostWhileOpen(host: HTMLElement, root: HTMLElement): void {
  host.addClass(HOLDS_DIALOG);
  const observer = new MutationObserver(() => {
    if (root.isConnected) return;
    observer.disconnect();
    if (!host.querySelector(':scope > .atlas-text-dialog-backdrop')) host.removeClass(HOLDS_DIALOG);
  });
  observer.observe(host, { childList: true });
}

/**
 * Mounts a centred, titled dialog in Atlas' host under `document.body`, in the frame every Atlas
 * dialog has (header with the title and the close button, body, footer). It stacks above Atlas
 * overlays such as the asset manager and the dialogs opened from it, which Obsidian's own modals
 * do not. It holds the keyboard while open: Tab stays inside, and no key pressed in it reaches
 * the listeners behind it.
 */
export function createDialogShell(title: string, options: DialogShellOptions = {}): DialogShell {
  const host = portalHost();
  const root = host.createDiv({ cls: 'atlas-vtt-plugin atlas-text-dialog-backdrop' });
  markHostWhileOpen(host, root);
  // Focusable itself, so a press on its text keeps focus in the dialog rather than on the body behind it.
  const frame = root.createDiv({ cls: 'atlas-text-dialog', attr: { role: 'dialog', 'aria-modal': 'true', tabindex: '-1' } });
  // The dialog is modal for the keyboard too: Tab cycles its own controls, and no key pressed in it reaches the
  // window behind (the asset manager switches its tabs on Tab and acts on letters and digits).
  root.addEventListener('keydown', (event) => {
    keepTabWithin(frame, event);
    event.stopPropagation();
  });

  const header = frame.createDiv({ cls: 'atlas-text-dialog__header' });
  const heading = header.createEl('h3', { cls: 'atlas-text-dialog__title' });
  if (options.icon) setIcon(heading.createSpan({ cls: 'atlas-text-dialog__icon', attr: { 'aria-hidden': 'true' } }), options.icon);
  heading.createSpan({ text: title });
  const titleId = `atlas-text-dialog-title-${++shellCount}`;
  heading.id = titleId;
  frame.setAttribute('aria-labelledby', titleId);

  const { onDismiss } = options;
  if (onDismiss) {
    // CloseButton's look and place (`atlas-close-btn`), in a dialog built without React.
    const close = header.createEl('button', {
      cls: 'atlas-close-btn btn btn--ghost btn--icon',
      attr: { type: 'button', 'aria-label': t('common.close') },
    });
    setIcon(close, 'x');
    close.addEventListener('click', () => onDismiss());
  }

  const dialog = frame.createDiv({ cls: 'atlas-text-dialog__body' });
  const footer = frame.createDiv({ cls: 'atlas-text-dialog__footer' });
  return { root, dialog, footer };
}
