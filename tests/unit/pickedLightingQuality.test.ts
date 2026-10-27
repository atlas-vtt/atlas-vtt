import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import type { GpuFacts } from '../../src/app/lighting/deviceTier';
import { LIGHTING_QUALITY_STORAGE_KEY, PICKED_LIGHTING_QUALITY_STORAGE_KEY } from '../../src/app/services/deviceSettings';
import { SettingsService } from '../../src/app/services/SettingsService';
import { lightingSettingsSection } from '../../src/app/settings/lightingSettingsSection';
import { memoryPluginData } from '../mocks/pluginData';

const gpu = vi.hoisted(() => ({ facts: null as GpuFacts | null, reads: 0 }));
vi.mock('../../src/app/services/gpuFacts', () => ({
  readGpuFacts: (): GpuFacts | null => {
    gpu.reads++;
    return gpu.facts;
  },
}));

const INTEGRATED: GpuFacts = { renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11, D3D11)', maxTextureSize: 16384, cores: 8, memoryGb: 8 };

async function reloaded(app: App): Promise<SettingsService> {
  const settings = new SettingsService(app, undefined, memoryPluginData({}));
  await settings.initialize();
  return settings;
}

describe('the lighting quality Atlas picks for a device', () => {
  beforeEach(() => {
    gpu.facts = null;
    gpu.reads = 0;
  });

  it('is picked once from the graphics and kept, whatever they say later', async () => {
    const app = new App();
    gpu.facts = INTEGRATED;
    const settings = await reloaded(app);
    expect(settings.getLightingQuality()).toBe('balanced');
    expect(settings.isLightingQualityPicked()).toBe(true);
    expect(app.loadLocalStorage(PICKED_LIGHTING_QUALITY_STORAGE_KEY)).toBe('balanced');
    expect(app.loadLocalStorage(LIGHTING_QUALITY_STORAGE_KEY)).toBeNull();

    gpu.facts = { ...INTEGRATED, renderer: 'NVIDIA GeForce RTX 4090' };
    const later = await reloaded(app);
    expect(later.getLightingQuality()).toBe('balanced');
    expect(gpu.reads).toBe(1);
  });

  it('gives way to the GM\'s choice, also one of the same level', async () => {
    const app = new App();
    gpu.facts = INTEGRATED;
    const settings = await reloaded(app);
    const listener = vi.fn();
    settings.onChange(listener);
    settings.setLightingQuality('balanced');
    expect(settings.isLightingQualityPicked()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    settings.setLightingQuality('high');
    expect(listener).toHaveBeenCalledOnce();
    expect((await reloaded(app)).getLightingQuality()).toBe('high');
  });

  it('is high where the graphics cannot be read, and asked again next time', async () => {
    const app = new App();
    const settings = await reloaded(app);
    expect(settings.getLightingQuality()).toBe('high');
    expect(app.loadLocalStorage(PICKED_LIGHTING_QUALITY_STORAGE_KEY)).toBeNull();
    gpu.facts = { ...INTEGRATED, renderer: 'llvmpipe' };
    expect(settings.getLightingQuality()).toBe('saver');
  });

  it('is shown in the settings with a word that Atlas picked it', async () => {
    const app = new App();
    gpu.facts = INTEGRATED;
    const settings = await reloaded(app);
    const row = lightingSettingsSection(settings).rows[0]!;
    expect(row.desc).toContain('picked this level');
    settings.setLightingQuality('saver');
    expect(lightingSettingsSection(settings).rows[0]!.desc).not.toContain('picked this level');
  });
});
