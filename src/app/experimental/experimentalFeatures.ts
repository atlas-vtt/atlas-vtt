import type { App } from 'obsidian';
import { SettingsService } from '../services/SettingsService';

/**
 * Features the GM switches on in the command palette's Experimental features page. All are off
 * until then, and the choice is stored in Atlas' settings (`AtlasSettings.experimental`) under
 * the feature's id, so never rename one.
 */
export const EXPERIMENTAL_FEATURES = [
  {
    id: 'statblockEditor',
    label: 'Statblock editor',
    hint: 'Statblock roles and templates: a collection\'s Statblocks settings, and editing statblocks in Atlas. While off, statblocks show as before.',
  },
  {
    id: 'onlinePlay',
    label: 'Online play',
    hint: 'Host a table that players join from their browsers: the online control at the bottom left of a map, and the account settings. While off, Atlas connects to nothing.',
  },
] as const;

export type ExperimentalFeatureId = (typeof EXPERIMENTAL_FEATURES)[number]['id'];

/** Whether the GM switched the feature on; off wherever Atlas' settings cannot be reached. */
export function experimentalFeatureOn(app: App | undefined, id: ExperimentalFeatureId): boolean {
  return SettingsService.forApp(app)?.isExperimentalOn(id) ?? false;
}
