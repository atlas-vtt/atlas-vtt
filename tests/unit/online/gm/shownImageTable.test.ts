import { ALL_PLAYERS } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { Ownership } from '../../../../src/app/online/gm/ownership.ts';
import { boundOwnership, fakeCampaigns } from './fakeSeats.ts';
import type { SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { app, FakeSocket, png, workspace } from './fakeTable.ts';
import { advanceSettled as advance } from './settled.ts';

vi.mock('obsidian', () => ({
  Notice: class {},
  normalizePath: (path: string) => path,
  requestUrl: () => Promise.resolve({ status: 201, json: null }),
  PluginSettingTab: class {},
  Setting: class {},
}));

const ANA = 'anaanaanaanaanaanaan';
const BEN = 'benbenbenbenbenbenbe';
const SAVED: SavedTable = { code: 'a'.repeat(26), secret: 's'.repeat(43), maxPlayers: 12, campaignId: 'c1', mapPath: null, gate: { code: '483912', requireCode: false, askToJoin: false } };

interface Sent {
  readonly to: string | undefined;
  readonly body: { readonly t: string; readonly shown?: { readonly id: string; readonly image: { readonly hash: string } } | null; readonly hash?: string };
}

const sends = (socket: FakeSocket): Sent[] => socket.frames().flatMap((frame) => (frame.t === 'send' && frame.body !== undefined ? [{ to: frame.to, body: frame.body }] : []));
const images = (sent: readonly Sent[]): Sent[] => sent.filter(({ body }) => body.t === 'shown-image');

describe('the running table\'s shown image', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    workspace.leaves = [];
    workspace.presented = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is the table\'s: shown, served, sent to who joins and again after a reconnect while no scene is shared at all', async () => {
    const changes: number[] = [];
    const players = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }];
    const online = new OnlineControl(app, boundOwnership(players), fakeCampaigns(players));
    online.onChange(() => changes.push(changes.length));
    const table = await online.resume(SAVED);
    if (table === null) throw new Error('no table');
    await advance(0);
    const socket = FakeSocket.all[0];
    if (socket === undefined) throw new Error('no socket');
    socket.relay({ t: 'welcome', role: 'gm', players: [{ id: ANA, name: 'Ana' }] });
    await advance(100);
    // A welcome says what is shown, which is nothing yet: a page that held an image lets it go.
    expect(images(sends(socket))).toEqual([{ to: ALL_PLAYERS, body: { t: 'shown-image', shown: null } }]);

    const bytes = png(320, 200) as Uint8Array<ArrayBuffer>;
    const hash = await sha256Hex(bytes);
    const before = changes.length;
    expect(await table.image.show(() => Promise.resolve({ bytes, mime: 'image/png' }))).toBe('shown');
    await advance(100);
    // The GM's control hears of it.
    expect(changes.length).toBeGreaterThan(before);
    const shown = images(sends(socket)).at(-1);
    expect(shown).toMatchObject({ to: ALL_PLAYERS, body: { shown: { image: { hash, mime: 'image/png' }, width: 320, height: 200 } } });
    const id = shown?.body.shown?.id;

    // Ana asks for it: served to her alone, by the table, though no scene is shared that could.
    let from = sends(socket).length;
    socket.relay({ t: 'game', from: ANA, body: { t: 'asset-request', hash } });
    await advance(100);
    const answer = sends(socket).slice(from);
    expect(answer.length).toBeGreaterThan(0);
    expect(answer.every(({ to, body }) => to === ANA && body.t === 'asset-chunk' && body.hash === hash)).toBe(true);

    // Ben joins: he is sent the same showing.
    from = sends(socket).length;
    socket.relay({ t: 'player-joined', id: BEN, name: 'Ben' });
    await advance(100);
    expect(images(sends(socket).slice(from))).toMatchObject([{ to: BEN, body: { shown: { id } } }]);

    // The socket is lost and the table welcomed again: everyone is sent the same showing.
    socket.closeWith(1006);
    await advance(5_000);
    const next = FakeSocket.all.at(-1);
    if (next === undefined || next === socket) throw new Error('no second socket');
    next.relay({ t: 'welcome', role: 'gm', players: [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }] });
    await advance(100);
    expect(images(sends(next))).toMatchObject([{ to: ALL_PLAYERS, body: { shown: { id } } }]);

    // Taken away: everyone hears it, and nobody is served it any more.
    from = sends(next).length;
    expect(table.image.dismiss()).toBe(true);
    next.relay({ t: 'game', from: BEN, body: { t: 'asset-request', hash } });
    await advance(100);
    expect(sends(next).slice(from)).toEqual([{ to: ALL_PLAYERS, body: { t: 'shown-image', shown: null } }]);
    online.stop();
  });
});
