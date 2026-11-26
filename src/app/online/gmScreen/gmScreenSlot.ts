import type { GmScreenSession } from './GmScreenSession.ts';

let current: GmScreenSession | null = null;
const listeners = new Set<() => void>();

/** Names the session the DM screen's control drives: online play's while it is loaded, else none. */
export function setGmScreenSession(session: GmScreenSession | null): void {
  current = session;
  for (const listener of [...listeners]) listener();
}

/** The session the DM screen's control drives, or null while online play is switched off. */
export const gmScreenSession = (): GmScreenSession | null => current;

/** Calls `listener` when another session is named; returns what stops it. */
export function onGmScreenSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let controls = 0;

/** A DM screen shows the control, which asks the GM about every device that knocks; returns what says it no longer does. */
export function showingGmScreenControl(): () => void {
  controls += 1;
  let shown = true;
  return () => {
    if (shown) controls -= 1;
    shown = false;
  };
}

/** Whether a DM screen shows the control now. */
export const gmScreenControlShown = (): boolean => controls > 0;
