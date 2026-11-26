import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { AccountApi } from './AccountControl.ts';
import type { AccountView } from './accountView.ts';

interface AccountStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => AccountView;
}

/** `view()` makes a new object on every call, so the store keeps the one it read until the account changes. */
function accountStore(account: AccountApi): AccountStore {
  let shown = account.view();
  return {
    subscribe: (listener) => {
      const stop = account.onChange(() => {
        shown = account.view();
        listener();
      });
      shown = account.view();
      return stop;
    },
    snapshot: () => shown,
  };
}

/** Follows the account for a component, and asks the relay what it may host when the component shows. */
export function useAccountView(account: AccountApi): AccountView {
  const store = useMemo(() => accountStore(account), [account]);
  useEffect(() => void account.refresh(), [account]);
  return useSyncExternalStore(store.subscribe, store.snapshot);
}
