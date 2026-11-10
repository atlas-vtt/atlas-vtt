import { portalHost } from '../../host/portalHost';
/** Show a temporary toast notification styled to match Atlas VTT. */
export function showAtlasToast(message: string, duration = 3000): void {
  const container =
    portalHost().querySelector<HTMLElement>('.atlas-toast-container') ??
    portalHost().createDiv({ cls: 'atlas-toast-container' });
  const toast = container.createDiv({ cls: 'atlas-toast', text: message });

  // Trigger enter animation
  window.requestAnimationFrame(() => {
    toast.classList.add('atlas-toast-visible');
  });

  // Auto dismiss
  window.setTimeout(() => {
    toast.classList.add('atlas-toast-exiting');
    toast.addEventListener('transitionend', () => {
      toast.remove();
      // Clean up container if empty
      if (container.children.length === 0) {
        container.remove();
      }
    });
  }, duration);
}
