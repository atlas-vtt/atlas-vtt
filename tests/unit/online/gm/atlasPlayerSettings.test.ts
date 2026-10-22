// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { atlasPlayerSettings } from '../../../../src/app/online/gm/atlasLighting.ts';
import { SettingsService } from '../../../../src/app/services/SettingsService';

describe('the Atlas settings an online table follows', () => {
  it('reads whether everyone sees each other\'s cursor: off until the GM switches it on, and off when it cannot be read', () => {
    const settingsService = new SettingsService({} as never);
    const app = { plugins: { plugins: { 'atlas-vtt': { settingsService } } } } as unknown as App;
    expect(atlasPlayerSettings(app).showCursors).toBe(false);
    settingsService.setLocalPlayerViewSettings({ showCursors: true });
    expect(atlasPlayerSettings(app).showCursors).toBe(true);
    expect(atlasPlayerSettings({} as App).showCursors).toBe(false);
  });

  it('reads whether the GM\'s initiative lists start at the turn, and reads no when it cannot', () => {
    const settingsService = new SettingsService({ loadLocalStorage: () => null, saveLocalStorage: () => undefined } as never);
    const app = { plugins: { plugins: { 'atlas-vtt': { settingsService } } } } as unknown as App;
    expect(atlasPlayerSettings(app).initiativeFromTurn).toBe(true);
    settingsService.setInitiativeLayout({ fromTurn: false });
    expect(atlasPlayerSettings(app).initiativeFromTurn).toBe(false);
    expect(atlasPlayerSettings({} as App).initiativeFromTurn).toBe(false);
  });

  it('reads the turn banner (on unless switched off) and moves only on the turn (off unless switched on)', () => {
    const settingsService = new SettingsService({} as never);
    const app = { plugins: { plugins: { 'atlas-vtt': { settingsService } } } } as unknown as App;
    expect(atlasPlayerSettings(app)).toMatchObject({ turnBanner: true, movesOnTurn: false });
    settingsService.setInitiativeTurnOptions({ banner: false, movesOnTurn: true });
    expect(atlasPlayerSettings(app)).toMatchObject({ turnBanner: false, movesOnTurn: true });
    expect(atlasPlayerSettings({} as App)).toMatchObject({ turnBanner: true, movesOnTurn: false });
  });

  it('reads the edge the GM docked the initiative lists at, and the right one when it cannot', () => {
    const settingsService = new SettingsService({ loadLocalStorage: () => null, saveLocalStorage: () => undefined } as never);
    const app = { plugins: { plugins: { 'atlas-vtt': { settingsService } } } } as unknown as App;
    expect(atlasPlayerSettings(app).initiativeDock).toBe('right');
    settingsService.setInitiativeLayout({ dock: 'left' });
    expect(atlasPlayerSettings(app).initiativeDock).toBe('left');
    expect(atlasPlayerSettings({} as App).initiativeDock).toBe('right');
  });
});
