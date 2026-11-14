import { portalHost } from '../../host/portalHost';

/** One thing to do about what a toast says ("Open folder"): a button after the message that does it and closes it. */
export interface AtlasToastAction {
  label: string;
  run: () => void;
}

/** A toast on screen. */
export interface AtlasToastHandle {
  /** Takes it away now, as its time would. */
  dismiss: () => void;
}

/** Longest its exit may take before it goes regardless: no transition ends where motion is switched off. */
const EXIT_FALLBACK_MS = 400;

/**
 * Shows a temporary toast styled to match Atlas VTT, above the asset manager and its dialogs. With an `action`, it
 * stays while the pointer rests on it, so the button can be reached.
 */
export function showAtlasToast(message: string, duration = 3000, action?: AtlasToastAction): AtlasToastHandle {
  const host = portalHost();
  const container =
    host.querySelector<HTMLElement>('.atlas-toast-container') ??
    // Atlas' styles hold under `.atlas-vtt-plugin` (`styles/main.scss`), which the host under <body> does not carry:
    // without it the container lay unstyled below the window and no toast was ever seen.
    host.createDiv({ cls: 'atlas-vtt-plugin atlas-toast-container' });
  const toast = container.createDiv({ cls: action ? 'atlas-toast atlas-toast--action' : 'atlas-toast' });
  // The message alone is announced: with the container as the live region, its button was read along with it, run
  // together ("…to Empty folderOpen folder"). Its text comes once the region is in the document, which a region that
  // arrives with its text is not announced from.
  const text = toast.createSpan({ cls: 'atlas-toast__text', attr: { role: 'status', 'aria-live': 'polite' } });

  let gone = false;
  const remove = (): void => {
    toast.remove();
    if (container.children.length === 0) container.remove();
  };
  const dismiss = (): void => {
    if (gone) return;
    gone = true;
    window.clearTimeout(timer);
    toast.classList.add('atlas-toast-exiting');
    toast.addEventListener('transitionend', remove, { once: true });
    window.setTimeout(remove, EXIT_FALLBACK_MS);
  };

  let timer = window.setTimeout(dismiss, duration);
  if (action) {
    const button = toast.createEl('button', { cls: 'atlas-toast__action', text: action.label, attr: { type: 'button' } });
    button.addEventListener('click', () => {
      dismiss();
      action.run();
    });
    toast.addEventListener('pointerenter', () => window.clearTimeout(timer));
    toast.addEventListener('pointerleave', () => {
      if (gone) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(dismiss, duration);
    });
  }

  // Trigger enter animation
  window.requestAnimationFrame(() => {
    text.textContent = message;
    toast.classList.add('atlas-toast-visible');
  });
  return { dismiss };
}
