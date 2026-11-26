// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';

import type { AtlasSettingSection } from '../../../src/app/settings/settingSections';

/** The settings tab as far as the test reads it: Obsidian's own tab class is not stood in for. */
interface SettingTab {
  sections(): AtlasSettingSection[];
}

const { showNotice } = vi.hoisted(() => ({ showNotice: vi.fn() }));
vi.mock('../../../src/app/ui/notice', () => ({ showNotice }));
vi.mock('../../../src/app/settings/AtlasSettingTab', () => ({
  AtlasSettingTab: class {
    constructor(readonly app: unknown, readonly plugin: unknown, readonly sections: () => AtlasSettingSection[]) {}
  },
}));

import { registerUnsupportedDevice } from '../../../src/app/plugin/unsupportedDevice';

/** A plugin on a device with a local storage of its own; `ready` lays the workspace out. */
function fakePlugin(storage = new Map<string, unknown>()): { plugin: Plugin; tabs: SettingTab[]; registered: string[]; ready(): void } {
  const tabs: SettingTab[] = [];
  const registered: string[] = [];
  let whenReady: () => void = () => undefined;
  const refuse = (what: string) => (): void => { registered.push(what); };
  const plugin = {
    manifest: { name: 'Atlas VTT' },
    app: {
      workspace: { onLayoutReady: (run: () => void) => { whenReady = run; } },
      loadLocalStorage: (key: string) => storage.get(key) ?? null,
      saveLocalStorage: (key: string, value: unknown) => storage.set(key, value),
    },
    addSettingTab: (tab: SettingTab) => tabs.push(tab),
    addCommand: refuse('command'),
    addRibbonIcon: refuse('ribbon icon'),
    registerView: refuse('view'),
    registerExtensions: refuse('extension'),
  };
  return { plugin: plugin as unknown as Plugin, tabs, registered, ready: () => whenReady() };
}

beforeEach(() => {
  showNotice.mockClear();
});

describe('Atlas on a device it does not run on', () => {
  it('says that the system is too old, and registers a settings tab that says the same and nothing else', () => {
    const { plugin, tabs, registered, ready } = fakePlugin();
    registerUnsupportedDevice(plugin);
    ready();

    expect(showNotice).toHaveBeenCalledExactlyOnceWith('This device\'s system is too old for Atlas.');
    expect(tabs).toHaveLength(1);
    expect(tabs[0]!.sections()).toMatchObject([{ heading: 'Atlas VTT', rows: [{ name: 'This device\'s system is too old for Atlas.' }] }]);
    expect(registered).toEqual([]);
  });

  it('says it once per device, not at every start', () => {
    const storage = new Map<string, unknown>();
    const first = fakePlugin(storage);
    registerUnsupportedDevice(first.plugin);
    first.ready();
    const second = fakePlugin(storage);
    registerUnsupportedDevice(second.plugin);
    second.ready();

    expect(showNotice).toHaveBeenCalledOnce();
    expect(second.tabs).toHaveLength(1);
  });

  it('shows nothing before the workspace is laid out', () => {
    const { plugin } = fakePlugin();
    registerUnsupportedDevice(plugin);
    expect(showNotice).not.toHaveBeenCalled();
  });
});
