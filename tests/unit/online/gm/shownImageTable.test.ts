import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { boundOwnership, fakeCampaigns } from './fakeSeats.ts';
import type { SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { app, png, workspace, storedAccount } from './fakeTable.ts';
import { storedRef } from './fakeStoring.ts';
import { advanceSettled as advance } from './settled.ts';
import { FakeRelay } from './fakeRelay.ts';

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

type Sent = ReturnType<FakeRelay['sent']>[number];
const images = (sent: readonly Sent[]): Sent[] => sent.filter(({ body }) => body.t === 'shown-image');
const shownOf = (sent: Sent | undefined): { readonly id: string } | null | undefined => (sent?.body.t === 'shown-image' ? sent.body.shown : undefined);

describe('the running table\'s shown image', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    workspace.leaves = [];
    workspace.presented = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is the table\'s: shown by its stored id, sent to who joins and again after a reconnect while no scene is shared at all', async () => {
    const changes: number[] = [];
    const players = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }];
    const relay = new FakeRelay();
    const online = new OnlineControl(app, boundOwnership(players), fakeCampaigns(players), undefined, storedAccount(), undefined, undefined, relay.open);
    online.onChange(() => changes.push(changes.length));
    const table = await online.resume(SAVED);
    if (table === null) throw new Error('no table');
    await advance(0);
    relay.outbox.welcome([{ id: ANA, name: 'Ana' }]);
    await advance(100);
    // A welcome says what is shown, which is nothing yet: a page that held an image lets it go.
    expect(images(relay.sent())).toEqual([{ t: 'send', to: undefined, body: { t: 'shown-image', shown: null } }]);

    const bytes = png(320, 200) as Uint8Array<ArrayBuffer>;
    const before = changes.length;
    expect(await table.image.show(() => Promise.resolve({ bytes, mime: 'image/png' }))).toBe('shown');
    await advance(100);
    // The GM's control hears of it.
    expect(changes.length).toBeGreaterThan(before);
    const shown = images(relay.sent()).at(-1);
    expect(shown).toMatchObject({ to: undefined, body: { shown: { image: await storedRef(bytes, 'image/png'), width: 320, height: 200 } } });
    const id = shownOf(shown)?.id;

    // Ben joins: he is sent the same showing.
    let from = relay.sent().length;
    relay.outbox.join({ id: BEN, name: 'Ben' });
    await advance(100);
    expect(images(relay.sent().slice(from))).toMatchObject([{ to: BEN, body: { shown: { id } } }]);

    // The socket is lost and the table welcomed again: everyone is sent the same showing.
    relay.outbox.close(1006);
    await advance(5_000);
    from = relay.sent().length;
    relay.outbox.welcome([{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
    await advance(100);
    expect(images(relay.sent().slice(from))).toMatchObject([{ to: undefined, body: { shown: { id } } }]);

    // Taken away: everyone hears it.
    from = relay.sent().length;
    expect(table.image.dismiss()).toBe(true);
    await advance(100);
    expect(relay.sent().slice(from)).toEqual([{ t: 'send', to: undefined, body: { t: 'shown-image', shown: null } }]);
    online.stop();
  });
});
