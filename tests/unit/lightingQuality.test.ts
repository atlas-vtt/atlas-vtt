import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, Setting } from 'obsidian';
import { LIGHTING_QUALITY, bouncesOn, isLightingQualityLevel } from '../../src/app/lighting/lightingQuality';
import { worldTexel } from '../../src/app/lighting/lightingConstants';
import { LIGHTING_QUALITY_STORAGE_KEY } from '../../src/app/services/deviceSettings';
import { SettingsService } from '../../src/app/services/SettingsService';
import { lightingSettingsSections } from '../../src/app/settings/lightingSettingsSection';
import { memoryPluginData } from '../mocks/pluginData';

async function settingsOn(app: App, stored: unknown = {}): Promise<{ settings: SettingsService; write: ReturnType<typeof vi.fn> }> {
  const data = memoryPluginData(stored);
  const settings = new SettingsService(app, undefined, data);
  await settings.initialize();
  const write = vi.fn();
  data.saveData = vi.fn(async (saved: unknown): Promise<void> => { write(saved); });
  return { settings, write };
}

describe('lighting quality levels', () => {
  it('keep small maps at the finest texel and hold large ones to their texture size', () => {
    const small = { width: 1800, height: 1200 };
    const large = { width: 8192, height: 6000 };
    for (const quality of Object.values(LIGHTING_QUALITY)) expect(worldTexel(small, quality.maxTexels)).toBe(2);
    expect(worldTexel(large, LIGHTING_QUALITY.high.maxTexels)).toBe(worldTexel(large));
    expect(large.width / worldTexel(large, LIGHTING_QUALITY.balanced.maxTexels)).toBe(2048);
    expect(large.width / worldTexel(large, LIGHTING_QUALITY.saver.maxTexels)).toBe(1024);
  });

  it('bounce light everywhere at high, on maps up to 6,144 px when balanced, nowhere on saver', () => {
    const map = (side: number): { width: number; height: number } => ({ width: side, height: side / 2 });
    expect(bouncesOn(LIGHTING_QUALITY.high, map(12_000))).toBe(true);
    expect(bouncesOn(LIGHTING_QUALITY.balanced, map(6144))).toBe(true);
    expect(bouncesOn(LIGHTING_QUALITY.balanced, map(8192))).toBe(false);
    expect(bouncesOn(LIGHTING_QUALITY.saver, map(512))).toBe(false);
  });

  it('reads only the levels it knows', () => {
    expect(['high', 'balanced', 'saver'].every(isLightingQualityLevel)).toBe(true);
    expect([null, 'low', 3, {}].some(isLightingQualityLevel)).toBe(false);
  });
});

describe('the lighting quality setting', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('is high until chosen, kept on this device only, and tells every listener', async () => {
    const app = new App();
    const { settings, write } = await settingsOn(app);
    expect(settings.getLightingQuality()).toBe('high');
    const listener = vi.fn();
    settings.onChange(listener);

    settings.setLightingQuality('saver');
    expect(settings.getLightingQuality()).toBe('saver');
    expect(app.loadLocalStorage(LIGHTING_QUALITY_STORAGE_KEY)).toBe('saver');
    expect(listener).toHaveBeenCalledOnce();
    settings.setLightingQuality('saver');
    expect(listener).toHaveBeenCalledOnce();

    await vi.runAllTimersAsync();
    expect(write).not.toHaveBeenCalled();
  });

  it('reads a stored value it does not know as high', async () => {
    const app = new App();
    app.saveLocalStorage(LIGHTING_QUALITY_STORAGE_KEY, 'ultra');
    expect((await settingsOn(app)).settings.getLightingQuality()).toBe('high');
  });

  it('is offered only while dynamic lighting is switched on', async () => {
    const { settings } = await settingsOn(new App());
    expect(lightingSettingsSections(settings)).toEqual([]);
    settings.setExperimental('dynamicLighting', true);
    const [section] = lightingSettingsSections(settings);
    expect(section!.rows.map((row) => row.name)).toEqual(['Lighting quality']);
    expect(section!.rows[0]!.desc).toContain('Full detail');
    expect(() => section!.rows[0]!.render(new Setting(document.createElement('div')))).not.toThrow();
  });
});
