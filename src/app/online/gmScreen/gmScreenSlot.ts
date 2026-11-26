import type { AccountApi } from '../gm/account/AccountControl.ts';
import type { GmScreenSession } from './GmScreenSession.ts';

/** What the DM screen's control drives: the session, and the account it signs in with. */
export interface GmScreenHost {
  readonly session: GmScreenSession;
  readonly account: AccountApi;
}

let current: GmScreenHost | null = null;
const listeners = new Set<() => void>();

/** Names what the DM screen's control drives: online play's session and account while it is loaded, else none. */
export function setGmScreenHost(host: GmScreenHost | null): void {
  current = host;
  for (const listener of [...listeners]) listener();
}

/** What the DM screen's control drives, or null while online play is switched off. */
export const gmScreenHost = (): GmScreenHost | null => current;

/** Calls `listener` when another host is named; returns what stops it. */
export function onGmScreenHost(listener: () => void): () => void {
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
