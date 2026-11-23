import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return (): void => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function isOnline(): boolean {
  return window.navigator.onLine;
}

/** Whether the browser believes it has a network connection, following its `online` and `offline` events. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, isOnline);
}
