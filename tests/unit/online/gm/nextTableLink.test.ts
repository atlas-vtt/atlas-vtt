import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { boundOwnership, FAKE_LINK, fakeCampaigns } from './fakeSeats.ts';
import { app, atlasTab, FakeSocket, workspace } from './fakeTable.ts';
import { sceneState } from './shareHarness.ts';
import { advanceSettled as advance } from './settled.ts';

const seen = vi.hoisted(() => ({ notices: [] as string[], asked: [] as string[] }));

vi.mock('obsidian', async (original) => ({
  ...(await original<object>()),
  Notice: class {
    constructor(text: string) {
      seen.notices.push(text);
    }
  },
  // The relay opens the link it was asked for.
  requestUrl: (request: { readonly body?: string }) => {
    const code = (JSON.parse(request.body ?? '{}') as { code: string }).code;
    seen.asked.push(code);
    return Promise.resolve({ status: 201, json: { code, secret: 's'.repeat(43), maxPlayers: 12 } });
  },
}));

vi.mock('../../../../src/app/online/gm/gmMarks.ts', () => ({
  GmMarks: class {
    source(): null {
      return null;
    }
    showPlayers(): void {}
    showPlayerDrags(): void {}
    showPlayerCursors(): void {}
    dispose(): void {}
  },
}));

const signedIn = { token: (): string | null => 'account-token', signedOutByServer: (): void => undefined, refresh: (): Promise<void> => Promise.resolve() };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('WebSocket', FakeSocket);
  FakeSocket.all = [];
  seen.notices.length = 0;
  seen.asked.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a new link', () => {
  it('is the link of the next table, in the players file and in the dock alike', async () => {
    const tab = atlasTab(sceneState({ mapPath: 'Scenes/Cave.atlasmap' }));
    workspace.leaves = [tab.leaf];
    const campaigns = fakeCampaigns();
    const online = new OnlineControl(app, boundOwnership([]), campaigns, () => undefined, signedIn);
    await online.start(tab.leaf, 'c1');
    await online.newLink();
    // The players file's write lands.
    campaigns.files.flush();
    await advance(100);
    const link = campaigns.seats.link() ?? 'none';
    expect(link).not.toBe(FAKE_LINK);
    expect(online.link()).toContain(link);
    online.stop();
    await online.start(tab.leaf, 'c1');
    expect(seen.asked).toEqual([FAKE_LINK, link, link]);
    expect(online.link()).toContain(link);
    expect(seen.notices).toEqual([]);
    online.stop();
  });
});

describe('the campaign a table starts on', () => {
  it('is the one the GM chose, and this device plays it once the table runs', async () => {
    const tab = atlasTab(sceneState({ mapPath: 'Scenes/Cave.atlasmap' }));
    workspace.leaves = [tab.leaf];
    const play = vi.fn();
    const campaigns = { ...fakeCampaigns(), playing: (): string | null => null, play };
    const online = new OnlineControl(app, boundOwnership([]), campaigns, () => undefined, signedIn);
    await online.start(tab.leaf, 'c2');
    expect(play).toHaveBeenCalledWith('c2');
    expect(online.campaignId()).toBe('c2');
    online.stop();
    expect(online.campaignId()).toBeNull();
  });

  it('is not played when no table could start', async () => {
    const tab = atlasTab(sceneState({ mapPath: 'Scenes/Cave.atlasmap' }));
    workspace.leaves = [tab.leaf];
    const play = vi.fn();
    const signedOut = { ...signedIn, token: (): string | null => null };
    const online = new OnlineControl(app, boundOwnership([]), { ...fakeCampaigns(), play }, () => undefined, signedOut);
    expect(await online.start(tab.leaf, 'c2')).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });
});
