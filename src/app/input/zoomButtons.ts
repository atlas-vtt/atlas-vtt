import type { App } from 'obsidian';
import { deviceProfile } from '../platform/deviceProfile';
import { loadZoomButtons, saveZoomButtons } from '../services/deviceSettings';
import type { ZoomButtonsRow } from '../settings/navigationSettingsSection';

type DeviceStorage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;

const byApp = new WeakMap<DeviceStorage, ZoomButtonsChoice>();

/**
 * Whether the map shows its zoom buttons on this device while a mouse points. Under a finger
 * they always show: this is the choice of a GM who wants them at a desk too. One per app, read
 * from the device's storage once, and heard by every open map.
 */
export class ZoomButtonsChoice {
  static forApp(app: DeviceStorage): ZoomButtonsChoice {
    let choice = byApp.get(app);
    if (!choice) byApp.set(app, choice = new ZoomButtonsChoice(app));
    return choice;
  }

  private chosen: boolean;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: DeviceStorage) {
    this.chosen = loadZoomButtons(storage);
  }

  get shown(): boolean {
    return this.chosen;
  }

  setShown(shown: boolean): void {
    if (shown === this.chosen) return;
    this.chosen = shown;
    saveZoomButtons(this.storage, shown);
    for (const listener of this.listeners) listener();
  }

  /** Hears every change; returns the unsubscribe function. Stable across renders (`useSyncExternalStore`). */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

/** The settings row of the choice: offered while a mouse points, since a finger's buttons always show. */
export function zoomButtonsRow(app: DeviceStorage): ZoomButtonsRow {
  const choice = ZoomButtonsChoice.forApp(app);
  return {
    offered: deviceProfile().pointer === 'fine',
    get shown(): boolean {
      return choice.shown;
    },
    setShown: (shown) => choice.setShown(shown),
  };
}
