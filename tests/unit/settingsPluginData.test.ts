// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { DEFAULT_MAP_HOTKEYS } from '../../src/app/keyboard/mapHotkeys';
import { INPUT_MODE_STORAGE_KEY } from '../../src/app/services/deviceSettings';
import { SettingsService } from '../../src/app/services/SettingsService';
import { memoryPluginData } from '../mocks/pluginData';

async function loaded(stored: unknown = null, app = new App()): Promise<{ settings: SettingsService; data: ReturnType<typeof memoryPluginData>; app: App }> {
  const data = memoryPluginData(stored);
  const settings = new SettingsService(app, undefined, data);
  await settings.initialize();
  return { settings, data, app };
}

describe('Atlas settings in the plugin data', () => {
  it('saves the preferences into the plugin data and reads them back', async () => {
    const { settings, data, app } = await loaded();
    settings.setDiceLook({ colour: 'dark' });
    settings.setExperimental('statblockEditor', true);
    settings.setHotkey('assets', 'q');
    await settings.saveSettingsNow();
    expect(data.stored()).toMatchObject({ diceColour: 'dark', experimental: { statblockEditor: true }, hotkeys: { assets: 'q' } });

    const reopened = new SettingsService(app, undefined, data);
    await reopened.initialize();
    expect(reopened.getDiceLook().colour).toBe('dark');
    expect(reopened.isExperimentalOn('statblockEditor')).toBe(true);
    expect(reopened.getHotkeys().assets).toBe('q');
  });

  it('shows no cursors to an online table until the GM says so, also in a vault whose settings an older Atlas wrote', async () => {
    expect((await loaded()).settings.getLocalPlayerViewSettings().showCursors).toBe(false);
    const older = await loaded({ localPlayerView: { showWidgets: false, showDiceRolls: true, showTokenHP: true } });
    expect(older.settings.getLocalPlayerViewSettings()).toMatchObject({ showCursors: false, showWidgets: false, showDiceRolls: true });
    older.settings.setLocalPlayerViewSettings({ showCursors: true });
    await older.settings.saveSettingsNow();
    // What the older version stored beside it is still there for it.
    expect(older.data.stored()).toMatchObject({ localPlayerView: { showCursors: true, showWidgets: false, showDiceRolls: true, showTokenHP: true } });
    const reopened = new SettingsService(older.app, undefined, older.data);
    await reopened.initialize();
    expect(reopened.getLocalPlayerViewSettings().showCursors).toBe(true);
  });

  it('keeps what a newer Atlas stored when it saves', async () => {
    const { settings, data } = await loaded({
      futureSetting: { nested: [1, 2] },
      onboarding: { enabled: true, completed: {}, tokenImported: false, futureFlag: true },
      laserPointer: { color: '#ff0059', size: 20, trail: 'long' },
      hotkeys: { assets: 'q', futureAction: 'k', help: DEFAULT_MAP_HOTKEYS.help },
      experimental: { futureFeature: true },
    });
    settings.setLaserPointerSettings({ size: 30 });
    settings.setHotkey('help', '');
    await settings.saveSettingsNow();
    expect(data.stored()).toMatchObject({
      futureSetting: { nested: [1, 2] },
      onboarding: { futureFlag: true },
      laserPointer: { size: 30, trail: 'long' },
      hotkeys: { assets: 'q', futureAction: 'k', help: '' },
      experimental: { futureFeature: true },
    });
  });

  it('does not rewrite the data just because it holds bindings of a newer Atlas', async () => {
    vi.useFakeTimers();
    try {
      const { data } = await loaded({ hotkeys: { assets: 'q', futureAction: 'k' } });
      await vi.runAllTimersAsync();
      expect(data.saveData).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never writes the input mode or presets into the plugin data', async () => {
    const { settings, data } = await loaded({ navigation: { inputMode: 'mouse' }, systemPresets: [{ id: 'p1' }], diceDisplay: 'card' });
    settings.setNavigationSettings({ inputMode: 'trackpad' });
    settings.setDiceDisplay('fast');
    await settings.saveSettingsNow();
    expect(data.stored()).not.toHaveProperty('navigation');
    expect(data.stored()).not.toHaveProperty('systemPresets');
  });

  it('looks for the grid of new scenes unless the GM switched that off', async () => {
    const { settings, data } = await loaded();
    expect(settings.detectsGridOnNewScenes()).toBe(true);

    settings.setDetectGridOnNewScenes(false);
    await settings.saveSettingsNow();
    expect(settings.detectsGridOnNewScenes()).toBe(false);
    expect(data.stored()).toMatchObject({ detectGridOnNewScenes: false });
    // Anything but a plain false, as another version may write, reads as on.
    expect((await loaded({ detectGridOnNewScenes: 'no' })).settings.detectsGridOnNewScenes()).toBe(true);
  });

  it('shows no names on the GM\'s initiative cards until the GM switches them on', async () => {
    const { settings, data } = await loaded();
    expect(settings.showsInitiativeNames()).toBe(false);

    settings.setInitiativeNames(true);
    await settings.saveSettingsNow();
    expect(settings.showsInitiativeNames()).toBe(true);
    expect(data.stored()).toMatchObject({ initiativeNames: true });
    expect((await loaded({ initiativeNames: 'yes' })).settings.showsInitiativeNames()).toBe(false);
  });

  it('reads the plugin data again when it changed on disk and tells every listener', async () => {
    const { settings, data } = await loaded({ diceColour: 'card' });
    const heard = vi.fn();
    settings.onChange(heard);
    data.set({ diceColour: 'dark', hotkeys: { assets: 'q' }, experimental: { statblockEditor: true } });
    await settings.reload();
    expect(heard).toHaveBeenCalledOnce();
    expect(heard.mock.calls[0]![0]).toMatchObject({ diceColour: 'dark', experimental: { statblockEditor: true } });
    expect(settings.getDiceLook().colour).toBe('dark');
    expect(settings.getHotkeys().assets).toBe('q');
    expect(settings.isExperimentalOn('statblockEditor')).toBe(true);
    expect(data.saveData).not.toHaveBeenCalled();
  });

  it('keeps a change made here and not saved yet when another device\'s settings arrive, and saves it over them', async () => {
    vi.useFakeTimers();
    try {
      const { settings, data } = await loaded({ diceColour: 'light', diceFont: 'medieval' });
      settings.setDiceLook({ colour: 'dark' });
      data.set({ diceColour: 'light', diceFont: 'scifi' });
      await settings.reload();
      expect(settings.getDiceLook()).toMatchObject({ colour: 'dark', font: 'scifi' });

      await vi.runAllTimersAsync();
      expect(data.stored()).toMatchObject({ diceColour: 'dark', diceFont: 'scifi' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the settings when the file reads as nothing, as while a sync tool rewrites it', async () => {
    const { settings, data } = await loaded({ diceColour: 'dark', experimental: { statblockEditor: true } });
    const heard = vi.fn();
    settings.onChange(heard);
    data.set(null);
    await settings.reload();
    expect(settings.getDiceLook().colour).toBe('dark');
    expect(settings.isExperimentalOn('statblockEditor')).toBe(true);
    expect(heard).not.toHaveBeenCalled();
  });

  it('waits for the first load before reading a change from disk', async () => {
    let finish!: () => void;
    const data = memoryPluginData({ diceDisplay: 'card' });
    const settings = new SettingsService(new App(), new Promise<void>((resolve) => { finish = resolve; }), data);
    const reloading = settings.reload();
    await Promise.resolve();
    expect(data.loadData).not.toHaveBeenCalled();
    finish();
    await reloading;
    expect(settings.getDiceDisplay()).toBe('card');
  });
});

describe('the input mode', () => {
  it('is kept in this device\'s local storage, not in the synced settings', async () => {
    const { settings, data, app } = await loaded();
    settings.setNavigationSettings({ inputMode: 'mouse' });
    expect(app.loadLocalStorage(INPUT_MODE_STORAGE_KEY)).toBe('mouse');
    settings.setNavigationSettings({ inputMode: 'trackpad' });
    expect(app.loadLocalStorage(INPUT_MODE_STORAGE_KEY)).toBe('trackpad');
    await settings.saveSettingsNow();
    expect(data.stored()).not.toHaveProperty('navigation');
  });

  it('is read from local storage, whatever the plugin data says', async () => {
    const app = new App();
    app.saveLocalStorage(INPUT_MODE_STORAGE_KEY, 'mouse');
    const { settings } = await loaded({ navigation: { inputMode: 'trackpad' } }, app);
    expect(settings.getNavigationSettings().inputMode).toBe('mouse');
    expect(settings.getAllSettings().navigation.inputMode).toBe('mouse');
  });

  it('tells listeners when it changes', async () => {
    const { settings } = await loaded();
    const heard = vi.fn();
    settings.onChange(heard);
    settings.setNavigationSettings({ inputMode: 'mouse' });
    expect(heard.mock.calls.at(-1)![0].navigation.inputMode).toBe('mouse');
  });

  it('ignores a stored value it does not know', async () => {
    const app = new App();
    app.saveLocalStorage(INPUT_MODE_STORAGE_KEY, 'joystick');
    const { settings } = await loaded(null, app);
    expect(['mouse', 'trackpad']).toContain(settings.getNavigationSettings().inputMode);
  });
});
