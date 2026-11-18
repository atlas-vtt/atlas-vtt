import { useSyncExternalStore } from 'react';
import { deviceProfile, type DeviceProfile } from './deviceProfile';

/** Whether the pointer is coarse (a finger) now; follows a mouse being attached or taken away. */
export function useCoarsePointer(profile: DeviceProfile = deviceProfile()): boolean {
  return useSyncExternalStore(
    (onChange) => profile.onPointerChange(onChange),
    () => profile.pointer === 'coarse',
  );
}
