import type { App } from 'obsidian';
import { vi } from 'vitest';
import type { ExperimentalFeatureId } from '../../src/app/experimental/experimentalFeatures';
import { SettingsService } from '../../src/app/services/SettingsService';

/** The features each test's settings answer as switched on, kept beside the spy that answers. */
const switchedOn = new WeakMap<SettingsService, Set<ExperimentalFeatureId>>();

/**
 * An app whose GM switched `feature` on, beside any feature switched on before. The answer is
 * given directly: a real `setExperimental` schedules a save, which first reads the vault's
 * settings file.
 */
function withFeature<T>(app: T, feature: ExperimentalFeatureId): T {
  const settings = SettingsService.forApp(app as App) ?? new SettingsService(app as App);
  let on = switchedOn.get(settings);
  // A spy restored after an earlier test answers no more; start a new one.
  if (!on || !vi.isMockFunction(settings.isExperimentalOn)) {
    const features = new Set<ExperimentalFeatureId>();
    vi.spyOn(settings, 'isExperimentalOn').mockImplementation((id) => features.has(id));
    switchedOn.set(settings, features);
    on = features;
  }
  on.add(feature);
  return app;
}

/** An app whose GM switched dynamic lighting on. */
export function withDynamicLighting<T>(app: T): T {
  return withFeature(app, 'dynamicLighting');
}

/** An app whose GM switched the statblock editor on. */
export function withStatblockEditor<T>(app: T): T {
  return withFeature(app, 'statblockEditor');
}

/** An app whose GM switched online play on. */
export function withOnlinePlay<T>(app: T): T {
  return withFeature(app, 'onlinePlay');
}
