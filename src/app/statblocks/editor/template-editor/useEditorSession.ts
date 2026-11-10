import { useCallback, useSyncExternalStore } from 'react';
import type { EditorSession, SessionSnapshot } from './sessionTypes';

/** The session as it is now; re-renders on every new snapshot the session publishes. */
export function useSessionSnapshot(session: EditorSession): SessionSnapshot {
  // Called through the session, so methods that read `this` keep it.
  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const getSnapshot = useCallback(() => session.getSnapshot(), [session]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
