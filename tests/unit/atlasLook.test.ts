// @vitest-environment jsdom
import { expect, it } from 'vitest';
import type { App } from 'obsidian';
import { SettingsService } from '../../src/app/services/SettingsService';
import { readStoredSettings } from '../../src/app/services/atlasSettings';

const service = (): SettingsService => new SettingsService({ vault: { adapter: { exists: async () => true, write: async () => {} } } } as unknown as App);

it('reads an unset or unknown look as mediaeval and keeps a picked one', () => {
  const settings = service();
  expect(settings.getLook()).toBe('mediaeval');
  settings.setLook('scifi');
  expect(settings.getLook()).toBe('scifi');
  expect(readStoredSettings({ look: 'steampunk' }, 'mouse').settings.look).toBe('steampunk');
});

it('gives the fog the look\'s edge at the width the GM set', () => {
  const settings = service();
  settings.setFogEdge({ width: 15 });
  settings.setLook('scifi');
  expect(settings.getFogEdge()).toEqual({ style: 'soft', width: 15 });
  settings.setFogEdge({ width: 40 });
  settings.setLook('mediaeval');
  expect(settings.getFogEdge()).toEqual({ style: 'crackle', width: 40 });
});
