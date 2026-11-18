import { useSyncExternalStore } from 'react';
import { deviceProfile } from './deviceProfile';

const subscribe = (onChange: () => void): (() => void) => deviceProfile().onPointerChange(onChange);
const isCoarse = (): boolean => deviceProfile().pointer === 'coarse';

/** Whether the pointer is a finger now; follows a mouse being attached or taken away. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, isCoarse);
}
