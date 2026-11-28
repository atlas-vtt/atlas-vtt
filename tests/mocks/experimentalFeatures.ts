import type { App } from 'obsidian';
import { vi } from 'vitest';
import type { ExperimentalFeatureId } from '../../src/app/experimental/experimentalFeatures';
import { SettingsService, type PreferenceName } from '../../src/app/services/SettingsService';

/** The features each test's settings answer as switched on, kept beside the spy that answers. */
const switchedOn = new WeakMap<SettingsService, Set<ExperimentalFeatureId>>();

/**
 * Settings whose GM switched `feature` on, beside any feature switched on before. The answer is
 * given directly: a real change of the `experimental` preference schedules a save, which first
 * reads the vault's settings file.
 */
export function switchOn(settings: SettingsService, feature: ExperimentalFeatureId): void {
  let on = switchedOn.get(settings);
  // A spy restored after an earlier test answers no more; start a new one.
  if (!on || !vi.isMockFunction(settings.get)) {
    const features = new Set<ExperimentalFeatureId>();
    const read = settings.get.bind(settings) as (name: PreferenceName) => unknown;
    vi.spyOn(settings, 'get').mockImplementation(((name: PreferenceName) => (name === 'experimental'
      ? { ...(read(name) as object), ...Object.fromEntries([...features].map((id) => [id, true])) }
      : read(name))) as SettingsService['get']);
    switchedOn.set(settings, features);
    on = features;
  }
  on.add(feature);
}

function withFeature<T>(app: T, feature: ExperimentalFeatureId): T {
  switchOn(SettingsService.forApp(app as App) ?? new SettingsService(app as App), feature);
  return app;
}

/** An app whose GM switched the statblock editor on. */
export function withStatblockEditor<T>(app: T): T {
  return withFeature(app, 'statblockEditor');
}

/** An app whose GM switched online play on. */
export function withOnlinePlay<T>(app: T): T {
  return withFeature(app, 'onlinePlay');
}
