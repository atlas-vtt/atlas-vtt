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
