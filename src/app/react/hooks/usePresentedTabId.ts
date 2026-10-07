import { useCallback, useSyncExternalStore } from 'react';
import { presentedScene, presentedTabIdIn } from '../../services/PresentedScene';
import type { TabMetaStore } from '../../stores/tabMetaStore';

/** The tab of this view that players see (player window or any presentation target), or null. */
export function usePresentedTabId(tabStore: TabMetaStore): string | null {
  const subscribe = useCallback(
    (onChange: () => void): (() => void) => presentedScene.subscribe({ presented: onChange, held: onChange, cleared: onChange }),
    [],
  );
  return useSyncExternalStore(subscribe, () => presentedTabIdIn(presentedScene.current(), tabStore));
}
