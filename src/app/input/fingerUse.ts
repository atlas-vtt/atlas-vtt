import type { App } from 'obsidian';
import { DEVICE_PREFERENCES, readDevice, writeDevice, type FingerUse } from '../services/deviceSettings';

type DeviceStorage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;

const byApp = new WeakMap<DeviceStorage, FingerSettings>();

/**
 * What fingers do in the drawing tools of this device. Until a pen has touched a map they are
 * the tool, as on every device without one. Once one has, the pen draws and fingers pan the map
 * (as drawing apps for tablets do), unless the GM chose otherwise in Atlas' settings.
 *
 * Read on every press, so the answers are kept here and the device's storage is read once.
 */
export class FingerSettings {
  static forApp(app: DeviceStorage): FingerSettings {
    let settings = byApp.get(app);
    if (!settings) byApp.set(app, settings = new FingerSettings(app));
    return settings;
  }

  private seen: boolean;
  private chosen: FingerUse | null;

  constructor(private readonly storage: DeviceStorage) {
    this.seen = readDevice(storage, DEVICE_PREFERENCES.penSeen);
    this.chosen = readDevice(storage, DEVICE_PREFERENCES.fingerUse);
  }

  /** A pen has touched a map on this device: the choice is offered in the settings. */
  get penSeen(): boolean {
    return this.seen;
  }

  get use(): FingerUse {
    if (!this.seen) return 'tool';
    return this.chosen ?? 'pan';
  }

  notePen(): void {
    if (this.seen) return;
    this.seen = true;
    writeDevice(this.storage, DEVICE_PREFERENCES.penSeen, true);
  }

  setUse(use: FingerUse): void {
    this.chosen = use;
    writeDevice(this.storage, DEVICE_PREFERENCES.fingerUse, use);
  }
}
