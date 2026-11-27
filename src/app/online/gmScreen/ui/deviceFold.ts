import type { GmScreenDeviceView } from '../gmScreenView.ts';

/** Whether the devices section is open, and what it last saw of the devices, to tell one that arrives. */
export interface DeviceFold {
  readonly open: boolean;
  readonly devices: number;
  readonly connected: number;
}

const connectedOf = (devices: readonly GmScreenDeviceView[]): number => devices.filter((device) => device.connected).length;

/** As the panel opens: open while any device is connected, folded while every device is away. */
export function restingFold(devices: readonly GmScreenDeviceView[]): DeviceFold {
  const connected = connectedOf(devices);
  return { open: connected > 0, devices: devices.length, connected };
}

/** After the devices changed: a device that arrives (allowed, or connected again) opens the section; else it stays as the GM left it. */
export function foldAfter(fold: DeviceFold, devices: readonly GmScreenDeviceView[]): DeviceFold {
  const connected = connectedOf(devices);
  if (devices.length === fold.devices && connected === fold.connected) return fold;
  const arrived = devices.length > fold.devices || connected > fold.connected;
  return { open: fold.open || arrived, devices: devices.length, connected };
}
