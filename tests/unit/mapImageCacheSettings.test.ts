import { afterEach, describe, expect, it, vi } from 'vitest';
import { Setting } from 'obsidian';
import { mapImageCacheSettingsSection, type MapImageCache } from '../../src/app/settings/mapImageCacheSettingsSection';
import { formatByteSize } from '../../src/app/utils/fileSize';

const MIB = 1024 ** 2;

interface Row {
  setting: Setting;
  clear: HTMLButtonElement;
  info: HTMLElement;
  close: () => void;
}

function renderRow(cache: MapImageCache): Row {
  const [row] = mapImageCacheSettingsSection(() => cache).rows;
  const setting = new Setting(document.createElement('div'));
  setting.setName(row!.name);
  const close = row!.render(setting) ?? ((): void => undefined);
  return {
    setting,
    clear: setting.controlEl.querySelector('button')!,
    info: setting.controlEl.querySelector('div')!,
    close,
  };
}

function cacheOf(size: number, left = 0): MapImageCache & { cacheSize: ReturnType<typeof vi.fn>; clearCache: ReturnType<typeof vi.fn> } {
  return { cacheSize: vi.fn(() => Promise.resolve(size)), clearCache: vi.fn(() => Promise.resolve(left)) };
}

describe('the map image cache setting', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is one row named for the cache, without a description of its own', () => {
    const section = mapImageCacheSettingsSection(() => cacheOf(0));
    expect(section.heading).toBe('Storage');
    expect(section.rows.map((row) => [row.name, row.desc])).toEqual([['Map image cache', undefined]]);
  });

  it('shows the size once it is read, and keeps its line while it waits', async () => {
    let resolve: (bytes: number) => void = () => undefined;
    const cache = { cacheSize: vi.fn(() => new Promise<number>((done) => { resolve = done; })), clearCache: vi.fn(() => Promise.resolve(0)) };
    const { setting } = renderRow(cache);
    expect(setting.descEl.textContent).toBe('…');
    resolve(340 * MIB);
    await vi.waitFor(() => expect(setting.descEl.textContent).toBe('340 MB'));
  });

  it('clears the cache and shows what open maps still keep', async () => {
    const cache = cacheOf(1.5 * 1024 * MIB, 12 * MIB);
    const { setting, clear } = renderRow(cache);
    await vi.waitFor(() => expect(setting.descEl.textContent).toBe('1.5 GB'));
    clear.click();
    expect(clear.disabled).toBe(true);
    await vi.waitFor(() => expect(setting.descEl.textContent).toBe('12 MB'));
    expect(cache.clearCache).toHaveBeenCalledOnce();
    expect(clear.disabled).toBe(false);
    expect(clear.textContent).toBe('Clear');
  });

  it('says the size is unavailable when the cache cannot be read', async () => {
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const cache = { cacheSize: vi.fn(() => Promise.reject(new Error('Blocked'))), clearCache: vi.fn(() => Promise.reject(new Error('Blocked'))) };
    const { setting, clear } = renderRow(cache);
    await vi.waitFor(() => expect(setting.descEl.textContent).toBe('Unavailable'));
    setting.setDesc('');
    clear.click();
    await vi.waitFor(() => expect(setting.descEl.textContent).toBe('Unavailable'));
    expect(clear.disabled).toBe(false);
  });

  it('leaves a closed settings tab alone', async () => {
    let resolve: (bytes: number) => void = () => undefined;
    const cache = { cacheSize: vi.fn(() => new Promise<number>((done) => { resolve = done; })), clearCache: vi.fn(() => Promise.resolve(0)) };
    const { setting, close } = renderRow(cache);
    close();
    resolve(MIB);
    await Promise.resolve();
    expect(setting.descEl.textContent).toBe('…');
  });

  it('explains the cache behind an info button, never as a title', () => {
    const { info, setting } = renderRow(cacheOf(0));
    expect(info.getAttribute('aria-label')).toMatch(/^Keeps the tiles of each map on this device, so maps open quickly\./);
    expect(setting.settingEl.querySelector('[title]')).toBeNull();
  });
});

describe('formatByteSize', () => {
  it('counts from kilobytes in the locale\'s words', () => {
    expect(formatByteSize(0, 'en')).toBe('0 kB');
    expect(formatByteSize(512, 'en')).toBe('0.5 kB');
    expect(formatByteSize(5.25 * MIB, 'en')).toBe('5.3 MB');
    expect(formatByteSize(700 * MIB, 'en')).toBe('700 MB');
    expect(formatByteSize(1.5 * 1024 * MIB, 'de')).toBe('1,5\u00a0GB');
  });
});
