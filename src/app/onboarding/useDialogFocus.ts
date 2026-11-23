import { useEffect, useRef, type RefObject } from 'react';

/**
 * Escape belongs to the top dialog; Tab stays inside it and focus returns on dismissal. Keys are heard in the window
 * the dialog renders in, so a dialog in a popout listens there. `enabled` false (a dialog fading out) lets go of the
 * keys at once and hands no focus back, since what opened in its place has taken it.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void, enabled = true): void {
  // Read by the cleanup, which runs after the render that switched it off.
  const restores = useRef(enabled);
  restores.current = enabled;
  useEffect(() => {
    if (!enabled) return undefined;
    const doc = ref.current?.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    const previous = doc.activeElement as HTMLElement | null;
    const focus = (): void => {
      const card = ref.current;
      (card?.querySelector<HTMLElement>('[data-autofocus]') ?? card?.querySelector<HTMLElement>('button, input'))?.focus();
    };
    focus();
    const frame = win.requestAnimationFrame(focus);
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); onClose();
      } else if (event.key === 'Tab') {
        const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]') ?? []);
        if (!items.length) return;
        const index = items.indexOf(doc.activeElement as HTMLElement);
        const next = (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
        event.preventDefault(); event.stopImmediatePropagation(); items[next]?.focus();
      }
    };
    win.addEventListener('keydown', keydown, true);
    return () => { win.cancelAnimationFrame(frame); win.removeEventListener('keydown', keydown, true); if (restores.current && previous?.isConnected) previous.focus(); };
  }, [ref, onClose, enabled]);
}
