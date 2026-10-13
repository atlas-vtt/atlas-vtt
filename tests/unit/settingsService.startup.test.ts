import { describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { SettingsService } from '../../src/app/services/SettingsService';
import { memoryPluginData } from '../mocks/pluginData';

describe('SettingsService startup', () => {
  it('reads the plugin data only once the startup migration has put the settings there', async () => {
    let finishMigration!: () => void;
    const storageReady = new Promise<void>((resolve) => { finishMigration = resolve; });
    const app = new App();
    const data = memoryPluginData({ diceDisplay: 'card' });

    const settings = new SettingsService(app, storageReady, data);
    // A map tab restored during startup initialises the shared service early.
    const loading = settings.initialize();
    await Promise.resolve();
    expect(data.loadData).not.toHaveBeenCalled();
    expect(SettingsService.forApp(app)).toBe(settings);

    finishMigration();
    await loading;
    expect(data.loadData).toHaveBeenCalledOnce();
    expect(settings.getDiceDisplay()).toBe('card');
  });

  it('still loads the settings when the migration failed', async () => {
    const settings = new SettingsService(new App(), Promise.reject(new Error('migration failed')), memoryPluginData({ diceDisplay: 'card' }));
    await settings.initialize();
    expect(settings.getDiceDisplay()).toBe('card');
  });

  it('never saves the defaults over the plugin data before it was read', async () => {
    let finishMigration!: () => void;
    const storageReady = new Promise<void>((resolve) => { finishMigration = resolve; });
    const data = memoryPluginData({ diceDisplay: 'card' });
    const settings = new SettingsService(new App(), storageReady, data);

    // The plugin unloads during startup, before the settings were loaded.
    const saving = settings.saveSettingsNow();
    await Promise.resolve();
    expect(data.saveData).not.toHaveBeenCalled();

    finishMigration();
    await saving;
    expect(data.saveData).toHaveBeenCalledOnce();
    expect(data.stored()).toMatchObject({ diceDisplay: 'card' });
  });

  it('reports the old player bar switches until they are carried over, and keeps them for an older Atlas', async () => {
    const data = memoryPluginData({ localPlayerView: { showTokenHP: true, showTokenStress: false, showGrid: false } });
    const settings = new SettingsService(new App(), undefined, data);
    await settings.initialize();

    expect(settings.legacyPlayerBars()).toEqual({ hp: true, stress: false });
    expect(settings.legacyPlayerBars()).toEqual({ hp: true, stress: false });
    settings.clearLegacyPlayerBars();
    expect(settings.legacyPlayerBars()).toBeNull();

    await settings.saveSettingsNow();
    // The old grid switch is no longer read, and stays for an older Atlas like the bar switches
    expect(data.stored()).toMatchObject({ localPlayerView: { showTokenHP: true, showTokenStress: false, showGrid: false, tokenBarsCarriedOver: true } });

    const reopened = new SettingsService(new App(), undefined, data);
    await reopened.initialize();
    expect(reopened.legacyPlayerBars()).toBeNull();
  });

  it('has no old switches to hand over in a fresh vault', async () => {
    const settings = new SettingsService(new App(), undefined, memoryPluginData());
    await settings.initialize();
    expect(settings.legacyPlayerBars()).toBeNull();
  });

  it('keeps everything in memory without plugin data', async () => {
    const settings = new SettingsService(new App());
    await settings.initialize();
    settings.setDiceDisplay('card');
    await settings.saveSettingsNow();
    expect(settings.getDiceDisplay()).toBe('card');
  });

  it('reports a failed save and keeps the settings', async () => {
    const data = memoryPluginData();
    vi.mocked(data.saveData).mockRejectedValueOnce(new Error('disk full'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const settings = new SettingsService(new App(), undefined, data);
    await settings.initialize();
    settings.setDiceDisplay('card');
    await settings.saveSettingsNow();
    expect(error).toHaveBeenCalled();
    expect(settings.getDiceDisplay()).toBe('card');
    error.mockRestore();
  });
});
