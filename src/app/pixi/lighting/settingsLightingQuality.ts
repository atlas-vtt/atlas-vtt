import { LIGHTING_QUALITY, type LightingQualitySource } from '../../lighting/lightingQuality';
import type { SettingsService } from '../../services/SettingsService';

/** The lighting quality chosen in Atlas' settings on this device, followed while the view lives. */
export function settingsLightingQuality(settings: SettingsService | undefined): LightingQualitySource | undefined {
  if (!settings) return undefined;
  return {
    current: () => LIGHTING_QUALITY[settings.getLightingQuality()],
    onChange: (listener) => settings.onChange(listener),
  };
}
