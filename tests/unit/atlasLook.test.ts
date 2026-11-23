// @vitest-environment jsdom
import { expect, it } from 'vitest';
import type { App } from 'obsidian';
import { SettingsService } from '../../src/app/services/SettingsService';
import { isAtlasLook } from '../../src/app/appearance/atlasLook';
import { LookService } from '../../src/app/appearance/lookService';

function app(): App {
  const storage = new Map<string, unknown>();
  return {
    vault: { adapter: { exists: async () => true, write: async () => {} } },
    loadLocalStorage: (key: string) => storage.get(key) ?? null,
    saveLocalStorage: (key: string, value: unknown) => { if (value) storage.set(key, value); else storage.delete(key); },
    customCss: { theme: '', themes: {}, setTheme: () => {} },
  } as unknown as App;
}

it('knows only its two looks', () => {
  expect(isAtlasLook('mediaeval')).toBe(true);
  expect(isAtlasLook('scifi')).toBe(true);
  expect(isAtlasLook('own')).toBe(false);
  expect(isAtlasLook('steampunk')).toBe(false);
});

it('gives the fog the look\'s edge at the width the GM set, and the GM\'s own look leaves it', () => {
  const host = app();
  const settings = new SettingsService(host);
  const looks = LookService.forApp(host, settings);
  settings.setFogEdge({ width: 15 });
  looks.set('scifi');
  expect(settings.getFogEdge()).toEqual({ style: 'soft', width: 15 });
  settings.setFogEdge({ width: 40 });
  looks.set('mediaeval');
  expect(settings.getFogEdge()).toEqual({ style: 'crackle', width: 40 });
  looks.set('own');
  expect(settings.getFogEdge()).toEqual({ style: 'crackle', width: 40 });
});
