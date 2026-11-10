// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

beforeEach(() => { (AssetService as any).instance = null; });
it('queues the statblock tutorial only after a token has been saved, and does not replay completed tips', async () => {
  const { app } = createInMemoryApp({ files: { 'goblin.webp': '' } });
  const settings = new SettingsService(app);
  const assets = AssetService.getInstance(app);
  await settings.initialize();
  await assets.initialize();
  expect(settings.getSetting('onboarding').tokenImported).toBe(false);
  await assets.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'default', tags: [] });
  expect(settings.getSetting('onboarding').tokenImported).toBe(true);
  expect(settings.shouldShowTutorial('tokenStatblocks')).toBe(true);
  settings.completeTutorial('tokenStatblocks');
  await assets.addTokenAsset({ name: 'Another goblin', imagePath: 'goblin.webp', collection: 'default', tags: [] });
  expect(settings.shouldShowTutorial('tokenStatblocks')).toBe(false);
  await settings.saveSettingsNow();
});
