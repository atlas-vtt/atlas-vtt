import { useCallback, useState } from 'react';
import type { ToastPhase } from './DiceToast';
import type { PreparedDiceRoll } from './diceSourcePresentation';

export interface ToastEntry extends PreparedDiceRoll {
  id: string;
  phase: ToastPhase;
}

const ENTER_DURATION = 350;
const AUTO_DISMISS = 7000;
const EXIT_DURATION = 300;

/** Result cards: each enters, stays a while and leaves, or leaves early on click. */
export function useDiceToasts(): {
  toasts: ToastEntry[];
  addToast: (roll: PreparedDiceRoll) => void;
  dismissToast: (id: string) => void;
  dismissAllToasts: () => void;
} {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const setPhase = useCallback((id: string, phase: ToastPhase): void => {
    setToasts((prev) => prev.map((t) => (t.id === id && t.phase !== 'exiting' ? { ...t, phase } : t)));
  }, []);

  const remove = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((roll: PreparedDiceRoll): void => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...roll, id, phase: 'entering' }]);
    window.setTimeout(() => setPhase(id, 'visible'), ENTER_DURATION);
    window.setTimeout(() => setPhase(id, 'exiting'), AUTO_DISMISS);
    window.setTimeout(() => remove(id), AUTO_DISMISS + EXIT_DURATION);
  }, [setPhase, remove]);

  const dismissToast = useCallback((id: string): void => {
    setPhase(id, 'exiting');
    window.setTimeout(() => remove(id), EXIT_DURATION);
  }, [setPhase, remove]);

  const dismissAllToasts = useCallback((): void => {
    for (const toast of toasts) dismissToast(toast.id);
  }, [toasts, dismissToast]);

  return { toasts, addToast, dismissToast, dismissAllToasts };
}
