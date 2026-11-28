import type { ExperimentalFeatureId } from '../../experimental/experimentalFeatures';
import { useAtlasSettings } from '../../keyboard/useMapHotkeys';
import type { SettingsService } from '../../services/SettingsService';

/** Whether an experimental feature is switched on, kept current as the GM switches it. */
export function useExperimentalFeature(id: ExperimentalFeatureId, settings?: SettingsService): boolean {
  return useAtlasSettings(settings)?.get('experimental')[id] === true;
}
