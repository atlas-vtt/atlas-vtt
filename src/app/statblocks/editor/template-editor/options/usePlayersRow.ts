import type { App } from 'obsidian';
import { useExperimentalFeature } from '../../../../react/hooks/useExperimentalFeature';
import { SettingsService } from '../../../../services/SettingsService';

/** Whether tiles' Options say what players may do with them: only while the GM has switched on playing at a shared table. */
export function usePlayersRow(app: App | undefined): boolean {
  return useExperimentalFeature('onlinePlay', app ? SettingsService.forApp(app) : undefined);
}
