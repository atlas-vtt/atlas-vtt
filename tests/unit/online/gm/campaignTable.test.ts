import { TFile, type App } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignFiles } from '../../../../src/app/campaigns/CampaignFiles';
import { CampaignPlay } from '../../../../src/app/campaigns/campaignPlay';
import { CAMPAIGNS_FOLDER } from '../../../../src/app/campaigns/campaignPaths';
import { CampaignPlayers } from '../../../../src/app/campaigns/players/CampaignPlayers';
import { CLOSE, GM_LEVEL, MAX_CAMPAIGN_PLAYERS } from '../../../../src/app/online/protocol/index.ts';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { Ownership } from '../../../../src/app/online/gm/ownership.ts';
import type { SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { appCampaigns, playSavedTable } from '../../../../src/app/online/gm/tableCampaigns.ts';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { app as fakeApp, atlasTab, FakeSocket, workspace } from './fakeTable.ts';
import { sceneState } from './shareHarness.ts';
import { advanceSettled as advance } from './settled.ts';

const seen = vi.hoisted(() => ({
  notices: [] as string[],
  requests: [] as { readonly url?: string; readonly body?: string }[],
  created: { status: 201, json: null as unknown },
}));

vi.mock('obsidian', async (original) => ({
  ...(await original<object>()),
  Notice: class {
    constructor(text: string) {
      seen.notices.push(text);
    }
  },
  requestUrl: (request: { readonly url?: string; readonly body?: string }) => {
    seen.requests.push(request);
    // The relay opens the link it was asked for, unless a test makes it answer with another.
    const asked = (JSON.parse(request.body ?? '{}') as { code?: string }).code;
    const json = seen.created.json as Record<string, unknown> | null;
    return Promise.resolve({ ...seen.created, json: json === null ? null : { code: asked, ...json } });
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

const FOLDER = `${CAMPAIGNS_FOLDER}/Witherwild`;
const PLAYERS = `${FOLDER}/players.json`;
const campaignText = `${JSON.stringify({ format: 1, id: 'c1', name: 'Witherwild', createdAt: 1 })}\n`;
const LINK = 'k'.repeat(26);
const ANA = 'a'.repeat(20);
const NOOR = 'n'.repeat(20);
const playersText = (players: Record<string, object> = { [ANA]: { name: 'Ana', code: '000001', characters: [], addedAt: 1 } }): string => `${JSON.stringify({ format: 1, campaignId: 'c1', link: LINK, players })}\n`;
/** The GM's account: signed in unless a test signs it out. */
const account = { signedIn: true };
const signedIn = { token: (): string | null => (account.signedIn ? 'account-token' : null), signedOutByServer: (): void => undefined, refresh: (): Promise<void> => Promise.resolve() };

type Frame = { readonly t: string; readonly to?: string; readonly id?: string; readonly players?: readonly { id: string; name: string; code: string }[]; readonly body?: { t: string; code?: string; first?: boolean } };

/** A player id for each number, in the relay's alphabet. */
const seatId = (index: number): string => `${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + (index % 26))}`.padStart(20, 'z');

const opened: App[] = [];

/** A vault with one campaign (and its players file when given), the GM signed in, playing it unless told not to, and an Atlas tab. */
async function gm(players: string | null = playersText(), play = true): Promise<{ online: OnlineControl; vault: ReturnType<typeof createInMemoryApp>; app: App; files: CampaignPlayers; leaf: ReturnType<typeof atlasTab>['leaf']; bound: [string | null, number][]; saves: (SavedTable | null)[] }> {
  const vault = createInMemoryApp({ files: { [`${FOLDER}/campaign.json`]: campaignText, ...(players === null ? {} : { [PLAYERS]: players }) } });
  const app = { ...vault.app, workspace: fakeApp.workspace, plugins: (fakeApp as unknown as { plugins: unknown }).plugins } as unknown as App;
  opened.push(app);
  await CampaignFiles.open(app).load();
  // Opened as the plugin opens it; reading the file is left to whoever waits for it.
  const files = CampaignPlayers.open(app);
  if (play) CampaignPlay.forApp(app).play('c1');
  const tab = atlasTab(sceneState({ mapPath: 'Scenes/Cave.atlasmap' }));
  workspace.leaves = [tab.leaf];
  // Which campaign the books were bound to, and how many sockets were open by then.
  const bound: [string | null, number][] = [];
  const saves: (SavedTable | null)[] = [];
  const online = new OnlineControl(app, new Ownership(), appCampaigns(app, (campaignId) => void bound.push([campaignId, FakeSocket.all.length])), (table) => void saves.push(table), signedIn);
  return { online, vault, app, files, leaf: tab.leaf, bound, saves };
}

/** A table started for the campaign and welcomed by the relay with `connected` at it. */
async function hosting(players?: string, connected: readonly { id: string; name: string }[] = []): Promise<Awaited<ReturnType<typeof gm>> & { socket: FakeSocket; frames: () => Frame[] }> {
  const made = await gm(players);
  await made.online.start(made.leaf, 'c1');
  await advance(0);
  const socket = FakeSocket.all.at(-1);
  if (socket === undefined) throw new Error('no socket');
  socket.relay({ t: 'welcome', role: 'gm', players: connected });
  await advance(100);
  return { ...made, socket, frames: () => socket.frames() as Frame[] };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('WebSocket', FakeSocket);
  FakeSocket.all = [];
  seen.notices.length = 0;
  seen.requests.length = 0;
  seen.created = { status: 201, json: { secret: 's'.repeat(43), maxPlayers: 12 } };
  workspace.presented = null;
  account.signedIn = true;
});

afterEach(() => {
  for (const app of opened.splice(0)) {
    CampaignPlayers.release(app);
    CampaignFiles.release(app);
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a table of the played campaign', () => {
  it('waits for the players file, and asks the relay for the campaign\'s own link', async () => {
    const { online, vault, files, leaf, bound } = await gm();
    expect(files.isLoaded()).toBe(false);
    const table = await online.start(leaf, 'c1');
    expect(table).not.toBeNull();
    expect(files.isLoaded()).toBe(true);
    expect(seen.requests.map((request) => request.body)).toEqual([`{"code":"${LINK}","gmLevel":${GM_LEVEL}}`]);
    await files.flush();
    expect([...vault.files.keys()].filter((path) => path.endsWith('players.json'))).toEqual([PLAYERS]);
    // The campaign's books are bound before the table's socket opens, and let go when it ends.
    expect(bound).toEqual([['c1', 0]]);
    online.stop();
    expect(bound.at(-1)?.[0]).toBeNull();
  });

  it('makes the campaign\'s link once, and keeps it in the players file', async () => {
    const { online, vault, files, leaf } = await gm(null);
    await online.start(leaf, 'c1');
    await files.flush();
    const link = (JSON.parse(vault.files.get(PLAYERS) ?? '{}') as { link?: string }).link;
    expect(link).toMatch(/^[a-z2-7]{26}$/);
    expect(seen.requests.map((request) => request.body)).toEqual([`{"code":"${link}","gmLevel":${GM_LEVEL}}`]);
    online.stop();
  });

  it('is not started without a campaign: no request, and the GM is told', async () => {
    const { online, leaf } = await gm(playersText(), false);
    expect(await online.start(leaf, null)).toBeNull();
    expect(seen.requests).toEqual([]);
    expect(seen.notices).toEqual(['Choose a campaign first.']);
  });

  it('is not started where the link belongs to another account', async () => {
    const { online, leaf } = await gm();
    seen.created = { status: 409, json: { error: 'link-taken' } };
    expect(await online.start(leaf, 'c1')).toBeNull();
    expect(seen.notices).toEqual(['This campaign\'s link belongs to another account. Make a new link.']);
  });

  it('is not run where the relay opened another link than the campaign\'s, and the table it opened is ended', async () => {
    const { online, leaf, bound } = await gm();
    const stray = 'z'.repeat(26);
    seen.created = { status: 201, json: { code: stray, secret: 'x'.repeat(43), maxPlayers: 12 } };
    expect(await online.start(leaf, 'c1')).toBeNull();
    expect(online.table).toBeNull();
    expect(bound).toEqual([]);
    expect(seen.notices).toEqual(['The server could not open this campaign\'s link. Try again later.']);
    await advance(0);
    const socket = FakeSocket.all.at(-1);
    expect(FakeSocket.all).toHaveLength(1);
    expect(socket?.url).toContain(`/api/tables/${stray}/socket`);
    expect(socket?.frames()).toEqual([{ v: 1, t: 'hello', role: 'gm', secret: 'x'.repeat(43), level: GM_LEVEL }]);
    socket?.relay({ t: 'welcome', role: 'gm', players: [] });
    await advance(100);
    expect(socket?.frames().map((frame) => frame.t)).toEqual(['hello', 'end']);
  });

  it('tells the relay the campaign\'s players right after the gates', async () => {
    const { frames, online } = await hosting();
    const after = frames().slice(frames().findIndex((frame) => frame.t === 'gate') + 1);
    expect(after[0]).toEqual({ v: 1, t: 'players', players: [{ id: ANA, name: 'Ana', code: '000001' }] });
    expect(online.players().map((player) => player.name)).toEqual(['Ana']);
    online.stop();
  });
});

describe('who joins the campaign\'s table', () => {
  it('is a player of the campaign told their own code, or a newcomer made one with a code of their own', async () => {
    const { socket, frames, online, files } = await hosting();
    socket.relay({ t: 'player-joined', id: ANA, name: 'Ana' });
    socket.relay({ t: 'player-joined', id: NOOR, name: 'Noor' });
    await advance(100);
    const noor = files.of('c1').players.find((player) => player.id === NOOR);
    expect(noor).toMatchObject({ name: 'Noor', characters: [] });
    const codes = frames().filter((frame) => frame.t === 'send' && frame.body?.t === 'your-code').map((frame) => [frame.to, frame.body]);
    expect(codes).toEqual([[ANA, { t: 'your-code', code: '000001', first: false }], [NOOR, { t: 'your-code', code: noor?.code, first: true }]]);
    // The relay knows the newcomer's code before they are told it.
    const told = frames().findIndex((frame) => frame.to === NOOR && frame.body?.t === 'your-code');
    const rosters = frames().slice(0, told).filter((frame) => frame.t === 'players');
    expect(rosters.at(-1)?.players?.map((player) => player.id)).toEqual([ANA, NOOR]);
    expect(online.ownership.nameOf(NOOR)).toBe('Noor');
    online.stop();
  });

  it('is turned away where the campaign has no room, and the GM is told', async () => {
    const full = Object.fromEntries(Array.from({ length: MAX_CAMPAIGN_PLAYERS }, (_, index) => [seatId(index), { name: `P${index}`, code: String(index + 1).padStart(6, '0'), characters: [] }]));
    const { socket, frames, online, files } = await hosting(playersText(full));
    socket.relay({ t: 'player-joined', id: NOOR, name: 'Noor' });
    await advance(100);
    expect(frames().at(-1)).toEqual({ v: 1, t: 'kick', id: NOOR });
    expect(seen.notices).toContain('The campaign has no room for Noor.');
    expect(files.of('c1').players).toHaveLength(MAX_CAMPAIGN_PLAYERS);
    online.stop();
  });

  it('turned away for want of room is let in at their next knock once the GM made room', async () => {
    const full = Object.fromEntries(Array.from({ length: MAX_CAMPAIGN_PLAYERS }, (_, index) => [seatId(index), { name: `P${index}`, code: String(index + 1).padStart(6, '0'), characters: [] }]));
    const { socket, frames, online, files } = await hosting(playersText(full));
    socket.relay({ t: 'player-joined', id: NOOR, name: 'Noor' });
    await advance(100);
    expect(frames().at(-1)).toEqual({ v: 1, t: 'kick', id: NOOR });
    online.removeFromCampaign(seatId(0));
    socket.relay({ t: 'player-joined', id: NOOR, name: 'Noor' });
    await advance(100);
    const noor = files.of('c1').players.find((player) => player.id === NOOR);
    expect(noor).toMatchObject({ name: 'Noor', characters: [] });
    expect(frames().find((frame) => frame.to === NOOR && frame.body?.t === 'your-code')?.body).toEqual({ t: 'your-code', code: noor?.code, first: true });
    online.stop();
  });

  it('is turned away where the players file is from a newer Atlas', async () => {
    const later = `${JSON.stringify({ format: 2, campaignId: 'c1', link: LINK, players: {} })}\n`;
    const { socket, frames, online } = await hosting(later);
    socket.relay({ t: 'player-joined', id: NOOR, name: 'Noor' });
    await advance(100);
    expect(frames().at(-1)).toEqual({ v: 1, t: 'kick', id: NOOR });
    expect(seen.notices).toContain('This campaign\'s players file is from a newer Atlas.');
    online.stop();
  });
});

describe('the GM\'s players', () => {
  it('get a new code that keeps them connected', async () => {
    const { frames, online } = await hosting(undefined, [{ id: ANA, name: 'Ana' }]);
    const before = frames().length;
    online.newPlayerCode(ANA);
    await advance(100);
    const code = online.playerCode(ANA);
    expect(code).toMatch(/^\d{6}$/);
    const sent = frames().slice(before);
    expect(sent.filter((frame) => frame.t === 'players')).toEqual([{ v: 1, t: 'players', players: [{ id: ANA, name: 'Ana', code }] }]);
    expect(sent.some((frame) => frame.t === 'kick')).toBe(false);
    expect(sent.find((frame) => frame.to === ANA)?.body).toEqual({ t: 'your-code', code, first: false });
    online.stop();
  });

  it('are removed from the campaign: the relay forgets them first, then they are kicked', async () => {
    const { frames, online, files } = await hosting(undefined, [{ id: ANA, name: 'Ana' }]);
    const before = frames().length;
    online.removeFromCampaign(ANA);
    await advance(100);
    expect(frames().slice(before).filter((frame) => frame.t !== 'send')).toEqual([{ v: 1, t: 'players', players: [] }, { v: 1, t: 'kick', id: ANA }]);
    expect(files.of('c1').players).toEqual([]);
    expect(online.players()).toEqual([]);
    online.stop();
  });

  it('are added and renamed by the GM, and the relay is told', async () => {
    const { frames, online } = await hosting();
    const cal = online.addPlayer('Cal');
    expect(cal?.id).toMatch(/^[a-z2-7]{20}$/);
    online.renamePlayer(ANA, 'Anna');
    await advance(100);
    expect(frames().filter((frame) => frame.t === 'players').at(-1)?.players?.map((player) => player.name).sort()).toEqual(['Anna', 'Cal']);
    // A name no player may have changes nothing.
    online.renamePlayer(ANA, '   ');
    expect(online.players().map((player) => player.name)).toEqual(['Anna', 'Cal']);
    online.stop();
  });

  it('keep their campaign, and are nobody\'s once the table ends', async () => {
    const { online, files } = await hosting();
    online.addPlayer('Cal');
    expect(files.of('c1').players.map((player) => player.name).sort()).toEqual(['Ana', 'Cal']);
    online.stop();
    expect(online.players()).toEqual([]);
    expect(online.playerCode(ANA)).toBeNull();
  });
});

describe('a player\'s code', () => {
  it('is looked up while no table runs, from the played campaign\'s players file', async () => {
    const { online, files } = await gm();
    await files.whenLoaded();
    expect(online.table).toBeNull();
    expect(online.playerCode(ANA)).toBe('000001');
    expect(online.playerCode(NOOR)).toBeNull();
  });
});

describe('a table that comes back', () => {
  it('gets a new join code where its saved one is now a player\'s own code', async () => {
    const { online, saves } = await gm();
    const saved: SavedTable = { code: LINK, secret: 's'.repeat(43), maxPlayers: 12, campaignId: 'c1', mapPath: null, gate: { code: '000001', requireCode: true, askToJoin: true } };
    const table = await online.resume(saved);
    expect(table?.gate.settings.code).toMatch(/^\d{6}$/);
    expect(table?.gate.settings.code).not.toBe('000001');
    expect(saves.at(-1)?.gate).toEqual(table?.gate.settings);
    online.stop();
  });
});

describe('a player taken off the campaign', () => {
  it('is never let back in as a newcomer by a welcome that still lists them', async () => {
    const { socket, online, files } = await hosting();
    socket.closeWith(1006);
    online.removeFromCampaign(ANA);
    await advance(1_000);
    const again = FakeSocket.all.at(-1);
    if (again === undefined || again === socket) throw new Error('no second socket');
    again.relay({ t: 'welcome', role: 'gm', players: [{ id: ANA, name: 'Ana' }] });
    await advance(100);
    expect(files.of('c1').players).toEqual([]);
    const sent = again.frames() as Frame[];
    expect(sent.some((frame) => frame.body?.t === 'your-code')).toBe(false);
    expect(sent.filter((frame) => frame.t === 'kick').map((frame) => frame.id)).toContain(ANA);
    expect(online.players()).toEqual([]);
    online.stop();
  });

  it('on another device is never let back in as a newcomer when they join', async () => {
    const { socket, frames, online, files, vault } = await hosting();
    // Another device's write removes Ana from the file.
    await files.flush();
    await vault.app.vault.adapter.write(PLAYERS, playersText({}));
    vault.emit('modify', new TFile(PLAYERS));
    await advance(0);
    expect(files.of('c1').players).toEqual([]);
    socket.relay({ t: 'player-joined', id: ANA, name: 'Ana' });
    await advance(100);
    expect(files.of('c1').players).toEqual([]);
    expect(frames().some((frame) => frame.body?.t === 'your-code')).toBe(false);
    expect(frames().at(-1)).toEqual({ v: 1, t: 'kick', id: ANA });
    online.stop();
  });
});

describe('a new link', () => {
  it('is not made, and the running table keeps going, where no table could start again', async () => {
    for (const block of ['tab', 'account'] as const) {
      FakeSocket.all = [];
      seen.notices.length = 0;
      seen.requests.length = 0;
      account.signedIn = true;
      const { frames, online, files } = await hosting();
      if (block === 'tab') workspace.leaves = [];
      else account.signedIn = false;
      // No tab is shared, so the table would start again from the active one.
      await online.newLink();
      expect(files.of('c1').link, block).toBe(LINK);
      expect(frames().some((frame) => frame.t === 'end'), block).toBe(false);
      expect(online.table, block).not.toBeNull();
      expect(seen.notices, block).toEqual([block === 'tab' ? 'Open an Atlas map tab first.' : 'Sign in to host first.']);
      online.stop();
    }
  });

  it('replaces the campaign\'s link and starts the running table again on it', async () => {
    const { frames, online, files } = await hosting();
    await online.newLink();
    const link = files.of('c1').link;
    expect(link).not.toBe(LINK);
    expect(frames().at(-1)).toEqual({ v: 1, t: 'end' });
    expect(seen.requests.map((request) => request.body)).toEqual([`{"code":"${LINK}","gmLevel":${GM_LEVEL}}`, `{"code":"${link}","gmLevel":${GM_LEVEL}}`]);
    expect(online.table).not.toBeNull();
    online.stop();
  });
});

describe('the played campaign', () => {
  const SAVED: SavedTable = { code: LINK, secret: 's'.repeat(43), maxPlayers: 12, campaignId: 'c1', mapPath: null, gate: { code: '123456', requireCode: true, askToJoin: true } };
  const playing = (app: App): string | null => CampaignPlay.forApp(app).playing();

  it('is the campaign chosen for the table from its start, and none once the GM stops it', async () => {
    const { online, app, leaf } = await gm(playersText(), false);
    expect(playing(app)).toBeNull();
    expect(await online.start(leaf, 'c1')).not.toBeNull();
    expect(playing(app)).toBe('c1');
    expect(app.loadLocalStorage('atlas-vtt:table-campaign')).toBe('c1');
    online.stop();
    expect(playing(app)).toBeNull();
  });

  it('is none where the table could not start', async () => {
    const { online, app, leaf } = await gm(playersText(), false);
    seen.created = { status: 409, json: { error: 'link-taken' } };
    expect(await online.start(leaf, 'c1')).toBeNull();
    expect(playing(app)).toBeNull();
  });

  it('ends when the server closes the table, or another Obsidian takes it over', async () => {
    for (const code of [CLOSE.ended, CLOSE.replaced]) {
      const { online, app, socket } = await hosting();
      expect(playing(app), String(code)).toBe('c1');
      socket.closeWith(code);
      expect(online.table, String(code)).toBeNull();
      expect(playing(app), String(code)).toBeNull();
    }
  });

  it('stays while the table closes for a reload, and is the saved table\'s again once it comes back', async () => {
    const { online, app } = await hosting();
    online.close();
    expect(playing(app)).toBe('c1');
    CampaignPlay.forApp(app).stop();
    expect(await online.resume(SAVED)).not.toBeNull();
    expect(playing(app)).toBe('c1');
    online.stop();
  });

  it('is the saved table\'s while it comes back after a reload, and none without one', async () => {
    const { app } = await gm(playersText(), false);
    const campaigns = appCampaigns(app);
    playSavedTable(campaigns, SAVED);
    expect(playing(app)).toBe('c1');
    // An older Atlas played campaigns without a table: such a play ends at the next start.
    playSavedTable(campaigns, null);
    expect(playing(app)).toBeNull();
  });

  it('ends where the table cannot come back because its players cannot be read', async () => {
    const { app } = await gm();
    const campaigns = { ...appCampaigns(app), open: (): Promise<null> => Promise.resolve(null) };
    const online = new OnlineControl(app, new Ownership(), campaigns, () => undefined, signedIn);
    expect(await online.resume(SAVED)).toBeNull();
    expect(playing(app)).toBeNull();
  });

  it('ends with the table where the new link\'s restart fails or throws', async () => {
    for (const fails of ['refused', 'throws'] as const) {
      seen.created = { status: 201, json: { secret: 's'.repeat(43), maxPlayers: 12 } };
      const { online, app, frames } = await hosting();
      if (fails === 'refused') seen.created = { status: 500, json: null };
      // The account's token can be read for the check before the restart, and no more after it.
      let reads = 0;
      const token = vi.spyOn(signedIn, 'token').mockImplementation(() => {
        reads += 1;
        if (fails === 'throws' && reads > 1) throw new Error('keychain');
        return 'account-token';
      });
      await online.newLink().catch(() => undefined);
      token.mockRestore();
      expect(frames().at(-1), fails).toEqual({ v: 1, t: 'end' });
      expect(online.table, fails).toBeNull();
      expect(playing(app), fails).toBeNull();
    }
  });

  it('ends its table when the campaign is deleted while the table runs', async () => {
    const { online, app, frames, saves } = await hosting();
    // What the campaign page and `recordCampaignPlay` do once the campaign is gone.
    CampaignPlay.forApp(app).stop();
    expect(online.table).toBeNull();
    expect(frames().at(-1)).toEqual({ v: 1, t: 'end' });
    expect(saves.at(-1)).toBeNull();
  });

  it('stays the same while a new link starts the table again', async () => {
    const { online, app } = await hosting();
    const changes: (string | null)[] = [];
    CampaignPlay.forApp(app).onChange(() => void changes.push(playing(app)));
    await online.newLink();
    expect(online.table).not.toBeNull();
    expect(changes).toEqual([]);
    online.stop();
    expect(changes).toEqual([null]);
  });
});
