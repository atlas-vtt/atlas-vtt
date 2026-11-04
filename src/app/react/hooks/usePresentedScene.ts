import { useCallback, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import { presentedSceneOf, type PresentedScene } from '../../services/presentedScene';

/** The scene presented to players on this device, followed as it changes; null while none is. */
export function usePresentedScene(app: App): PresentedScene | null {
  const presented = presentedSceneOf(app);
  const subscribe = useCallback((onChange: () => void) => presented.onChange(onChange), [presented]);
  return useSyncExternalStore(subscribe, () => presented.get());
}
