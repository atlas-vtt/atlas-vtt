import { describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { settingsLightingQuality } from '../../src/app/pixi/lighting/settingsLightingQuality';
import { SettingsService } from '../../src/app/services/SettingsService';
import { LIGHTING_QUALITY } from '../../src/app/lighting/lightingQuality';

describe('a map view\'s lighting quality', () => {
  it('is the quality chosen on this device, and hears when it changes', async () => {
    const settings = new SettingsService(createInMemoryApp({ files: {} }).app);
    await settings.initialize();
    const quality = settingsLightingQuality(settings)!;
    expect(quality.current()).toBe(LIGHTING_QUALITY.high);
    const listener = vi.fn();
    const unsubscribe = quality.onChange(listener);
    settings.setLightingQuality('saver');
    expect(listener).toHaveBeenCalledOnce();
    expect(quality.current()).toBe(LIGHTING_QUALITY.saver);
    unsubscribe();
  });

  it('is the default where Atlas\' settings cannot be reached', () => {
    expect(settingsLightingQuality(undefined)).toBeUndefined();
  });
});
