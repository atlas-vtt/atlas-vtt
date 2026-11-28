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
    before.set('animateMaps', false);
    before.setLightingQuality('saver');
    before.set('inputMode', 'mouse');
    expect(before.get('playerView4k')).toBe(false);
    before.set('playerView4k', true);

    const after = await reloaded(app);

    expect(after.get('animateMaps')).toBe(false);
    expect(after.getGraphics().preset).toBe('saver');
    expect(after.get('inputMode')).toBe('mouse');
    expect(after.get('playerView4k')).toBe(true);

    after.set('animateMaps', true);
    after.setLightingQuality('high');
    after.set('inputMode', 'trackpad');
    after.set('playerView4k', false);
    const again = await reloaded(app);
    expect(again.get('animateMaps')).toBe(true);
    expect(again.getGraphics().preset).toBe('high');
    expect(again.get('inputMode')).toBe('trackpad');
    expect(again.get('playerView4k')).toBe(false);
  });

  it('read animating maps as the first builds stored it, and as never chosen when nothing is stored', async () => {
    const app = new App();
    expect((await reloaded(app)).get('animateMaps')).toBeNull();

    app.saveLocalStorage(ANIMATE_MAPS_STORAGE_KEY, true);
    expect((await reloaded(app)).get('animateMaps')).toBe(true);
  });
});
