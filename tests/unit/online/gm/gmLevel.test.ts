import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSE, GM_LEVEL } from '../../../../src/app/online/protocol/index.ts';
import { isOutdated, knownMinLevel, OUTDATED_TEXT, rememberMinLevel } from '../../../../src/app/online/gm/gmLevel.ts';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import type { SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { tableEndOf } from '../../../../src/app/online/gm/tableEnd.ts';
import { boundOwnership, fakeCampaigns } from './fakeSeats.ts';
import { app, atlasTab, FakeSocket, localStorage, workspace } from './fakeTable.ts';
import { sceneState } from './shareHarness.ts';
import { advanceSettled as advance } from './settled.ts';

const seen = vi.hoisted(() => ({ notices: [] as string[], created: { status: 201, json: null as unknown } }));

vi.mock('obsidian', () => ({
  Notice: class {
    constructor(text: string) {
      seen.notices.push(text);
    }
  },
  normalizePath: (path: string) => path,
  requestUrl: () => Promise.resolve(seen.created),
  PluginSettingTab: class {},
  Setting: class {},
}));

const SAVED: SavedTable = { code: 'a'.repeat(26), secret: 's'.repeat(43), maxPlayers: 12, campaignId: 'c1', mapPath: null, gate: { code: '483912', requireCode: true, askToJoin: true } };

describe('a GM whose Atlas is older than the player page needs', () => {
  let saves: (SavedTable | null)[] = [];
  const signedIn = { token: (): string | null => 'account-token', signedOutByServer: vi.fn(), refresh: vi.fn(() => Promise.resolve()) };
  const control = (): OnlineControl => new OnlineControl(app, boundOwnership([]), fakeCampaigns(), (table) => saves.push(table), signedIn);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    seen.notices.length = 0;
    localStorage.clear();
    saves = [];
    workspace.leaves = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is told so when the relay makes no table for it, and remembers what the relay needs', async () => {
    seen.created = { status: 426, json: { error: 'outdated', minLevel: GM_LEVEL + 2 } };
    const tab = atlasTab(sceneState());
    workspace.leaves = [tab.leaf];
    const online = control();
    expect(online.outdated()).toBe(false);
    expect(await online.start(tab.leaf, 'c1')).toBeNull();
    expect(seen.notices).toEqual([OUTDATED_TEXT]);
    expect(knownMinLevel(app as never)).toBe(GM_LEVEL + 2);
    expect(online.outdated()).toBe(true);
  });

  it('keeps the saved table when the relay turns its hello away, and never tries again', async () => {
    workspace.leaves = [atlasTab(sceneState()).leaf];
    const online = control();
    void online.resume(SAVED);
    await advance(0);
    FakeSocket.all[0]?.closeWith(CLOSE.version);
    expect(online.table).toBeNull();
    expect(online.lost()).toBeNull();
    expect(saves).not.toContain(null);
    expect(online.outdated()).toBe(true);
    expect(seen.notices).toEqual([OUTDATED_TEXT]);
    await advance(40_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('is let in where players sit, asked to update after the session, and forgets it once a welcome needs no more', async () => {
    workspace.leaves = [atlasTab(sceneState()).leaf];
    const online = control();
    void online.resume(SAVED);
    await advance(0);
    const socket = FakeSocket.all[0];
    if (socket === undefined) throw new Error('no socket');
    socket.relay({ t: 'welcome', role: 'gm', players: [], minLevel: GM_LEVEL + 1 });
    expect(online.updateAfterSession()).toBe(true);
    expect(online.outdated()).toBe(true);
    socket.closeWith(1006);
    await advance(40_000);
    FakeSocket.all.at(-1)?.relay({ t: 'welcome', role: 'gm', players: [], minLevel: GM_LEVEL });
    expect(online.updateAfterSession()).toBe(false);
    expect(online.outdated()).toBe(false);
    online.close();
  });

  it('reads an updated Atlas as current at once', () => {
    rememberMinLevel(app as never, GM_LEVEL);
    expect(isOutdated(app as never)).toBe(false);
    localStorage.set('atlas-vtt:online-min-level', 'garbage');
    expect(isOutdated(app as never)).toBe(false);
    expect(tableEndOf(CLOSE.version)).toBe('outdated');
  });

  it('lets the relay answer again after an hour, so a relay rolled back lets the GM start', () => {
    rememberMinLevel(app as never, GM_LEVEL + 1);
    vi.advanceTimersByTime(59 * 60 * 1000);
    expect(isOutdated(app as never)).toBe(true);
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(isOutdated(app as never)).toBe(false);
  });

  it('counts only what this build\'s relay asked for', () => {
    localStorage.set('atlas-vtt:online-min-level', { origin: 'https://play-staging.example', level: GM_LEVEL + 1, at: Date.now() });
    expect(isOutdated(app as never)).toBe(false);
  });
});
