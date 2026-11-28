// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { DEFAULT_MAP_HOTKEYS } from '../../src/app/keyboard/mapHotkeys';
import { INPUT_MODE_STORAGE_KEY } from '../../src/app/services/deviceSettings';
import { SettingsService } from '../../src/app/services/SettingsService';
import { memoryPluginData } from '../mocks/pluginData';
import { withListed } from '../../src/app/services/preferences/syncedPreferences';
import defaults0212 from '../fixtures/settings/data-0.21.2-defaults.json';

async function loaded(stored: unknown = null, app = new App()): Promise<{ settings: SettingsService; data: ReturnType<typeof memoryPluginData>; app: App }> {
  const data = memoryPluginData(stored);
  const settings = new SettingsService(app, undefined, data);
  await settings.initialize();
  return { settings, data, app };
}

describe('Atlas settings in the plugin data', () => {
  it('saves the preferences into the plugin data and reads them back', async () => {
    const { settings, data, app } = await loaded();
    settings.set('diceLook', { colour: 'dark' });
    settings.set('experimental', { statblockEditor: true });
    settings.setHotkey('assets', 'q');
    await settings.saveSettingsNow();
    expect(data.stored()).toMatchObject({ diceColour: 'dark', experimental: { statblockEditor: true }, hotkeys: { assets: 'q' } });

    const reopened = new SettingsService(app, undefined, data);
    await reopened.initialize();
    expect(reopened.get('diceLook').colour).toBe('dark');
    expect(reopened.get('experimental').statblockEditor === true).toBe(true);
    expect(reopened.getHotkeys().assets).toBe('q');
  });

  it('shows no cursors to an online table until the GM says so, also in a vault whose settings an older Atlas wrote', async () => {
    expect((await loaded()).settings.get('localPlayerView').showCursors).toBe(false);
    const older = await loaded({ localPlayerView: { showWidgets: false, showDiceRolls: true, showTokenHP: true } });
    expect(older.settings.get('localPlayerView')).toMatchObject({ showCursors: false, showWidgets: false, showDiceRolls: true });
    older.settings.set('localPlayerView', { showCursors: true });
    await older.settings.saveSettingsNow();
    // What the older version stored beside it is still there for it.
    expect(older.data.stored()).toMatchObject({ localPlayerView: { showCursors: true, showWidgets: false, showDiceRolls: true, showTokenHP: true } });
    const reopened = new SettingsService(older.app, undefined, older.data);
    await reopened.initialize();
    expect(reopened.get('localPlayerView').showCursors).toBe(true);
  });

  it('lets no online player draw until the GM says so, also in a vault whose settings an older Atlas wrote', async () => {
    expect((await loaded()).settings.get('localPlayerView').playersDraw).toBe(false);
    const older = await loaded({ localPlayerView: { showWidgets: false, showCursors: true } });
    expect(older.settings.get('localPlayerView')).toMatchObject({ playersDraw: false, showCursors: true });
    older.settings.set('localPlayerView', { playersDraw: true });
    await older.settings.saveSettingsNow();
    const reopened = new SettingsService(older.app, undefined, older.data);
    await reopened.initialize();
    expect(reopened.get('localPlayerView').playersDraw).toBe(true);
  });

  it('keeps what a newer Atlas stored when it saves', async () => {
    const { settings, data } = await loaded({
      futureSetting: { nested: [1, 2] },
      onboarding: { enabled: true, completed: {}, tokenImported: false, futureFlag: true },
      laserPointer: { color: '#ff0059', size: 20, trail: 'long' },
      hotkeys: { assets: 'q', futureAction: 'k', help: DEFAULT_MAP_HOTKEYS.help },
      experimental: { futureFeature: true },
    });
    settings.set('laserPointer', { size: 30 });
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
    settings.set('inputMode', 'trackpad');
    settings.set('diceDisplay', 'fast');
    await settings.saveSettingsNow();
    expect(data.stored()).not.toHaveProperty('navigation');
    expect(data.stored()).not.toHaveProperty('systemPresets');
  });

  it('looks for the grid of new scenes unless the GM switched that off', async () => {
    const { settings, data } = await loaded();
    expect(settings.get('detectGridOnNewScenes')).toBe(true);

    settings.set('detectGridOnNewScenes', false);
    await settings.saveSettingsNow();
    expect(settings.get('detectGridOnNewScenes')).toBe(false);
    expect(data.stored()).toMatchObject({ detectGridOnNewScenes: false });
    // Anything but a plain false, as another version may write, reads as on.
    expect((await loaded({ detectGridOnNewScenes: 'no' })).settings.get('detectGridOnNewScenes')).toBe(true);
  });

  it('reads the plugin data again when it changed on disk and tells every listener', async () => {
    const { settings, data } = await loaded({ diceColour: 'card' });
    const heard = vi.fn();
    settings.onChange(heard);
    data.set({ diceColour: 'dark', hotkeys: { assets: 'q' }, experimental: { statblockEditor: true } });
    await settings.reload();
    expect(heard).toHaveBeenCalledOnce();
    expect(settings.get('diceLook').colour).toBe('dark');
    expect(settings.getHotkeys().assets).toBe('q');
    expect(settings.get('experimental').statblockEditor === true).toBe(true);
    expect(data.saveData).not.toHaveBeenCalled();
  });

  it('keeps a change made here and not saved yet when another device\'s settings arrive, and saves it over them', async () => {
    vi.useFakeTimers();
    try {
      const { settings, data } = await loaded({ diceColour: 'light', diceFont: 'medieval' });
      settings.set('diceLook', { colour: 'dark' });
      data.set({ diceColour: 'light', diceFont: 'scifi' });
      await settings.reload();
      expect(settings.get('diceLook')).toMatchObject({ colour: 'dark', font: 'scifi' });

      await vi.runAllTimersAsync();
      expect(data.stored()).toMatchObject({ diceColour: 'dark', diceFont: 'scifi' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves a list of hidden offers as it is when the offer asked to hide already is, telling no one', async () => {
    const { settings } = await loaded({ hiddenStarterOffers: ['winter', 'summer'] });
    const heard = vi.fn();
    settings.onChange(heard);
    settings.set('hiddenStarterOffers', withListed(settings.get('hiddenStarterOffers'), 'winter', true));
    expect(settings.get('hiddenStarterOffers')).toEqual(['winter', 'summer']);
    expect(heard).not.toHaveBeenCalled();
  });

  /** Another device's file lands while this device's save waits; what reads then, and what the save writes. */
  async function arriving(file: Record<string, unknown>, here: (settings: SettingsService) => void, other: Record<string, unknown>): Promise<{ settings: SettingsService; saved: Record<string, unknown> }> {
    vi.useFakeTimers();
    try {
      const { settings, data } = await loaded(file);
      here(settings);
      data.set(other);
      await settings.reload();
      await vi.runAllTimersAsync();
      return { settings, saved: data.stored() as Record<string, unknown> };
    } finally {
      vi.useRealTimers();
    }
  }

  it('keeps only the key changed here when another device\'s settings arrive, also where the file lacked both', async () => {
    const { settings, saved } = await arriving({}, (here) => here.set('diceLook', { colour: 'dark' }), { diceColour: 'light', diceFont: 'scifi' });
    expect(settings.get('diceLook')).toEqual({ colour: 'dark', font: 'scifi' });
    expect(saved).toMatchObject({ diceColour: 'dark', diceFont: 'scifi' });
  });

  it('keeps the turn banner switched off here and takes moving on the turn from another device, the file lacking both', async () => {
    const { settings, saved } = await arriving({}, (here) => here.set('initiativeTurnOptions', { banner: false }), { initiativeBanner: true, initiativeMovesOnTurn: true });
    expect(settings.get('initiativeTurnOptions')).toEqual({ banner: false, movesOnTurn: true });
    expect(saved).toMatchObject({ initiativeBanner: false, initiativeMovesOnTurn: true });
  });

  it.each([['lacks the key', {}], ['holds the default', { diceVolume: 1 }]])('takes another device\'s dice volume over one changed here and back, where the file %s', async (_name, file) => {
    const { settings, saved } = await arriving(file, (here) => { here.set('diceVolume', 0.5); here.set('diceVolume', 1); }, { diceVolume: 0.3 });
    expect(settings.get('diceVolume')).toBe(0.3);
    expect(saved).toMatchObject({ diceVolume: 0.3 });
  });

  it.each([['no hotkeys', {}], ['the defaults 0.21.2 writes', defaults0212]])('keeps a newer Atlas\'s binding that arrives while a hotkey changed here waits to be saved, from a file with %s', async (_name, file) => {
    const { settings, saved } = await arriving(file, (here) => here.setHotkey('measure', 'j'), { ...file, hotkeys: { futureAction: 'F9' } });
    expect(settings.getHotkeys().measure).toBe('j');
    expect(saved.hotkeys).toEqual({ futureAction: 'F9', measure: 'j' });
  });

  it('takes a newer Atlas\'s changed binding that arrives while a hotkey changed here waits to be saved', async () => {
    const { saved } = await arriving({ hotkeys: { futureAction: 'F9' } }, (here) => here.setHotkey('measure', 'j'), { hotkeys: { futureAction: 'F10' } });
    expect(saved.hotkeys).toEqual({ futureAction: 'F10', measure: 'j' });
  });

  it('keeps the settings when the file reads as nothing, as while a sync tool rewrites it', async () => {
    const { settings, data } = await loaded({ diceColour: 'dark', experimental: { statblockEditor: true } });
    const heard = vi.fn();
    settings.onChange(heard);
    data.set(null);
    await settings.reload();
    expect(settings.get('diceLook').colour).toBe('dark');
    expect(settings.get('experimental').statblockEditor === true).toBe(true);
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
    expect(settings.get('diceDisplay')).toBe('card');
  });
});

describe('the input mode', () => {
  it('is kept in this device\'s local storage, not in the synced settings', async () => {
    const { settings, data, app } = await loaded();
    settings.set('inputMode', 'trackpad');
    expect(app.loadLocalStorage(INPUT_MODE_STORAGE_KEY)).toBe('trackpad');
    settings.set('inputMode', 'mouse');
    expect(app.loadLocalStorage(INPUT_MODE_STORAGE_KEY)).toBe('mouse');
    await settings.saveSettingsNow();
    expect(data.stored()).not.toHaveProperty('navigation');
  });

  it('is read from local storage, whatever the plugin data says', async () => {
    const app = new App();
    app.saveLocalStorage(INPUT_MODE_STORAGE_KEY, 'mouse');
    const { settings } = await loaded({ navigation: { inputMode: 'trackpad' } }, app);
    expect(settings.get('inputMode')).toBe('mouse');
  });

  it('tells listeners when it changes', async () => {
    const { settings } = await loaded();
    const heard = vi.fn();
    settings.onChange(heard);
    settings.set('inputMode', 'trackpad');
    expect(heard).toHaveBeenCalledOnce();
    expect(settings.get('inputMode')).toBe('trackpad');
  });

  it('ignores a stored value it does not know', async () => {
    const app = new App();
    app.saveLocalStorage(INPUT_MODE_STORAGE_KEY, 'joystick');
    const { settings } = await loaded(null, app);
    expect(['mouse', 'trackpad']).toContain(settings.get('inputMode'));
  });
});
