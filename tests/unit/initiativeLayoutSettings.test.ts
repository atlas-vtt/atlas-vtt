// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryPluginData } from '../mocks/pluginData';

async function loaded(stored: unknown = null): Promise<{ settings: SettingsService; data: ReturnType<typeof memoryPluginData>; app: ReturnType<typeof createInMemoryApp>['app'] }> {
  const { app } = createInMemoryApp();
  const data = memoryPluginData(stored);
  const settings = new SettingsService(app, undefined, data);
  await settings.initialize();
  return { settings, data, app };
}

describe('the initiative lists\' layout', () => {
  it('starts at the turn, at the right edge and expanded until the GM chooses otherwise', async () => {
    const { settings } = await loaded();
    expect(settings.initiativeLayout()).toEqual({ fromTurn: true, dock: 'right', edges: ['right'], facesPlayers: false });
  });

  it('lays the players\' list out as a column at the right edge or a row on each side of the table', async () => {
    const { PLAYERS_LIST_SHAPES, playersListShape } = await import('../../src/app/initiative/initiativeLayout');
    const { settings, data, app } = await loaded();
    expect(playersListShape(settings.initiativeLayout())).toBe('vertical');
    settings.setInitiativeLayout(PLAYERS_LIST_SHAPES.horizontal);
    await settings.saveSettingsNow();
    expect(data.stored()).toMatchObject({ initiativeEdges: ['top', 'bottom'], initiativeDock: 'top', initiativeFacesPlayers: true });
    const reopened = new SettingsService(app, undefined, data);
    await reopened.initialize();
    expect(reopened.initiativeLayout()).toMatchObject({ edges: ['top', 'bottom'], dock: 'top', facesPlayers: true });
    expect(playersListShape(reopened.initiativeLayout())).toBe('horizontal');
    reopened.setInitiativeLayout(PLAYERS_LIST_SHAPES.vertical);
    expect(reopened.initiativeLayout()).toMatchObject({ edges: ['right'], dock: 'right', facesPlayers: false });
    // A left edge an older version stored, and edges written by hand that are none, read as the right edge
    expect((await loaded({ initiativeDock: 'left', initiativeEdges: ['left', 'middle'] })).settings.initiativeLayout().edges).toEqual(['right']);
  });

  it('keeps the GM\'s choices in the synced settings and reads what it does not know as the default; the lists always start at the turn', async () => {
    const { settings, data, app } = await loaded();
    settings.setInitiativeLayout({ dock: 'bottom' });
    await settings.saveSettingsNow();
    expect(data.stored()).toMatchObject({ initiativeDock: 'bottom' });

    const reopened = new SettingsService(app, undefined, data);
    await reopened.initialize();
    expect(reopened.initiativeLayout()).toMatchObject({ fromTurn: true, dock: 'bottom' });

    // An older version's choice not to start at the turn is no longer read
    expect((await loaded({ initiativeDock: 'middle', initiativeFromTurn: false })).settings.initiativeLayout()).toMatchObject({ dock: 'right', fromTurn: true });
  });

  it('tells nobody of a change that changes nothing', async () => {
    const { settings } = await loaded();
    const listener = vi.fn();
    settings.onChange(listener);
    settings.setInitiativeLayout({ fromTurn: true, dock: 'right' });
    expect(listener).not.toHaveBeenCalled();
  });
});
