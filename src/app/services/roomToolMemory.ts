import type { DeviceStorage } from './deviceSettings';

/** Whether the rooms mode's Stabilization is on on this device: `on` or `off`, never a falsy value Obsidian would drop. A steadied hand is the device's, not the scene's. */
export const ROOM_STABILIZER_STORAGE_KEY = 'atlas-vtt:room-stabilizer';

export function loadStabilizer(storage: DeviceStorage): boolean {
  try {
    return storage.loadLocalStorage(ROOM_STABILIZER_STORAGE_KEY) === 'on';
  } catch (error) {
    console.error('[Atlas] Could not read the rooms brush\'s stabilization of this device', error);
    return false;
  }
}

export function saveStabilizer(storage: DeviceStorage, on: boolean): void {
  try {
    storage.saveLocalStorage(ROOM_STABILIZER_STORAGE_KEY, on ? 'on' : 'off');
  } catch (error) {
    console.error('[Atlas] Could not save the rooms brush\'s stabilization of this device', error);
  }
}
