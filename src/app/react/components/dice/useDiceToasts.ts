import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastPhase } from './DiceToast';
import type { PreparedDiceRoll } from './diceSourcePresentation';

export interface ToastEntry extends PreparedDiceRoll {
  id: string;
  phase: ToastPhase;
}

/** A shown card's pending timers; `leaving` once its removal is the only one. */
interface CardTimers {
  timers: number[];
  leaving: boolean;
}

const ENTER_DURATION = 350;
const AUTO_DISMISS = 7000;
const EXIT_DURATION = 300;

function clearTimers(card: CardTimers): void {
  card.timers.forEach((timer) => window.clearTimeout(timer));
}

/** Result cards: each enters, stays a while and leaves, or leaves early on click. */
export function useDiceToasts(): {
  toasts: ToastEntry[];
  addToast: (roll: PreparedDiceRoll) => void;
  dismissToast: (id: string) => void;
  dismissAllToasts: () => void;
} {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  // No timer may outlive its card or this display: it would write into a tree that is gone.
  const cards = useRef(new Map<string, CardTimers>());

  useEffect(() => {
    const shown = cards.current;
    return (): void => {
      shown.forEach(clearTimers);
      shown.clear();
    };
  }, []);

  const setPhase = useCallback((id: string, phase: ToastPhase): void => {
    setToasts((prev) => prev.map((t) => (t.id === id && t.phase !== 'exiting' ? { ...t, phase } : t)));
  }, []);

  const remove = useCallback((id: string): void => {
    cards.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissToast = useCallback((id: string): void => {
    const card = cards.current.get(id);
    if (!card || card.leaving) return;
    clearTimers(card);
    card.leaving = true;
    card.timers = [window.setTimeout(() => remove(id), EXIT_DURATION)];
    setPhase(id, 'exiting');
  }, [setPhase, remove]);

  const addToast = useCallback((roll: PreparedDiceRoll): void => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...roll, id, phase: 'entering' }]);
    cards.current.set(id, {
      leaving: false,
      timers: [
        window.setTimeout(() => setPhase(id, 'visible'), ENTER_DURATION),
        window.setTimeout(() => dismissToast(id), AUTO_DISMISS),
      ],
    });
  }, [setPhase, dismissToast]);

  const dismissAllToasts = useCallback((): void => {
    for (const toast of toasts) dismissToast(toast.id);
  }, [toasts, dismissToast]);

  return { toasts, addToast, dismissToast, dismissAllToasts };
}
