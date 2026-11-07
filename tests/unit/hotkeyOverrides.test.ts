// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { DEFAULT_MAP_HOTKEYS } from '../../src/app/keyboard/mapHotkeys';
import { readHotkeyOverrides, resolveHotkeys, withHotkey } from '../../src/app/keyboard/hotkeyOverrides';
import { App } from 'obsidian';
import { memoryPluginData } from '../mocks/pluginData';

function stored(initial?: object): { settings: SettingsService; data: ReturnType<typeof memoryPluginData> } {
  const data = memoryPluginData(initial ?? null);
  return { settings: new SettingsService(new App(), undefined, data), data };
}
const savedHotkeys = (data: ReturnType<typeof memoryPluginData>): unknown => (data.stored() as { hotkeys: unknown }).hotkeys;

describe('hotkey overrides', () => {
  it('keeps only changed bindings from files that saved every binding', () => {
    const legacy = { ...DEFAULT_MAP_HOTKEYS, assets: 'q', diceTray: '', removedAction: 'x', move: 7 };
    expect(readHotkeyOverrides(legacy)).toEqual({ assets: 'q', diceTray: '' });
    expect(readHotkeyOverrides(null)).toEqual({});
    expect(readHotkeyOverrides(['a'])).toEqual({});
  });

  it('stores a binding back at its default as no override', () => {
    const overrides = withHotkey({}, 'assets', 'q');
    expect(overrides).toEqual({ assets: 'q' });
    expect(withHotkey(overrides, 'assets', DEFAULT_MAP_HOTKEYS.assets)).toEqual({});
    expect(withHotkey(overrides, 'help', '')).toEqual({ assets: 'q', help: '' });
  });

  it('lets a user binding win over a default that takes the same key', () => {
    const bindings = resolveHotkeys({ assets: 'v', timerReset: 'm' });
    expect(bindings.assets).toBe('v');
    expect(bindings.move).toBe('');
    expect(bindings.measure).toBe('m');
    expect(bindings.palette).toBe('Space');
  });
});

afterEach(() => { vi.useRealTimers(); });

describe('saved hotkeys', () => {
  it('saves only the bindings the user changed', async () => {
    const { settings, data } = stored();
    await settings.initialize();
    settings.setHotkey('assets', 'q');
    settings.setHotkey('help', '');
    await settings.saveSettingsNow();
    expect(savedHotkeys(data)).toEqual({ assets: 'q', help: '' });

    settings.setHotkey('assets', DEFAULT_MAP_HOTKEYS.assets);
    await settings.saveSettingsNow();
    expect(savedHotkeys(data)).toEqual({ help: '' });
  });

  it('never rewrites the shared settings on load, so a binding another version calls a choice survives', async () => {
    vi.useFakeTimers();
    const { settings, data } = stored({ hotkeys: { help: DEFAULT_MAP_HOTKEYS.help, assets: 'q' } });
    await settings.initialize();
    await vi.runAllTimersAsync();
    expect(data.saveData).not.toHaveBeenCalled();
    expect(settings.getHotkeys()).toEqual({ ...DEFAULT_MAP_HOTKEYS, assets: 'q' });

    settings.setHotkey('palette', 'Shift+F12');
    await vi.runAllTimersAsync();
    expect(savedHotkeys(data)).toEqual({ help: DEFAULT_MAP_HOTKEYS.help, assets: 'q', palette: 'Shift+F12' });
  });
});
