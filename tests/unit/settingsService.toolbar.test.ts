// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { SettingsService } from '../../src/app/services/SettingsService';
import { memoryPluginData } from '../mocks/pluginData';

/** Settings read from the plugin's data; `write` sees what is saved there. */
async function settingsFrom(stored: unknown): Promise<{ settings: SettingsService; write: ReturnType<typeof vi.fn> }> {
  const data = memoryPluginData(stored);
  const settings = new SettingsService(new App(), undefined, data);
  await settings.initialize();
  const write = vi.fn((saved: unknown) => saved);
  data.saveData = vi.fn(async (saved: unknown): Promise<void> => { write(saved); });
  return { settings, write };
}

describe('SettingsService toolbar layout', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('reads a damaged layout as a valid one', async () => {
    expect((await settingsFrom({ toolbar: 'x' })).settings.getToolbarLayout()).toEqual({});
    const { settings } = await settingsFrom({ toolbar: { order: [1, 'fog', 'fog'], hidden: ['palette', 'future'] } });
    expect(settings.getToolbarLayout()).toEqual({ order: ['fog'], hidden: ['future'] });
  });

  it('has no layout in a file without one, and does not rewrite the file for it', async () => {
    const { settings, write } = await settingsFrom({ navigation: { inputMode: 'mouse' } });
    expect(settings.getToolbarLayout()).toEqual({});
    await vi.runAllTimersAsync();
    expect(write).not.toHaveBeenCalled();
  });

  it('stores a changed layout once and tells every listener', async () => {
    const { settings, write } = await settingsFrom({});
    const listener = vi.fn();
    settings.onChange(listener);

    settings.setToolbarLayout({ hidden: ['fog', 'palette'] });
    expect(settings.getToolbarLayout()).toEqual({ hidden: ['fog'] });
    expect(listener).toHaveBeenCalledOnce();

    await vi.runAllTimersAsync();
    expect(write).toHaveBeenCalledOnce();
    expect((write.mock.calls[0]![0] as { toolbar: unknown }).toolbar).toEqual({ hidden: ['fog'] });
  });

  it('writes nothing for an unchanged layout', async () => {
    const { settings, write } = await settingsFrom({ toolbar: { hidden: ['fog'] } });
    const listener = vi.fn();
    settings.onChange(listener);

    settings.setToolbarLayout({ hidden: ['fog'] });
    await vi.runAllTimersAsync();
    expect(listener).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('goes back to the default layout', async () => {
    const { settings } = await settingsFrom({ toolbar: { order: ['palette'], hidden: ['fog'] } });
    settings.setToolbarLayout({});
    expect(settings.getToolbarLayout()).toEqual({});
  });
});
