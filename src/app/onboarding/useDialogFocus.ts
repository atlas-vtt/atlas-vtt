import { useEffect, type RefObject } from 'react';

/** Escape belongs to the top dialog; Tab stays inside it and focus returns on dismissal. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focus = (): void => {
      const card = ref.current;
      (card?.querySelector<HTMLElement>('[data-autofocus]') ?? card?.querySelector<HTMLElement>('button, input'))?.focus();
    };
    focus();
    const frame = window.requestAnimationFrame(focus);
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); onClose();
      } else if (event.key === 'Tab') {
        const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]') ?? []);
        if (!items.length) return;
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
        event.preventDefault(); event.stopImmediatePropagation(); items[next]?.focus();
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener('keydown', keydown, true); if (previous?.isConnected) previous.focus(); };
  }, [ref, onClose]);
}
