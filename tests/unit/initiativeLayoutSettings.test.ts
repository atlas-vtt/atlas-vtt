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
    expect(settings.get('initiativeLayout')).toEqual({ fromTurn: true, dock: 'right', edges: ['right'], facesPlayers: false });
  });

  it('lays the players\' list out as a column or a row, alone or mirrored for the far side of the table', async () => {
    const { playersListLayout, playersListMirrored, playersListShape } = await import('../../src/app/initiative/initiativeLayout');
    const { settings, data, app } = await loaded();
    expect(playersListShape(settings.get('initiativeLayout'))).toBe('vertical');
    expect(playersListMirrored(settings.get('initiativeLayout'))).toBe(false);
    // A column mirrored at the left edge; a row alone at the bottom
    settings.set('initiativeLayout', playersListLayout('vertical', true));
    expect(settings.get('initiativeLayout')).toMatchObject({ edges: ['right', 'left'], dock: 'right', facesPlayers: false });
    expect(playersListShape(settings.get('initiativeLayout'))).toBe('vertical');
    expect(playersListMirrored(settings.get('initiativeLayout'))).toBe(true);
    settings.set('initiativeLayout', playersListLayout('horizontal', false));
    expect(settings.get('initiativeLayout')).toMatchObject({ edges: ['bottom'], dock: 'bottom', facesPlayers: true });
    settings.set('initiativeLayout', playersListLayout('horizontal', true));
    await settings.saveSettingsNow();
    expect(data.stored()).toMatchObject({ initiativeEdges: ['top', 'bottom'], initiativeDock: 'bottom', initiativeFacesPlayers: true });
    const reopened = new SettingsService(app, undefined, data);
    await reopened.initialize();
    expect(reopened.get('initiativeLayout')).toMatchObject({ edges: ['top', 'bottom'], dock: 'bottom', facesPlayers: true });
    expect(playersListShape(reopened.get('initiativeLayout'))).toBe('horizontal');
    reopened.set('initiativeLayout', playersListLayout('vertical', false));
    expect(reopened.get('initiativeLayout')).toMatchObject({ edges: ['right'], dock: 'right', facesPlayers: false });
    // A left edge an older version stored alone, and edges written by hand that are none, read as the right edge;
    // the left one counts only beside the right, as its mirror
    expect((await loaded({ initiativeDock: 'left', initiativeEdges: ['left', 'middle'] })).settings.get('initiativeLayout').edges).toEqual(['right']);
    expect((await loaded({ initiativeDock: 'right', initiativeEdges: ['right', 'left'] })).settings.get('initiativeLayout').edges).toEqual(['right', 'left']);
  });

  it('keeps the GM\'s choices in the synced settings and reads what it does not know as the default; the lists always start at the turn', async () => {
    const { settings, data, app } = await loaded();
    settings.set('initiativeLayout', { dock: 'bottom' });
    await settings.saveSettingsNow();
    expect(data.stored()).toMatchObject({ initiativeDock: 'bottom' });

    const reopened = new SettingsService(app, undefined, data);
    await reopened.initialize();
    expect(reopened.get('initiativeLayout')).toMatchObject({ fromTurn: true, dock: 'bottom' });

    // An older version's choice not to start at the turn is no longer read
    expect((await loaded({ initiativeDock: 'middle', initiativeFromTurn: false })).settings.get('initiativeLayout')).toMatchObject({ dock: 'right', fromTurn: true });
  });

  it('tells nobody of a change that changes nothing', async () => {
    const { settings } = await loaded();
    const listener = vi.fn();
    settings.onChange(listener);
    settings.set('initiativeLayout', { fromTurn: true, dock: 'right' });
    expect(listener).not.toHaveBeenCalled();
  });
});
