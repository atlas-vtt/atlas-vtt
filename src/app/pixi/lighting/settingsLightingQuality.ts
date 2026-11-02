import type { LightingQualitySource } from '../../lighting/lightingQuality';
import type { SettingsService } from '../../services/SettingsService';

/** The graphics chosen on this device (the Graphics page), followed while the view lives. */
export function settingsLightingQuality(settings: SettingsService | undefined): LightingQualitySource | undefined {
  if (!settings) return undefined;
  return {
    current: () => settings.getGraphicsQuality(),
    onChange: (listener) => settings.onChange(listener),
  };
}
