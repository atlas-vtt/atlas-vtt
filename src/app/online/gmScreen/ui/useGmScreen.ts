import { useSyncExternalStore } from 'react';
import type { AccountApi } from '../../gm/account/AccountControl.ts';
import type { GmScreenSession, GmScreenView } from '../GmScreenSession.ts';
import { gmScreenHost, onGmScreenHost } from '../gmScreenSlot.ts';

/** The session the DM screen's control drives, what it shows now, and the account it signs in with; null while online play is off. */
export interface GmScreenHandle {
  readonly session: GmScreenSession;
  readonly view: GmScreenView;
  readonly account: AccountApi;
}

let shown: GmScreenHandle | null = null;

function snapshot(): GmScreenHandle | null {
  const host = gmScreenHost();
  if (host === null) return (shown = null);
  const view = host.session.view();
  if (shown?.session !== host.session || shown.account !== host.account || shown.view !== view) shown = { ...host, view };
  return shown;
}

function subscribe(listener: () => void): () => void {
  let stopSession = gmScreenHost()?.session.onChange(listener) ?? ((): void => undefined);
  const stopSlot = onGmScreenHost(() => {
    stopSession();
    stopSession = gmScreenHost()?.session.onChange(listener) ?? ((): void => undefined);
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
