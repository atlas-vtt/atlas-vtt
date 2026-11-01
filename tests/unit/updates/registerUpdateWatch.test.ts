// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';

vi.mock('../../../src/app/updates/publishedVersion', () => ({
  obsidianFetch: vi.fn(),
  readPublishedVersion: vi.fn(async () => '99.0.0'),
}));
vi.mock('../../../src/app/updates/updateNotice', () => ({ announceUpdate: vi.fn() }));

import { ATLAS_VIEW_TYPE } from '../../../src/app/atlasViewType';
import type { SettingsService } from '../../../src/app/services/SettingsService';
import { playerWindowStore, resetPlayerWindowStore } from '../../../src/app/stores/playerWindowStore';
import { registerUpdateWatch } from '../../../src/app/updates/registerUpdateWatch';
import { announceUpdate } from '../../../src/app/updates/updateNotice';
import type { UpdateWatch } from '../../../src/app/updates/UpdateWatch';

interface Scene {
  watch: UpdateWatch;
  storage: Map<string, unknown>;
  setMaps: (count: number) => void;
  setTable: (running: boolean) => void;
  layoutChange: () => void;
}

function setUp(storage = new Map<string, unknown>()): Scene {
  let maps = 0;
  let table = false;
  let layoutChange = (): void => undefined;
  const plugin = {
    manifest: { version: '0.1.0' },
    app: {
      loadLocalStorage: (key: string) => storage.get(key) ?? null,
      saveLocalStorage: (key: string, value: unknown) => {
        if (value === null) storage.delete(key);
        else storage.set(key, value);
      },
      workspace: {
        onLayoutReady: (run: () => void) => run(),
        on: (name: string, handler: () => void) => {
          if (name === 'layout-change') layoutChange = handler;
          return {};
        },
        getLeavesOfType: (type: string) => (type === ATLAS_VIEW_TYPE ? new Array(maps).fill({}) : []),
      },
    },
    register: () => undefined,
    registerEvent: () => undefined,
    registerInterval: () => 0,
  } as unknown as Plugin;
  const settings = { getSetting: () => true } as unknown as SettingsService;
  const watch = registerUpdateWatch(plugin, settings, () => table);
  return {
    watch,
    storage,
    setMaps: (count) => { maps = count; },
    setTable: (running) => { table = running; },
    layoutChange: () => layoutChange(),
  };
}

describe('registerUpdateWatch', () => {
  afterEach(() => {
    vi.mocked(announceUpdate).mockClear();
    resetPlayerWindowStore();
  });

  it('shows the notice at once while Atlas is not in use', async () => {
    const { watch } = setUp();
    await watch.check({ force: true });
    expect(announceUpdate).toHaveBeenCalledOnce();
  });

  it('waits for the last map view to close', async () => {
    const { watch, setMaps, layoutChange } = setUp();
    setMaps(2);
    await watch.check({ force: true });
    expect(announceUpdate).not.toHaveBeenCalled();
    setMaps(1);
    layoutChange();
    expect(announceUpdate).not.toHaveBeenCalled();
    setMaps(0);
    layoutChange();
    expect(announceUpdate).toHaveBeenCalledOnce();
  });

  it('waits for the player window to close', async () => {
    const { watch } = setUp();
    playerWindowStore.setState({ isOpen: true });
    await watch.check({ force: true });
    expect(announceUpdate).not.toHaveBeenCalled();
    resetPlayerWindowStore();
    expect(announceUpdate).toHaveBeenCalledOnce();
  });

  it('holds the notice while an online table runs', async () => {
    const { watch, setTable, layoutChange } = setUp();
    setTable(true);
    await watch.check({ force: true });
    layoutChange();
    expect(announceUpdate).not.toHaveBeenCalled();
    setTable(false);
    layoutChange();
    expect(announceUpdate).toHaveBeenCalledOnce();
  });

  it('keeps the wait in local storage, and reads a value it cannot use as none', async () => {
    const { watch, storage, setMaps } = setUp(new Map([['atlas-vtt:update-held-since', 'yesterday']]));
    setMaps(1);
    const before = Date.now();
    await watch.check({ force: true });
    expect(storage.get('atlas-vtt:update-held-since')).toBeGreaterThanOrEqual(before);
  });
});
