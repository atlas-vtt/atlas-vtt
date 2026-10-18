// @vitest-environment node
import { CLOSE } from '../../../../src/app/online/protocol/index.ts';
import type { TokenEntity } from '../../../../src/app/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { ARM_MS } from '../../../../src/app/online/gm/joinGate.ts';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { Ownership, readOwnership } from '../../../../src/app/online/gm/ownership.ts';
import { readSavedTable, type SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { closingText } from '../../../../src/app/online/gm/tableEnd.ts';
import { app, atlasTab, FakeSocket, png, present, switchScene, workspace } from './fakeTable.ts';
import { fakeTokenSource } from './fakeTokenSource.ts';
import { sceneState } from './shareHarness.ts';
import { advanceSettled as advance } from './settled.ts';

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
const SAVED: SavedTable = { code: 'a'.repeat(26), secret: 's'.repeat(43), maxPlayers: 12, mapPath: MAP, gate: { code: '483912', requireCode: true, askToJoin: true } };
const ogre = (x: number): TokenEntity => ({ id: 'gm-ogre', kind: 'character', name: 'Ogre', imagePath: 'art/ogre.png', x, y: 140 });

workspace.files = new Map<string, Uint8Array>([['maps/cave.png', png(700, 700)], ['maps/cave2.png', png(350, 350)], ['art/ogre.png', png(4, 4)]]);

const caveScene = (x = 140, mapPath = MAP): SceneState => sceneState({ mapPath, background: 'maps/cave.png', objects: { ...sceneState().objects, tokens: { 'gm-ogre': ogre(x) } } });
const lastScene = (socket: FakeSocket): unknown => socket.bodies().filter((body) => body.t === 'scene').at(-1)?.scene;
const sentSince = (socket: FakeSocket, from: number): string[] => socket.bodies().slice(from).map((body) => body.t);

describe('the online table', () => {
  let saves: (SavedTable | null)[] = [];
  /** A signed-in GM: tables are asked for with the account's token, and nothing else. */
  const signedIn = { token: (): string | null => 'account-token', signedOutByServer: vi.fn(), refresh: vi.fn(() => Promise.resolve()) };
  const control = (ownership = new Ownership(readOwnership(undefined), () => undefined)): OnlineControl =>
    new OnlineControl(app, ownership, (table) => saves.push(table), signedIn);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
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
    online.resume(SAVED);
    await advance(0);
    const socket = FakeSocket.all[0];
    if (socket === undefined) throw new Error('no socket');
    expect(socket.frames()[0]).toMatchObject({ t: 'hello', role: 'gm', secret: SAVED.secret });
    socket.relay({ t: 'welcome', role: 'gm', players: [{ id: ANA, name: 'Ana' }] });
    await advance(500);
    expect(lastScene(socket)).toMatchObject({ map: { mime: 'image/png' } });
    expect(socket.bodies().some((body) => body.t === 'tokens')).toBe(true);

    // Atlas reloads: a store write starts reading another map, then the view closes (its renderer still
    // there while it saves), destroys its renderer, and the leaf is gone; the old store still takes writes.
    const before = socket.bodies().length;
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
    expect(sentSince(socket, before)).toEqual(['scene']);
    expect(lastScene(socket)).toBeNull();
    // A player's move while Atlas is gone reaches no store and breaks nothing.
    socket.relay({ t: 'game', from: ANA, body: { t: 'move', scene: 'x', id: 'y', x: 1, y: 1 } });

    // Atlas is back with a new leaf, view, store and renderer showing the same map: shared anew.
    const second = atlasTab(caveScene(560));
    workspace.leaves = [second.leaf];
    await advance(1_500);
    expect(seen.marks).toHaveLength(2);
    expect(lastScene(socket)).toMatchObject({ map: { mime: 'image/png' } });
    const tokens = socket.bodies().filter((body) => body.t === 'tokens').at(-1);
    expect(tokens?.tokens).toMatchObject([{ x: 560 }]);

    // The tab builds its renderer anew: the marks of the old one go, the scene is shared from the new one.
    const scenesBefore = socket.bodies().filter((body) => body.t === 'scene').length;
    second.view.renderer = fakeTokenSource(() => second.store.getState(), () => undefined, () => 70);
    await advance(1_500);
    expect(seen.marks[1]?.disposed).toBe(true);
    expect(seen.marks).toHaveLength(3);
    expect(socket.bodies().filter((body) => body.t === 'scene').length).toBeGreaterThan(scenesBefore);
    expect(lastScene(socket)).toMatchObject({ map: { mime: 'image/png' } });

    // The GM closes the tab and opens the map again: the table waits, then shares it.
    workspace.leaves = [];
    await advance(1_500);
    expect(seen.notices).toContain('The shared map was closed. Players wait until it is open again.');
    expect(lastScene(socket)).toBeNull();
    expect(online.status()).toBe('online');
    workspace.leaves = [atlasTab(caveScene()).leaf];
    await advance(1_500);
    expect(lastScene(socket)).toMatchObject({ map: { mime: 'image/png' } });
    expect(seen.notices.filter((text) => text.includes('lighting'))).toEqual([]);
    online.stop();
  });

  it('keeps the table in the plugin data through a reload of the companion, with the same link, players and owners', async () => {
    const tab = atlasTab(caveScene());
    workspace.leaves = [tab.leaf];
    present(tab);
    const ownership = new Ownership(readOwnership(undefined), () => undefined);
    const online = control(ownership);
    await online.start(tab.leaf);
    await advance(0);
    const created = saves.at(-1);
    expect(created).toEqual({ code: 'b'.repeat(26), secret: 'n'.repeat(43), maxPlayers: 12, mapPath: MAP, gate: { code: expect.stringMatching(/^\d{6}$/) as string, requireCode: true, askToJoin: true } });
    const link = online.link();
    const socket = FakeSocket.all[0];
    if (socket === undefined || created === null || created === undefined) throw new Error('no table');
    socket.relay({ t: 'welcome', role: 'gm', players: [{ id: ANA, name: 'Ana' }] });
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
    expect(socket.readyState).toBe(3);
    expect(socket.frames().some((frame) => frame.t === 'end')).toBe(false);
    expect(saves.length).toBe(savesBefore);
    const data: unknown = JSON.parse(JSON.stringify({ ownership: ownership.toData(), table: saves.at(-1) }));

    // It loads again from that data: same link and secret, Ana keeps her id and her ogre.
    const record = data as { ownership: unknown; table: unknown };
    const restored = readSavedTable(record.table);
    if (restored === null) throw new Error('the saved table was not read');
    const kept = new Ownership(readOwnership(record.ownership), () => undefined);
    const again = control(kept);
    again.resume(restored);
    await advance(0);
    expect(again.link()).toBe(link);
    const resumed = FakeSocket.all[1];
    if (resumed === undefined) throw new Error('no socket');
    expect(resumed.url).toBe(socket.url);
    expect(resumed.frames()[0]).toMatchObject({ t: 'hello', role: 'gm', secret: created.secret });
    resumed.relay({ t: 'welcome', role: 'gm', players: [{ id: ANA, name: 'Ana' }] });
    await advance(500);
    expect(kept.ownerOf('gm-ogre', undefined)).toBe(ANA);
    const mine = resumed.frames().filter((frame) => frame.t === 'send' && frame.to === ANA && frame.body?.t === 'mine').at(-1);
    expect(mine?.body?.tokens).toHaveLength(1);

    // Stopped by the GM: the table ends on the server and the saved table is forgotten.
    again.stop();
    expect(resumed.frames().at(-1)).toMatchObject({ t: 'end' });
    expect(saves.at(-1)).toBeNull();
  });

  it('forgets a table the server ended or expired, and keeps one another Obsidian took over', async () => {
    workspace.leaves = [atlasTab(caveScene()).leaf];
    const online = control();
    online.resume(SAVED);
    await advance(0);
    FakeSocket.all[0]?.closeWith(CLOSE.replaced);
    expect(online.table).toBeNull();
    expect(saves.at(-1)).toEqual(SAVED);
    expect(online.lost()).toBeNull();

    online.resume(SAVED);
    await advance(0);
    FakeSocket.all[1]?.closeWith(CLOSE.ended);
    expect(online.table).toBeNull();
    expect(saves.at(-1)).toBeNull();
    expect(online.lost()).toBe('refused');
    expect(seen.notices).toEqual(['Another Obsidian took over the online table.', 'The server closed the online table.']);
    expect(signedIn.refresh).not.toHaveBeenCalled();
  });

  it('drops a table whose account may not host, says so, asks what the account may do now, and never tries again', async () => {
    workspace.leaves = [atlasTab(caveScene()).leaf];
    const online = control();
    online.resume(SAVED);
    await advance(0);
    FakeSocket.all[0]?.relay({ t: 'welcome', role: 'gm', players: [] });
    FakeSocket.all[0]?.closeWith(CLOSE.noAccess);
    expect(online.table).toBeNull();
    expect(saves.at(-1)).toBeNull();
    expect(online.lost()).toBe('no-access');
    expect(seen.notices).toEqual(['The online table was closed. This account may not host online tables now.']);
    expect(signedIn.refresh).toHaveBeenCalledWith(true);
    await advance(40_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('drops a table that ended because its account started another, says so, and never tries again', async () => {
    workspace.leaves = [atlasTab(caveScene()).leaf];
    const online = control();
    online.resume(SAVED);
    await advance(0);
    FakeSocket.all[0]?.closeWith(CLOSE.superseded);
    expect(online.table).toBeNull();
    expect(saves.at(-1)).toBeNull();
    expect(online.lost()).toBe('superseded');
    expect(seen.notices).toEqual(['The online table was closed. This account started another table.']);
    expect(signedIn.refresh).not.toHaveBeenCalled();
    await advance(40_000);
    expect(FakeSocket.all).toHaveLength(1);

    // The next table starts clean: what the last one ended by is forgotten.
    const tab = atlasTab(caveScene());
    workspace.leaves = [tab.leaf];
    await online.start(tab.leaf);
    expect(online.lost()).toBeNull();
    online.stop();
  });

  it('knows when the relay closes a table whose account may no longer host, tells the GM once per time, and forgets it at the relay\'s word or a welcome', async () => {
    workspace.leaves = [atlasTab(caveScene()).leaf];
    const online = control();
    let changes = 0;
    online.onChange(() => (changes += 1));
    online.resume(SAVED);
    await advance(0);
    const socket = FakeSocket.all[0];
    if (socket === undefined) throw new Error('no socket');
    socket.relay({ t: 'welcome', role: 'gm', players: [] });
    expect(online.table?.closesAt).toBeNull();
    const closesAt = Date.UTC(2026, 9, 12, 14, 30);
    const before = changes;
    socket.relay({ t: 'access', closesAt });
    expect(online.table?.closesAt).toBe(closesAt);
    expect(changes).toBeGreaterThan(before);
    expect(seen.notices).toEqual([closingText(closesAt)]);
    // A welcome clears it, and the relay's reminder behind the welcome names the same time: no second notice.
    socket.relay({ t: 'welcome', role: 'gm', players: [] });
    expect(online.table?.closesAt).toBeNull();
    socket.relay({ t: 'access', closesAt });
    expect(online.table?.closesAt).toBe(closesAt);
    expect(seen.notices).toHaveLength(1);
    // The account may host again.
    socket.relay({ t: 'access', closesAt: null });
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
    const online = new OnlineControl(app, new Ownership(readOwnership(undefined), () => undefined), (table) => saves.push(table), account);

    seen.created = { status: 403, json: { error: 'no-access' } };
    expect(await online.start(tab.leaf)).toBeNull();
    expect(account.refresh).toHaveBeenCalledWith(true);
    expect(seen.notices.at(-1)).toBe('Online play is in early access. Redeem an invite key on your account page.');

    seen.created = { status: 201, json: { code: 'b'.repeat(26), secret: 'n'.repeat(43), maxPlayers: 2 } };
    await online.start(tab.leaf);
    await advance(0);
    expect(seen.requests.map((request) => request.headers?.Authorization)).toEqual(['Bearer account-token', 'Bearer account-token']);
    expect(online.seats()).toBe(2);
    expect(saves.at(-1)).toMatchObject({ maxPlayers: 2 });
    online.stop();
    await advance(0);

    seen.created = { status: 401, json: { error: 'signed-out' } };
    expect(await online.start(tab.leaf)).toBeNull();
    expect(account.signedOutByServer).toHaveBeenCalledTimes(1);
    expect(await online.start(tab.leaf)).toBeNull();
    expect(seen.notices.at(-1)).toBe('Sign in to host first.');
    expect(seen.requests).toHaveLength(3);
  });

  it('comes back to a saved table on Atlas\'s table server, with its secret alone', async () => {
    workspace.leaves = [atlasTab(caveScene()).leaf];
    const online = new OnlineControl(app, new Ownership(readOwnership(undefined), () => undefined), (table) => saves.push(table), signedIn);
    online.resume(SAVED);
    await advance(0);
    expect(FakeSocket.all.map((socket) => socket.url)).toEqual([`wss://play.atlas-vtt.dev/api/tables/${SAVED.code}/socket`]);
    expect(FakeSocket.all[0]?.frames()[0]).toMatchObject({ t: 'hello', secret: SAVED.secret });
    // The secret is in the hello to that socket and nowhere else: no request was made at all.
    expect(seen.requests).toEqual([]);
    online.close();
  });

  it('makes tables on Atlas\'s table server', async () => {
    const tab = atlasTab(caveScene());
    workspace.leaves = [tab.leaf];
    const online = new OnlineControl(app, new Ownership(readOwnership(undefined), () => undefined), (table) => saves.push(table), signedIn);
    await online.start(tab.leaf);
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
    await online.start(tab.leaf);
    await advance(0);
    const started = saves.at(-1);
    expect(started?.gate).toMatchObject({ requireCode: true, askToJoin: true });
    expect(started?.gate.code).toMatch(/^\d{6}$/);
    const code = started?.gate.code ?? '';
    const socket = FakeSocket.all[0];
    if (socket === undefined) throw new Error('no socket');
    const gates = (from: FakeSocket): unknown[] => from.sent.map((text) => JSON.parse(text) as { t?: string }).filter((frame) => frame.t === 'gate');
    expect(gates(socket)).toEqual([]);
    socket.relay({ t: 'welcome', role: 'gm', players: [], waiting: [{ id: ANA, name: 'Ana' }] });
    await advance(0);
    // Hello, then the gates, ahead of every game message.
    expect(socket.frames().slice(0, 2)).toEqual([{ v: 1, t: 'hello', role: 'gm', secret: 'n'.repeat(43) }, { v: 1, t: 'gate', code, ask: true }]);
    expect(online.table?.gate.view().waiting).toEqual([{ id: ANA, name: 'Ana', answered: false, full: false, armed: false }]);

    const before = changes;
    socket.relay({ t: 'knock', id: 'b'.repeat(20), name: 'Ben' });
    socket.relay({ t: 'gate-paused', until: Date.now() + 60_000 });
    expect(changes).toBeGreaterThan(before);
    expect(online.table?.gate.view()).toMatchObject({ waiting: [{ name: 'Ana' }, { name: 'Ben' }], paused: true });
    // A card that just appeared takes no answer: nothing goes to the relay.
    online.table?.gate.admit(ANA);
    await advance(100);
    expect(socket.frames().some((frame) => frame.t === 'admit' || frame.t === 'decline')).toBe(false);
    await advance(ARM_MS);
    expect(online.table?.gate.view().waiting.map((player) => player.armed)).toEqual([true, true]);
    online.table?.gate.admit(ANA);
    online.table?.gate.decline('b'.repeat(20));
    await advance(100);
    expect(socket.frames().filter((frame) => frame.t === 'admit' || frame.t === 'decline')).toEqual([{ v: 1, t: 'admit', id: ANA }, { v: 1, t: 'decline', id: 'b'.repeat(20) }]);
    socket.relay({ t: 'knock-gone', id: ANA });
    socket.relay({ t: 'knock-gone', id: 'b'.repeat(20), full: true });
    expect(online.table?.gate.view().waiting).toEqual([{ id: 'b'.repeat(20), name: 'Ben', answered: true, full: true, armed: false }]);

    // The switches go to the relay at once and into the plugin data; a new code ends the pause here too.
    online.table?.gate.setAskToJoin(false);
    online.table?.gate.newCode();
    await advance(100);
    const next = saves.at(-1)?.gate;
    expect(next).toMatchObject({ requireCode: true, askToJoin: false });
    expect(next?.code).not.toBe(code);
    expect(gates(socket).slice(1)).toEqual([{ v: 1, t: 'gate', code, ask: false }, { v: 1, t: 'gate', code: next?.code, ask: false }]);
    expect(online.table?.gate.view().paused).toBe(false);

    // The companion reloads: the table comes back with the same code, and the relay hears it again.
    online.close();
    const again = control();
    const saved = readSavedTable(JSON.parse(JSON.stringify(saves.at(-1))));
    if (saved === null) throw new Error('no saved table');
    again.resume(saved);
    await advance(0);
    const second = FakeSocket.all.at(-1);
    if (second === undefined || second === socket) throw new Error('no second socket');
    second.relay({ t: 'welcome', role: 'gm', players: [] });
    await advance(0);
    expect(gates(second)).toEqual([{ v: 1, t: 'gate', code: next?.code, ask: false }]);
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
    for (const broken of [undefined, null, 'x', { ...SAVED, code: 'short' }, { ...SAVED, secret: 'a b' }]) {
      expect(readSavedTable(broken)).toBeNull();
    }
  });
});
