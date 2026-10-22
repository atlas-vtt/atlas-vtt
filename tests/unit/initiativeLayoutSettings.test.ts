// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { INITIATIVE_COLLAPSED_STORAGE_KEY } from '../../src/app/services/deviceSettings';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryPluginData } from '../mocks/pluginData';

async function loaded(stored: unknown = null): Promise<{ settings: SettingsService; data: ReturnType<typeof memoryPluginData>; app: ReturnType<typeof createInMemoryApp>['app'] }> {
  const { app } = createInMemoryApp();
  const data = memoryPluginData(stored);
  const settings = new SettingsService(app, undefined, data);
  await settings.initialize();
  return { settings, data, app };
}

describe('the initiative lists\' layout', () => {
  it('starts at the turn, at the right edge and expanded until the GM chooses otherwise', async () => {
    const { settings } = await loaded();
    expect(settings.initiativeLayout()).toEqual({ fromTurn: true, dock: 'right', collapsed: false });
  });

  it('keeps the GM\'s choices in the synced settings and reads what it does not know as the default', async () => {
    const { settings, data, app } = await loaded();
    settings.setInitiativeLayout({ fromTurn: false, dock: 'left' });
    await settings.saveSettingsNow();
    expect(data.stored()).toMatchObject({ initiativeFromTurn: false, initiativeDock: 'left' });

    const reopened = new SettingsService(app, undefined, data);
    await reopened.initialize();
    expect(reopened.initiativeLayout()).toMatchObject({ fromTurn: false, dock: 'left' });

    expect((await loaded({ initiativeDock: 'top', initiativeFromTurn: 'yes' })).settings.initiativeLayout()).toMatchObject({ dock: 'right', fromTurn: true });
  });

  it('keeps a collapsed tracker on this device alone, never in the synced settings', async () => {
    const { settings, data, app } = await loaded();
    const listener = vi.fn();
    settings.onChange(listener);
    settings.setInitiativeLayout({ collapsed: true });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(app.loadLocalStorage(INITIATIVE_COLLAPSED_STORAGE_KEY)).toBe('collapsed');
    await settings.saveSettingsNow();
    expect(JSON.stringify(data.stored())).not.toContain('collapsed');

    // Expanded is stored as a word: Obsidian drops a falsy value instead of storing it
    settings.setInitiativeLayout({ collapsed: false });
    expect(app.loadLocalStorage(INITIATIVE_COLLAPSED_STORAGE_KEY)).toBe('expanded');
    expect(settings.initiativeLayout().collapsed).toBe(false);
  });

  it('tells nobody of a change that changes nothing', async () => {
    const { settings } = await loaded();
    const listener = vi.fn();
    settings.onChange(listener);
    settings.setInitiativeLayout({ fromTurn: true, dock: 'right', collapsed: false });
    expect(listener).not.toHaveBeenCalled();
  });
});
