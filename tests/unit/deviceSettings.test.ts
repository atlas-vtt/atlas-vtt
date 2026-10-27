import { describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { ANIMATE_MAPS_STORAGE_KEY } from '../../src/app/services/deviceSettings';
import { SettingsService } from '../../src/app/services/SettingsService';
import { memoryPluginData } from '../mocks/pluginData';

/** A settings service of a device, read anew as after a reload: its device facts come from `app`'s local storage alone. */
async function reloaded(app: App): Promise<SettingsService> {
  const settings = new SettingsService(app, undefined, memoryPluginData({}));
  await settings.initialize();
  return settings;
}

describe('the settings this device keeps to itself', () => {
  // The mock's local storage drops falsy values as Obsidian's does
  it('survive a reload in every state they can be set to', async () => {
    const app = new App();
    const before = await reloaded(app);
    before.setAnimateMaps(false);
    before.setLightingQuality('saver');
    before.setNavigationSettings({ inputMode: 'mouse' });

    const after = await reloaded(app);

    expect(after.getAnimateMaps()).toBe(false);
    expect(after.getLightingQuality()).toBe('saver');
    expect(after.getNavigationSettings().inputMode).toBe('mouse');

    after.setAnimateMaps(true);
    after.setLightingQuality('high');
    after.setNavigationSettings({ inputMode: 'trackpad' });
    const again = await reloaded(app);
    expect(again.getAnimateMaps()).toBe(true);
    expect(again.getLightingQuality()).toBe('high');
    expect(again.getNavigationSettings().inputMode).toBe('trackpad');
  });

  it('read animating maps as the first builds stored it, and as never chosen when nothing is stored', async () => {
    const app = new App();
    expect((await reloaded(app)).getAnimateMaps()).toBeNull();

    app.saveLocalStorage(ANIMATE_MAPS_STORAGE_KEY, true);
    expect((await reloaded(app)).getAnimateMaps()).toBe(true);
  });
});
