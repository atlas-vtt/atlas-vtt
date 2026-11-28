// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { atlasPlayerSettings, followAtlasSettings } from '../../../../src/app/online/gm/atlasLighting.ts';
import { SettingsService } from '../../../../src/app/services/SettingsService';

describe('the Atlas settings an online table follows', () => {
  it('reads whether everyone sees each other\'s cursor: off until the GM switches it on, and off when it cannot be read', () => {
    const settingsService = new SettingsService({} as never);
    const app = { plugins: { plugins: { 'atlas-vtt': { settingsService } } } } as unknown as App;
    expect(atlasPlayerSettings(app).showCursors).toBe(false);
    settingsService.set('localPlayerView', { showCursors: true });
    expect(atlasPlayerSettings(app).showCursors).toBe(true);
    expect(atlasPlayerSettings({} as App).showCursors).toBe(false);
  });

  it('reads that the GM\'s initiative lists start at the turn, and reads no when it cannot', () => {
    const settingsService = new SettingsService({ loadLocalStorage: () => null, saveLocalStorage: () => undefined } as never);
    const app = { plugins: { plugins: { 'atlas-vtt': { settingsService } } } } as unknown as App;
    expect(atlasPlayerSettings(app).initiativeFromTurn).toBe(true);
    expect(atlasPlayerSettings({} as App).initiativeFromTurn).toBe(false);
  });

  it('reads the turn banner (on unless switched off) and moves only on the turn (off unless switched on)', () => {
    const settingsService = new SettingsService({} as never);
    const app = { plugins: { plugins: { 'atlas-vtt': { settingsService } } } } as unknown as App;
    expect(atlasPlayerSettings(app)).toMatchObject({ turnBanner: true, movesOnTurn: false });
    settingsService.set('initiativeTurnOptions', { banner: false, movesOnTurn: true });
    expect(atlasPlayerSettings(app)).toMatchObject({ turnBanner: false, movesOnTurn: true });
    expect(atlasPlayerSettings({} as App)).toMatchObject({ turnBanner: true, movesOnTurn: false });
  });

  it('docks the initiative lists at the right edge, the only one they stand at', () => {
    const settingsService = new SettingsService({ loadLocalStorage: () => null, saveLocalStorage: () => undefined } as never);
    const app = { plugins: { plugins: { 'atlas-vtt': { settingsService } } } } as unknown as App;
    expect(atlasPlayerSettings(app).initiativeDock).toBe('right');
    expect(atlasPlayerSettings({} as App).initiativeDock).toBe('right');
  });

  it('reads how the fog\'s edge looks, and nothing when it cannot', () => {
    const settingsService = new SettingsService({} as never);
    const app = { plugins: { plugins: { 'atlas-vtt': { settingsService } } } } as unknown as App;
    expect(atlasPlayerSettings(app).fogEdge).toEqual({ style: 'crackle', width: 15 });
    settingsService.set('fogEdge', { style: 'soft', width: 60 });
    expect(atlasPlayerSettings(app).fogEdge).toEqual({ style: 'soft', width: 60 });
    expect(atlasPlayerSettings({} as App)).not.toHaveProperty('fogEdge');
  });

  it('tells of each change of Atlas\'s settings until stopped, and of none where they cannot be read', () => {
    const settingsService = new SettingsService({} as never);
    const app = { plugins: { plugins: { 'atlas-vtt': { settingsService } } } } as unknown as App;
    let heard = 0;
    const stop = followAtlasSettings(app, () => (heard += 1));
    settingsService.set('localPlayerView', { sharedVision: true });
    stop();
    settingsService.set('localPlayerView', { sharedVision: false });
    expect(heard).toBe(1);
    expect(() => followAtlasSettings({} as App, () => undefined)()).not.toThrow();
  });
});
