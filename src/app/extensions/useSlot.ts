import { useSyncExternalStore } from 'react';
import type { SlotEntry, SlotRegistry } from './SlotRegistry';

/** The items of `registry`, drawn again when one is added, removed or the registry is invalidated. Read callbacks while rendering. */
export function useSlot<T>(registry: SlotRegistry<T>): ReadonlyArray<SlotEntry<T>> {
  useSyncExternalStore((listener) => registry.subscribe(listener), () => registry.version());
  return registry.list();
}
