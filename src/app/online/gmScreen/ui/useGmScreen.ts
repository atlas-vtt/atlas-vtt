import { useSyncExternalStore } from 'react';
import type { GmScreenSession, GmScreenView } from '../GmScreenSession.ts';
import { gmScreenSession, onGmScreenSession } from '../gmScreenSlot.ts';

/** The session the DM screen's control drives and what it shows now; null while online play is off. */
export interface GmScreenHandle {
  readonly session: GmScreenSession;
  readonly view: GmScreenView;
}

let shown: GmScreenHandle | null = null;

function snapshot(): GmScreenHandle | null {
  const session = gmScreenSession();
  if (session === null) return (shown = null);
  const view = session.view();
  if (shown?.session !== session || shown.view !== view) shown = { session, view };
  return shown;
}

function subscribe(listener: () => void): () => void {
  let stopSession = gmScreenSession()?.onChange(listener) ?? ((): void => undefined);
  const stopSlot = onGmScreenSession(() => {
    stopSession();
    stopSession = gmScreenSession()?.onChange(listener) ?? ((): void => undefined);
    listener();
  });
  return () => {
    stopSession();
    stopSlot();
  };
}

/** Follows the GM screen's session for a component. */
export function useGmScreen(): GmScreenHandle | null {
  return useSyncExternalStore(subscribe, snapshot);
}
