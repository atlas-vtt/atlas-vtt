import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { changelogSettingsSection } from '../../src/app/settings/changelogSettingsSection';
import { App } from 'obsidian';
import { memoryPluginData } from '../mocks/pluginData';

describe('changelog settings integration', () => {
  it('enables announcements by default when loading settings from older Atlas versions', async () => {
    const settings = new SettingsService(new App(), undefined, memoryPluginData({ onboarding: { enabled: false } }));
    await settings.initialize();
    expect(settings.getSetting('showChangelogOnUpdate')).toBe(true);
    expect(settings.getSetting('changelogMajorUpdatesOnly')).toBe(false);
    expect(settings.getSetting('onboarding').enabled).toBe(false);
  });
  it('keeps the settings toggle in sync with modal changes and releases the listener', () => {
    let value = true;
    const listeners = new Set<(settings: { showChangelogOnUpdate: boolean }) => void>();
    const settings = {
      getSetting: () => value,
      setSetting: vi.fn((_key: string, next: boolean) => {
        value = next;
        listeners.forEach(listener => listener({ showChangelogOnUpdate: value }));
      }),
      onChange: (listener: (settings: { showChangelogOnUpdate: boolean }) => void) => {
        listeners.add(listener); return () => { listeners.delete(listener); };
      },
    };
    let changed: ((value: boolean) => void) | undefined;
    let toggleValue: boolean | undefined;
    const toggle = {
      setValue(next: boolean) {
        if (toggleValue !== next) { toggleValue = next; changed?.(next); }
        return toggle;
      },
      onChange(callback: (value: boolean) => void) { changed = callback; return toggle; },
    };
    const section = changelogSettingsSection(settings as any, { open: vi.fn() } as any, '0.1.6', { available: () => null, isChecking: () => false, onChange: () => () => undefined } as any);
    const cleanup = section.rows[3]!.render({ addToggle: (callback: (value: typeof toggle) => void) => callback(toggle) } as any);
    settings.setSetting('showChangelogOnUpdate', false);
    expect(toggleValue).toBe(false);
    expect(settings.setSetting).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(1);
    if (cleanup) cleanup();
    expect(listeners.size).toBe(0);
  });
});
