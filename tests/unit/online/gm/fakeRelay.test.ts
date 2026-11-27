import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PART_BYTES, type GmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { TableEvents } from '../../../../src/app/online/gm/TableConnection.ts';
import { FakeRelay, type RelayOutbox } from './fakeRelay.ts';

const ANA = { id: 'a'.repeat(20), name: 'Ana' };
const BEN = { id: 'b'.repeat(20), name: 'Ben' };
const SCENE = 'scene-1';

const quiet: TableEvents = { status: () => {}, welcome: () => {}, joined: () => {}, left: () => {}, message: () => {}, access: () => {} };
const scene = (name: string): GmMessage => ({ t: 'scene', scene: { id: name } as never });
const place = (x: number): GmMessage => ({ t: 'live', scene: SCENE, at: x, tokens: [{ id: '0'.repeat(24), x, y: 100 }] });

/** What a page read, as the scene names and live places it was told, in order. */
const read = (relay: FakeRelay, player: string): string[] =>
  relay.pages.of(player).all('scene', 'live').map((message) => (message.t === 'scene' ? String(message.scene?.id) : `live ${message.tokens[0]?.x}`));

function openTable(): { readonly relay: FakeRelay; readonly outbox: RelayOutbox } {
  const relay = new FakeRelay();
  const outbox = relay.open({ code: 'ABCDEF', secret: 's'.repeat(32), maxPlayers: 6 }, quiet, null) as RelayOutbox;
  outbox.start();
  return { relay, outbox };
}

describe('the fake relay', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reaches only the pages a reconnect welcome names, as the table knows nobody else to be there', () => {
    const { relay, outbox } = openTable();
    outbox.welcome([ANA, BEN]);
    outbox.close(1006);
    outbox.welcome([ANA]);
    outbox.send(scene('cave'));
    vi.advanceTimersByTime(1_000);
    expect([...outbox.connected]).toEqual([ANA.id]);
    expect(read(relay, ANA.id)).toEqual(['cave']);
    expect(read(relay, BEN.id)).toEqual([]);
  });

  it('puts a live message ahead of ordinary ones that wait, and keeps only the latest of its key, while the relay takes batches', () => {
    const { relay, outbox } = openTable();
    outbox.welcome([ANA], { batch: true });
    outbox.send(scene('cave'));
    outbox.send(scene('hall'));
    outbox.sendLive(place(140), 'drag');
    outbox.sendLive(place(180), 'drag');
    vi.advanceTimersByTime(1_000);
    expect(read(relay, ANA.id)).toEqual(['cave', 'live 180', 'hall']);
  });

  it('lets live messages past a full socket while ordinary ones wait for it to drain', () => {
    const { relay, outbox } = openTable();
    outbox.welcome([ANA]);
    outbox.socket.bufferedAmount = 1024 * 1024 - 1;
    outbox.send(scene('cave'));
    outbox.sendLive(place(140), 'drag');
    vi.advanceTimersByTime(1_000);
    expect(read(relay, ANA.id)).toEqual(['live 140']);
    outbox.socket.bufferedAmount = 0;
    vi.advanceTimersByTime(1_000);
    expect(read(relay, ANA.id)).toEqual(['live 140', 'cave']);
  });

  it('hands a message too large for one frame on in parts, which the page and the relay\'s record read as the one message', () => {
    const { relay, outbox } = openTable();
    outbox.welcome([ANA]);
    const large = scene('x'.repeat(PART_BYTES * 2));
    outbox.send(large);
    vi.advanceTimersByTime(1_000);
    expect(relay.pages.of(ANA.id).inbox).toEqual([large]);
    expect(relay.sent()).toEqual([{ t: 'send', to: undefined, body: large }]);
  });
});
