import { describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { DEFAULT_GM_FOG_OPACITY } from '../../src/app/fog/gmFogOpacity';
import { FogPicture } from '../../src/app/pixi/fog/FogPicture';
import { GM_FOG_OPACITY_STORAGE_KEY } from '../../src/app/services/deviceSettings';
import { SettingsService } from '../../src/app/services/SettingsService';
import { memoryPluginData } from '../mocks/pluginData';

/** A settings service of a device, read anew as after a reload: its device facts come from `app`'s local storage alone. */
async function reloaded(app: App, data = memoryPluginData({})): Promise<SettingsService> {
  const settings = new SettingsService(app, undefined, data);
  await settings.initialize();
  return settings;
}

describe('the GM\'s fog opacity, a setting of this device', () => {
  it('is half until chosen, and survives a reload once it is', async () => {
    const app = new App();
    const before = await reloaded(app);
    expect(before.getGmFogOpacity()).toBe(DEFAULT_GM_FOG_OPACITY);
    before.setGmFogOpacity(0.8);
    expect((await reloaded(app)).getGmFogOpacity()).toBe(0.8);
    // Every opacity it can take is stored: none is a value Obsidian's storage drops.
    for (const opacity of [0.1, 0.5, 1]) {
      before.setGmFogOpacity(opacity);
      expect((await reloaded(app)).getGmFogOpacity()).toBe(opacity);
    }
  });

  it('stays out of the synced settings', async () => {
    const data = memoryPluginData({});
    const settings = await reloaded(new App(), data);
    settings.setGmFogOpacity(0.3);
    expect(data.saveData).not.toHaveBeenCalled();
  });

  it('tells listeners of a change, and only of one', async () => {
    const settings = await reloaded(new App());
    const listener = vi.fn();
    settings.onChange(listener);
    settings.setGmFogOpacity(0.7);
    expect(listener).toHaveBeenCalledTimes(1);
    settings.setGmFogOpacity(0.7);
    expect(listener).toHaveBeenCalledTimes(1);
    // Out of range is the nearest opacity fog can take.
    settings.setGmFogOpacity(4);
    expect(settings.getGmFogOpacity()).toBe(1);
    settings.setGmFogOpacity(-1);
    expect(settings.getGmFogOpacity()).toBe(0.1);
  });

  it('reads whatever else is stored as the default', async () => {
    const app = new App();
    for (const stored of ['dark', {}, true, 'NaN']) {
      app.saveLocalStorage(GM_FOG_OPACITY_STORAGE_KEY, stored);
      expect((await reloaded(app)).getGmFogOpacity()).toBe(DEFAULT_GM_FOG_OPACITY);
    }
  });
});

describe('the fog on the canvas at the GM\'s opacity', () => {
  interface PictureHarness {
    sprite: { alpha: number; visible: boolean };
    setGmOpacity(opacity: number): void;
    gmLayers(): { alpha?: number }[];
    playerLayers(): { alpha?: number }[];
  }

  /** The fog's picture without its canvas, in the GM's view or the session view. */
  function picture(isGMView: boolean): PictureHarness {
    return Object.assign(Object.create(FogPicture.prototype) as FogPicture, {
      deps: { store: { getState: () => ({ isPlayerView: false, isGMView }) }, app: {} },
      gmOpacity: DEFAULT_GM_FOG_OPACITY,
      fade: { running: false },
      sprite: { alpha: isGMView ? DEFAULT_GM_FOG_OPACITY : 1, visible: true },
    }) as unknown as PictureHarness;
  }

  it('draws the GM\'s fog as opaque as chosen, and a scene\'s thumbnail with it', () => {
    const fog = picture(true);
    fog.setGmOpacity(0.25);
    expect(fog.sprite.alpha).toBe(0.25);
    expect(fog.gmLayers()[0]!.alpha).toBe(0.25);
  });

  it('leaves the players\' fog opaque: in the session view and in every picture made for them', () => {
    const session = picture(false);
    session.setGmOpacity(0.25);
    expect(session.sprite.alpha).toBe(1);
    const gm = picture(true);
    gm.setGmOpacity(0.25);
    expect(gm.playerLayers()[0]!.alpha).toBe(1);
  });
});
