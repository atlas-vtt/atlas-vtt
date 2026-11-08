import { portalHost } from '../../host/portalHost';

/** Longest a toast's exit may take before it goes regardless: no transition ends where motion is switched off. */
const EXIT_FALLBACK_MS = 400;

/** Show a temporary toast notification styled to match Atlas VTT. */
export function showAtlasToast(message: string, duration = 3000): void {
  const host = portalHost();
  const container =
    host.querySelector<HTMLElement>('.atlas-toast-container') ??
    // Atlas' styles hold under `.atlas-vtt-plugin` (`styles/main.scss`), which the portal host under <body> does not
    // carry: without it the container lay unstyled below the window and no toast was ever seen.
    host.createDiv({ cls: 'atlas-vtt-plugin atlas-toast-container', attr: { role: 'status', 'aria-live': 'polite' } });
  const toast = container.createDiv({ cls: 'atlas-toast', text: message });

  window.requestAnimationFrame(() => {
    toast.classList.add('atlas-toast-visible');
  });

  window.setTimeout(() => {
    toast.classList.add('atlas-toast-exiting');
    const remove = (): void => {
      if (!toast.isConnected) return;
      toast.remove();
      if (container.children.length === 0) container.remove();
    };
    toast.addEventListener('transitionend', remove, { once: true });
    window.setTimeout(remove, EXIT_FALLBACK_MS);
  }, duration);
}
