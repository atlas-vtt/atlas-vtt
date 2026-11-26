import { useCallback, useSyncExternalStore } from 'react';

/**
 * The rolls whose dice are still in the air on this page. A log shows a roll's result only once its
 * dice have landed, so it never tells the number before the throw does. A display that throws a roll
 * holds it from the moment the roll arrives (in the same task as its log entry, so no log draws the
 * number first) until its dice lie still or it closes; a roll no display throws is never held.
 */
const holds = new Map<string, number>();
const listeners = new Set<() => void>();

/** A hold nobody released (a display gone before it drew the roll) lets go by itself after this long. */
const MAX_HOLD_MS = 20_000;

function changed(): void {
  for (const listener of listeners) listener();
}

/** Holds a roll's result back; returns what lets it go, which does so once however often it is called. */
export function holdRoll(id: string): () => void {
  holds.set(id, (holds.get(id) ?? 0) + 1);
  changed();
  let held = true;
  const release = (): void => {
    if (!held) return;
    held = false;
    window.clearTimeout(timer);
    const left = (holds.get(id) ?? 1) - 1;
    if (left > 0) holds.set(id, left);
    else holds.delete(id);
    changed();
  };
  const timer = window.setTimeout(release, MAX_HOLD_MS);
  return release;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

/** Whether a log may show this roll's result: its dice have landed, or no display throws them. */
export function useRollLanded(id: string): boolean {
  const landed = useCallback((): boolean => !holds.has(id), [id]);
  return useSyncExternalStore(subscribe, landed, landed);
}
