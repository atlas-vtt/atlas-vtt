import { CLOSE } from '../../../../src/app/online/protocol/index.ts';
import type { TokenEntity } from '../../../../src/app/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { ARM_MS } from '../../../../src/app/online/gm/joinGate.ts';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { boundOwnership, fakeCampaigns } from './fakeSeats.ts';
import { readSavedTable, type SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { closingText } from '../../../../src/app/online/gm/tableEnd.ts';
import { app, atlasTab, png, present, switchScene, workspace, storedAccount } from './fakeTable.ts';
import { fakeTokenSource } from './fakeTokenSource.ts';
import { sceneState } from './shareHarness.ts';
import { advanceSettled as advance } from './settled.ts';
import { FakeRelay, type RelayOutbox, type Told } from './fakeRelay.ts';

const seen = vi.hoisted(() => {
  /** The relay's answer to a table request. */
  const created: { status: number; json: unknown } = { status: 201, json: null };
  return { notices: [] as string[], marks: [] as { disposed: boolean; renderer: () => unknown }[], created, requests: [] as { readonly url?: string; readonly headers?: Record<string, string> }[] };
});

vi.mock('obsidian', () => ({
  Notice: class {
    constructor(text: string) {
      seen.notices.push(text);
    }
  },
  normalizePath: (path: string) => path,
  requestUrl: (request: { readonly url?: string; readonly headers?: Record<string, string> }) => {
    seen.requests.push(request);
    return Promise.resolve(seen.created);
  },
  PluginSettingTab: class {},
  Setting: class {},
}));

// The GM's marks draw with PIXI over Atlas's canvas; here they only record what was built and let go.
// Node has no tile worker: a map's pyramid is still being cut for as long as the test runs, as on a slow device.
vi.mock('../../../../src/app/pixi/mosaicCanvas/prebuildMosaicCanvas', async (original) => ({ ...(await original<typeof import('../../../../src/app/pixi/mosaicCanvas/prebuildMosaicCanvas')>()), buildMapPyramid: () => new Promise(() => undefined) }));
vi.mock('../../../../src/app/pixi/mosaicCanvas/TesseraDecoderClient', async (original) => ({
  ...(await original<typeof import('../../../../src/app/pixi/mosaicCanvas/TesseraDecoderClient')>()),
  TesseraDecoderClient: { forApp: () => ({ levelReady: () => new Promise(() => undefined), tesseraBlobs: () => Promise.resolve([]) }), release: () => undefined },
}));
vi.mock('../../../../src/app/online/gm/gmMarks.ts', () => ({
  GmMarks: class {
    disposed = false;
    readonly renderer: () => unknown;
    constructor(_app: unknown, renderer: () => unknown) {
      this.renderer = renderer;
      seen.marks.push(this);
    }
    source(): null {
      return null;
    }
    showPlayers(): void {}
    showPlayerDrags(): void {}
    showPlayerCursors(): void {}
    showPlayerStrokes(): void {}
    dispose(): void {
      this.disposed = true;
    }
  },
}));

vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({
  ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()),
  accentColour: () => '#112233',
}));

const ANA = 'anaanaanaanaanaanaan';
const MAP = 'Scenes/Cave.atlasmap';
const SAVED: SavedTable = { code: 'a'.repeat(26), secret: 's'.repeat(43), maxPlayers: 12, campaignId: 'c1', mapPath: MAP, gate: { code: '483912', requireCode: true, askToJoin: true } };
const ogre = (x: number): TokenEntity => ({ id: 'gm-ogre', kind: 'character', name: 'Ogre', imagePath: 'art/ogre.png', x, y: 140 });

workspace.files = new Map<string, Uint8Array>([['maps/cave.png', png(700, 700)], ['maps/cave2.png', png(350, 350)], ['art/ogre.png', png(4, 4)]]);

const caveScene = (x = 140, mapPath = MAP): SceneState => sceneState({ mapPath, background: 'maps/cave.png', objects: { ...sceneState().objects, tokens: { 'gm-ogre': ogre(x) } } });
const lastScene = (relay: FakeRelay): unknown => relay.pages.of(ANA).last('scene')?.scene;
/** The kinds of message sent since `from`, but how far uploads have come, which follows the store rather than the view. */
const sentSince = (relay: FakeRelay, from: number): string[] => relay.sent().slice(from).map(({ body }) => body.t).filter((t) => t !== 'asset-progress');

describe('the online table', () => {
  let saves: (SavedTable | null)[] = [];
  let relay = new FakeRelay();
  /** A signed-in GM: tables are asked for with the account's token, and nothing else. */
  const signedIn = { ...storedAccount(), token: (): string | null => 'account-token', signedOutByServer: vi.fn(), refresh: vi.fn(() => Promise.resolve()) };
  const control = (ownership = boundOwnership([]), players: Parameters<typeof fakeCampaigns>[0] = [], campaigns = fakeCampaigns(players)): OnlineControl =>
    new OnlineControl(app, ownership, campaigns, (table) => saves.push(table), signedIn, undefined, undefined, relay.open);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    relay = new FakeRelay();
    seen.notices.length = 0;
    seen.marks.length = 0;
    seen.requests.length = 0;
    signedIn.refresh.mockClear();
    seen.created = { status: 201, json: { code: 'b'.repeat(26), secret: 'n'.repeat(43) } };
    saves = [];
    workspace.leaves = [];
    workspace.presented = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('follows Atlas through reloads: lets go of the old view at once, sends no scene while Atlas is gone, and shares the same map again', async () => {
    const first = atlasTab(caveScene());
    workspace.leaves = [first.leaf];
    present(first);
    const online = control();
    void online.resume(SAVED);
    await advance(0);
    expect(relay.outbox).toMatchObject({ started: true, table: { code: SAVED.code, secret: SAVED.secret } });
    relay.outbox.welcome([{ id: ANA, name: 'Ana' }]);
    await advance(500);
    expect(lastScene(relay)).toMatchObject({ map: { mime: 'image/png' } });
    expect(relay.sent().some(({ body }) => body.t === 'tokens')).toBe(true);

    // Atlas reloads: a store write starts reading another map, then the view closes (its renderer still
    // there while it saves), destroys its renderer, and the leaf is gone; the old store still takes writes.
    const before = relay.sent().length;
    first.store.set({ ...caveScene(280), background: 'maps/cave2.png' });
    first.view.isViewClosing = true;
    await advance(0);
    first.view.renderer = null;
    first.store.set(caveScene(350));
    await advance(1_100);
    workspace.leaves = [];
    first.store.set(caveScene(420));
    await advance(3_000);
    expect(seen.marks[0]?.disposed).toBe(true);
    expect(seen.marks[0]?.renderer()).toBeNull();
    expect(sentSince(relay, before)).toEqual(['scene']);
    expect(lastScene(relay)).toBeNull();
    // A player's move while Atlas is gone reaches no store and breaks nothing.
    relay.outbox.from(ANA, { t: 'move', scene: 'x', id: 'y', x: 1, y: 1 });

    // Atlas is back with a new leaf, view, store and renderer showing the same map: shared anew.
    const second = atlasTab(caveScene(560));
    workspace.leaves = [second.leaf];
    await advance(1_500);
    expect(seen.marks).toHaveLength(2);
    expect(lastScene(relay)).toMatchObject({ map: { mime: 'image/png' } });
    expect(relay.pages.of(ANA).tokens).toMatchObject([{ x: 560 }]);

    // The tab builds its renderer anew: the marks of the old one go, the scene is shared from the new one.
    const scenesBefore = relay.pages.of(ANA).all('scene').length;
    second.view.renderer = fakeTokenSource(() => second.store.getState(), () => undefined, () => 70);
    await advance(1_500);
    expect(seen.marks[1]?.disposed).toBe(true);
    expect(seen.marks).toHaveLength(3);
    expect(relay.pages.of(ANA).all('scene').length).toBeGreaterThan(scenesBefore);
    expect(lastScene(relay)).toMatchObject({ map: { mime: 'image/png' } });

    // The GM closes the tab and opens the map again: the table waits, then shares it.
    workspace.leaves = [];
    await advance(1_500);
    expect(seen.notices).toContain('The shared map was closed. Players wait until it is open again.');
    expect(lastScene(relay)).toBeNull();
    expect(online.status()).toBe('online');
    workspace.leaves = [atlasTab(caveScene()).leaf];
    await advance(1_500);
    expect(lastScene(relay)).toMatchObject({ map: { mime: 'image/png' } });
    expect(seen.notices.filter((text) => text.includes('lighting'))).toEqual([]);
    online.stop();
  });

  it('keeps the table in the plugin data through a reload of the companion, with the same link, players and owners', async () => {
    const tab = atlasTab(caveScene());
    workspace.leaves = [tab.leaf];
    present(tab);
    const ownership = boundOwnership([{ id: ANA, name: 'Ana' }]);
    // The campaign's players file, which the token owners live in, is the same before and after the reload.
    const campaigns = fakeCampaigns([{ id: ANA, name: 'Ana' }]);
    const online = control(ownership, [{ id: ANA, name: 'Ana' }], campaigns);
    await online.start(tab.leaf, 'c1');
    await advance(0);
    const created = saves.at(-1);
    expect(created).toEqual({ code: 'b'.repeat(26), secret: 'n'.repeat(43), maxPlayers: 12, campaignId: 'c1', mapPath: MAP, gate: { code: expect.stringMatching(/^\d{6}$/) as string, requireCode: true, askToJoin: true } });
    const link = online.link();
    const first = relay.outbox;
    if (created === null || created === undefined) throw new Error('no table');
    first.welcome([{ id: ANA, name: 'Ana' }]);
    online.give(['gm-ogre'], ANA);
    await advance(500);

    // The GM opens another map in the shared view: the saved table keeps the presented one until Atlas presents the other.
    switchScene(tab, caveScene(140, 'Scenes/Hall.atlasmap'));
    await advance(1_500);
    expect(saves.at(-1)?.mapPath).toBe(MAP);
    present(tab);
    await advance(1_500);
    expect(saves.at(-1)?.mapPath).toBe('Scenes/Hall.atlasmap');

    // The companion unloads: the socket closes without ending the table, and nothing is forgotten.
    const savesBefore = saves.length;
    online.close();
    expect(first.stats().status).toBe('stopped');
    expect(first.told.some((entry) => entry.t === 'end')).toBe(false);
    expect(saves.length).toBe(savesBefore);
    const data: unknown = JSON.parse(JSON.stringify({ table: saves.at(-1) }));

    // It loads again from that data and the campaign: same link and secret, Ana keeps her id and her ogre.
    const record = data as { table: unknown };
    const restored = readSavedTable(record.table);
    if (restored === null) throw new Error('the saved table was not read');
    const kept = boundOwnership([{ id: ANA, name: 'Ana' }]);
    const again = control(kept, [{ id: ANA, name: 'Ana' }], campaigns);
    void again.resume(restored);
    await advance(0);
    expect(again.link()).toBe(link);
    const resumed = relay.outbox;
    expect(resumed).not.toBe(first);
    expect(resumed).toMatchObject({ started: true, table: { code: first.table.code, secret: created.secret } });
    const back = relay.pages.mark();
    resumed.welcome([{ id: ANA, name: 'Ana' }]);
    await advance(500);
    expect(kept.ownerOf('gm-ogre', undefined)).toBe(ANA);
    expect(relay.pages.since(back, 'mine')[ANA]?.at(-1)?.tokens).toHaveLength(1);

    // Stopped by the GM: the table ends on the server and the saved table is forgotten.
    again.stop();
    expect(resumed.told.at(-1)).toEqual({ t: 'end' });
    expect(saves.at(-1)).toBeNull();
  });

  it('forgets a table the server ended or expired, and keeps one another Obsidian took over', async () => {
    workspace.leaves = [atlasTab(caveScene()).leaf];
    const online = control();
    void online.resume(SAVED);
    await advance(0);
    relay.opened[0]?.close(CLOSE.replaced);
    expect(online.table).toBeNull();
    expect(saves.at(-1)).toEqual(SAVED);
    expect(online.lost()).toBeNull();

    void online.resume(SAVED);
    await advance(0);
    relay.opened[1]?.close(CLOSE.ended);
    expect(online.table).toBeNull();
    expect(saves.at(-1)).toBeNull();
    expect(online.lost()).toBe('refused');
    expect(seen.notices).toEqual(['Another Obsidian took over the online table.', 'The server closed the online table.']);
    expect(signedIn.refresh).not.toHaveBeenCalled();
  });

  it('drops a table whose account may not host, says so, asks what the account may do now, and never tries again', async () => {
    workspace.leaves = [atlasTab(caveScene()).leaf];
    const online = control();
    void online.resume(SAVED);
    await advance(0);
    relay.outbox.welcome([]);
    relay.outbox.close(CLOSE.noAccess);
    expect(online.table).toBeNull();
    expect(saves.at(-1)).toBeNull();
    expect(online.lost()).toBe('no-access');
    expect(seen.notices).toEqual(['The online table was closed. This account may not host online tables now.']);
    expect(signedIn.refresh).toHaveBeenCalledWith(true);
    await advance(40_000);
    expect(relay.opened).toHaveLength(1);
  });

  it('drops a table that ended because its account started another, says so, and never tries again', async () => {
    workspace.leaves = [atlasTab(caveScene()).leaf];
    const online = control();
    void online.resume(SAVED);
    await advance(0);
    relay.outbox.close(CLOSE.superseded);
    expect(online.table).toBeNull();
    expect(saves.at(-1)).toBeNull();
    expect(online.lost()).toBe('superseded');
    expect(seen.notices).toEqual(['The online table was closed. This account started another table.']);
    expect(signedIn.refresh).not.toHaveBeenCalled();
    await advance(40_000);
    expect(relay.opened).toHaveLength(1);

    // The next table starts clean: what the last one ended by is forgotten.
    const tab = atlasTab(caveScene());
    workspace.leaves = [tab.leaf];
    await online.start(tab.leaf, 'c1');
    expect(online.lost()).toBeNull();
    online.stop();
  });

  it('knows when the relay closes a table whose account may no longer host, tells the GM once per time, and forgets it at the relay\'s word or a welcome', async () => {
    workspace.leaves = [atlasTab(caveScene()).leaf];
    const online = control();
    let changes = 0;
    online.onChange(() => (changes += 1));
    void online.resume(SAVED);
    await advance(0);
    const { outbox } = relay;
    outbox.welcome([]);
    expect(online.table?.closesAt).toBeNull();
    const closesAt = Date.UTC(2026, 9, 12, 14, 30);
    const before = changes;
    outbox.access(closesAt);
    expect(online.table?.closesAt).toBe(closesAt);
    expect(changes).toBeGreaterThan(before);
    expect(seen.notices).toEqual([closingText(closesAt)]);
    // A welcome clears it, and the relay's reminder behind the welcome names the same time: no second notice.
    outbox.welcome([]);
    expect(online.table?.closesAt).toBeNull();
    outbox.access(closesAt);
    expect(online.table?.closesAt).toBe(closesAt);
    expect(seen.notices).toHaveLength(1);
    // The account may host again.
    outbox.access(null);
    expect(online.table?.closesAt).toBeNull();
    // The table stays as it is all the while: nothing was closed or dropped.
    expect(online.status()).toBe('online');
    expect(saves.at(-1)).toEqual(SAVED);
    online.close();
  });

  it('asks for a table with the account\'s token alone, and forgets a token the relay refuses', async () => {
    const tab = atlasTab(caveScene());
    workspace.leaves = [tab.leaf];
    let token: string | null = 'account-token';
    const account = { token: () => token, signedOutByServer: vi.fn(() => (token = null)), refresh: vi.fn(() => Promise.resolve()) };
    const online = new OnlineControl(app, boundOwnership([]), fakeCampaigns(), (table) => saves.push(table), account, undefined, undefined, relay.open);

    seen.created = { status: 403, json: { error: 'no-access' } };
    expect(await online.start(tab.leaf, 'c1')).toBeNull();
    expect(account.refresh).toHaveBeenCalledWith(true);
    expect(seen.notices.at(-1)).toBe('Online play is in early access. Redeem an invite key on your account page.');

    seen.created = { status: 201, json: { code: 'b'.repeat(26), secret: 'n'.repeat(43), maxPlayers: 2 } };
    await online.start(tab.leaf, 'c1');
    await advance(0);
    expect(seen.requests.map((request) => request.headers?.Authorization)).toEqual(['Bearer account-token', 'Bearer account-token']);
    expect(online.seats()).toBe(2);
    expect(saves.at(-1)).toMatchObject({ maxPlayers: 2 });
    online.stop();
    await advance(0);

    seen.created = { status: 401, json: { error: 'signed-out' } };
    expect(await online.start(tab.leaf, 'c1')).toBeNull();
    expect(account.signedOutByServer).toHaveBeenCalledTimes(1);
    expect(await online.start(tab.leaf, 'c1')).toBeNull();
    expect(seen.notices.at(-1)).toBe('Sign in to host first.');
    expect(seen.requests).toHaveLength(3);
  });

  it('comes back to a saved table by opening it with its secret alone (`relayOutbox` on Atlas\'s table server)', async () => {
    workspace.leaves = [atlasTab(caveScene()).leaf];
    const online = new OnlineControl(app, boundOwnership([]), fakeCampaigns(), (table) => saves.push(table), signedIn, undefined, undefined, relay.open);
    void online.resume(SAVED);
    await advance(0);
    expect(relay.opened.map(({ table }) => table)).toMatchObject([{ code: SAVED.code, secret: SAVED.secret }]);
    // The secret goes to the table's own link and nowhere else: no request was made at all.
    expect(seen.requests).toEqual([]);
    online.close();
  });

  it('makes tables on Atlas\'s table server', async () => {
    const tab = atlasTab(caveScene());
    workspace.leaves = [tab.leaf];
    const online = new OnlineControl(app, boundOwnership([]), fakeCampaigns(), (table) => saves.push(table), signedIn, undefined, undefined, relay.open);
    await online.start(tab.leaf, 'c1');
    expect(seen.requests[0]?.url).toBe('https://play.atlas-vtt.dev/api/tables');
    expect(online.link()).toBe(`https://play.atlas-vtt.dev/#${'b'.repeat(26)}`);
    online.stop();
  });

  it('tells the relay its gates first on every welcome, keeps them with the table, and passes on who knocks and the GM\'s answer', async () => {
    const tab = atlasTab(caveScene());
    workspace.leaves = [tab.leaf];
    present(tab);
    const online = control();
    let changes = 0;
    online.onChange(() => (changes += 1));
    await online.start(tab.leaf, 'c1');
    await advance(0);
    const started = saves.at(-1);
    expect(started?.gate).toMatchObject({ requireCode: true, askToJoin: true });
    expect(started?.gate.code).toMatch(/^\d{6}$/);
    const code = started?.gate.code ?? '';
    const first = relay.outbox;
    const gates = (from: RelayOutbox): Told[] => from.told.filter((entry) => entry.t === 'gate');
    expect(gates(first)).toEqual([]);
    first.welcome([], { waiting: [{ id: ANA, name: 'Ana' }] });
    await advance(0);
    // The gates first, ahead of every game message, on the table's own link.
    expect(first.table.secret).toBe('n'.repeat(43));
    expect(first.told[0]).toEqual({ t: 'gate', code, ask: true });
    expect(online.table?.gate.view().waiting).toEqual([{ id: ANA, name: 'Ana', answered: false, full: false, armed: false }]);

    const before = changes;
    first.knock({ id: 'b'.repeat(20), name: 'Ben' });
    first.pauseGate(Date.now() + 60_000);
    expect(changes).toBeGreaterThan(before);
    expect(online.table?.gate.view()).toMatchObject({ waiting: [{ name: 'Ana' }, { name: 'Ben' }], paused: true });
    // A card that just appeared takes no answer: nothing goes to the relay.
    online.table?.gate.admit(ANA);
    await advance(100);
    expect(first.told.some((entry) => entry.t === 'admit' || entry.t === 'decline')).toBe(false);
    await advance(ARM_MS);
    expect(online.table?.gate.view().waiting.map((player) => player.armed)).toEqual([true, true]);
    online.table?.gate.admit(ANA);
    online.table?.gate.decline('b'.repeat(20));
    await advance(100);
    expect(first.told.filter((entry) => entry.t === 'admit' || entry.t === 'decline')).toEqual([{ t: 'admit', id: ANA }, { t: 'decline', id: 'b'.repeat(20) }]);
    first.knockGone(ANA);
    first.knockGone('b'.repeat(20), true);
    expect(online.table?.gate.view().waiting).toEqual([{ id: 'b'.repeat(20), name: 'Ben', answered: true, full: true, armed: false }]);

    // The switches go to the relay at once and into the plugin data; a new code ends the pause here too.
    online.table?.gate.setAskToJoin(false);
    online.table?.gate.newCode();
    await advance(100);
    const next = saves.at(-1)?.gate;
    expect(next).toMatchObject({ requireCode: true, askToJoin: false });
    expect(next?.code).not.toBe(code);
    expect(gates(first).slice(1)).toEqual([{ t: 'gate', code, ask: false }, { t: 'gate', code: next?.code, ask: false }]);
    expect(online.table?.gate.view().paused).toBe(false);

    // The companion reloads: the table comes back with the same code, and the relay hears it again.
    online.close();
    const again = control();
    const saved = readSavedTable(JSON.parse(JSON.stringify(saves.at(-1))));
    if (saved === null) throw new Error('no saved table');
    void again.resume(saved);
    await advance(0);
    const second = relay.outbox;
    expect(second).not.toBe(first);
    second.welcome([]);
    await advance(0);
    expect(gates(second)).toEqual([{ t: 'gate', code: next?.code, ask: false }]);
    expect(again.table?.gate.view()).toMatchObject({ code: next?.code, askToJoin: false, waiting: [] });
    // Nothing of the join code is in the link or in what was asked of the server to create the table.
    expect(again.link()).not.toContain(next?.code ?? 'none');
    expect(JSON.stringify(seen.requests)).not.toContain(code);
  });

  it('reads only a whole saved table from the plugin data', () => {
    expect(readSavedTable(JSON.parse(JSON.stringify(SAVED)))).toEqual(SAVED);
    expect(readSavedTable({ ...SAVED, mapPath: undefined })).toEqual({ ...SAVED, mapPath: null });
    // A table saved before plans seats as many as any table did.
    expect(readSavedTable({ ...SAVED, maxPlayers: undefined })).toEqual(SAVED);
    expect(readSavedTable({ ...SAVED, maxPlayers: 2 })).toEqual({ ...SAVED, maxPlayers: 2 });
    // A table saved before tables belonged to a campaign is dropped: the GM starts a new one.
    for (const broken of [undefined, null, 'x', { ...SAVED, code: 'short' }, { ...SAVED, secret: 'a b' }, { ...SAVED, campaignId: undefined }, { ...SAVED, campaignId: '' }]) {
      expect(readSavedTable(broken)).toBeNull();
    }
  });
});
