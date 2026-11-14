import type { App } from 'obsidian';
import { t } from '../i18n';
import { SettingsService } from '../services/SettingsService';

/**
 * Features the GM switches on in the command palette's Experimental features page. All are off
 * until then, and the choice is stored in Atlas' settings (`AtlasSettings.experimental`) under
 * the feature's id, so never rename one.
 */
export const EXPERIMENTAL_FEATURES = [
  {
    id: 'statblockEditor',
    label: t('experimental.statblockEditor'),
    hint: t('experimental.statblockEditorHint'),
  },
  {
    id: 'onlinePlay',
    label: t('experimental.onlinePlay'),
    hint: t('experimental.onlinePlayHint'),
  },
  {
    id: 'sound',
    label: t('audio.experimental.label'),
    hint: t('audio.experimental.hint'),
  },
] as const;

export type ExperimentalFeatureId = (typeof EXPERIMENTAL_FEATURES)[number]['id'];

/** Whether the GM switched the feature on; off wherever Atlas' settings cannot be reached. */
export function experimentalFeatureOn(app: App | undefined, id: ExperimentalFeatureId): boolean {
  return SettingsService.forApp(app)?.isExperimentalOn(id) ?? false;
}
