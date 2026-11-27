import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../../../../src/app/account/http.ts';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import { relayRooms, type CreateRoom, type GmScreenRecord } from '../../../../src/app/online/gmScreen/index.ts';
import { ROOM_IDLE_MS } from '../../../../src/app/online/gmScreen/gmScreenRestart.ts';
import { HELD_MS } from '../../../../src/app/online/gmScreen/heldMarks.ts';
import { CLOSE } from '../../../../src/app/online/protocol/index.ts';
import { fakeTimers } from './fakeTimers.ts';
import { deviceId, RelaySocket, sessionRig, type Rig } from './sessionRig.ts';

const PHONE = deviceId('p');
const DAY_AND_A_BIT = ROOM_IDLE_MS + 60 * 60_000;

beforeEach(() => {
  RelaySocket.all = [];
});
afterEach(() => vi.unstubAllGlobals());

/**
 * The relay's answers to `POST /api/tables` as Atlas's own room port (`relayRooms`) reads them: a room at the
 * code asked for, or, asked for only where the account has none live while `liveElsewhere` says it has,
 * `409 room-live`. Every request is kept.
 */
function relay(liveElsewhere: () => boolean = () => false): { create: CreateRoom; asked: Readonly<Record<string, unknown>>[] } {
  const asked: Readonly<Record<string, unknown>>[] = [];
  const http = (request: HttpRequest): Promise<HttpResponse> => {
    const json = request.json ?? {};
    asked.push(json);
    if (json.unlessLive === true && liveElsewhere()) return Promise.resolve({ status: 409, json: { error: 'room-live' } });
    return Promise.resolve({ status: 201, json: { code: json.code, secret: `room-secret-${asked.length}-0123456789abcdef0123456789`, maxPlayers: 4, kind: 'gm-screen' } });
  };
  const account = { token: () => 'account-token', signedOutByServer: () => undefined, refresh: () => Promise.resolve() };
  return { asked, create: relayRooms(http, 'https://relay.example', account, (() => undefined) as never, fakeTimers()) };
}

async function running(rig: Rig): Promise<Rig> {
  await rig.session.start();
  rig.socket().welcome();
  await rig.settle();
  await rig.device(PHONE);
  rig.socket().receive({ t: 'knock', id: PHONE, name: 'Phone' });
  await rig.settle();
  rig.timers.advance(ARM_MS);
  expect(rig.session.allow(PHONE)).toBe(true);
  rig.socket().receive({ t: 'player-joined', id: PHONE, name: 'Phone' });
  await rig.settle();
  return rig;
}

/** The relay lets a coming-back socket of Atlas open, then closes it with `code`. */
function closesOnArrival(socket: RelaySocket, code: number): void {
  socket.readyState = RelaySocket.OPEN;
  socket.dispatchEvent(new Event('open'));
  socket.drop(code);
}

/** Time passes online: the keep-alives are answered. */
async function online(rig: Rig, ms: number, step = 15_000): Promise<void> {
  const end = rig.timers.now() + ms;
  while (rig.timers.now() < end) {
    rig.timers.advance(step);
    await rig.settle();
  }
}

/** The network blips; returns the socket Atlas comes back on. */
function blips(rig: Rig): RelaySocket {
  const sockets = RelaySocket.all.length;
  rig.socket().drop();
  while (RelaySocket.all.length === sockets) rig.timers.advance(500);
  return rig.socket();
}

describe('Sidekick starting its room again by itself', () => {
  it('never follows a Start: a room started a day after Stop that ends before its welcome is not made a third time', async () => {
    const { create, asked } = relay();
    const rig = await running(sessionRig(null, create));
    rig.session.stop();
    await rig.settle();
    rig.timers.advance(DAY_AND_A_BIT);
    await rig.settle();
    await rig.session.start();
    expect(asked).toHaveLength(2);
    closesOnArrival(rig.socket(), CLOSE.ended);
    await rig.settle();
    rig.timers.advance(10_000);
    await rig.settle();
    expect(asked).toHaveLength(2);
    expect(rig.session.view().status).toBe('stopped');
  });

  it('keeps the mark with what the relay says for as long as Atlas is online, a late timer at a short sleep notwithstanding', async () => {
    const { create, asked } = relay();
    const rig = await running(sessionRig(null, create));
    const sockets = RelaySocket.all.length;
    rig.timers.sleep(11 * 60_000);
    await rig.settle();
    await online(rig, DAY_AND_A_BIT);
    expect(RelaySocket.all.length).toBe(sockets);
    expect(rig.session.view().status).toBe('online');
    expect(rig.timers.now() - (rig.held.read()?.at ?? -Infinity)).toBeLessThanOrEqual(HELD_MS);
    // Somebody ended the room; the relay closes the coming-back host with `ended`.
    closesOnArrival(blips(rig), CLOSE.ended);
    await rig.settle();
    rig.timers.advance(10_000);
    await rig.settle();
    expect(asked).toHaveLength(1);
    expect(rig.session.view().status).toBe('stopped');
  }, 300_000);

  it('writes nothing to the vault on a timer while a session is quiet: the mark is this device\'s, at most one every five minutes', async () => {
    const rig = sessionRig();
    await rig.session.start();
    rig.socket().welcome();
    await rig.settle();
    const records = rig.saved.length;
    const marks = rig.held.written.length;
    await online(rig, 3 * 60 * 60_000, 30_000);
    expect(rig.saved).toHaveLength(records);
    expect(rig.held.written.length - marks).toBeLessThanOrEqual((3 * 60 * 60_000) / HELD_MS);
    expect(rig.held.written.length - marks).toBeGreaterThan(0);
    // The mark names its room by a print that gives nothing of the room's secret away.
    const secret = rig.saved.at(-1)?.secret ?? '';
    expect(secret).not.toBe('');
    expect(JSON.stringify(rig.held.written)).not.toContain(secret.slice(0, 12));
    expect(JSON.stringify(rig.saved)).not.toContain('heldAt');
  }, 120_000);

  it('asks only for a room where the account has none live, and the GM\'s own Start replaces as before', async () => {
    const { create, asked } = relay();
    const rig = await running(sessionRig(null, create));
    rig.timers.sleep(DAY_AND_A_BIT);
    closesOnArrival(blips(rig), CLOSE.ended);
    await rig.settle();
    rig.socket().welcome([{ id: PHONE, name: 'Phone' }]);
    await rig.settle();
    expect(rig.session.view()).toMatchObject({ status: 'online', devices: [{ id: PHONE, connected: true }] });
    expect(asked.map((json) => json.unlessLive === true)).toEqual([false, true]);
  });
});

describe('Sidekick coming back to a room another Sidekick of the account took over', () => {
  it('leaves the room started in another vault alone when this one comes back a day later, and shows itself off without a word', async () => {
    // Vault A ran Sidekick and was closed without Stop.
    const first = await running(sessionRig());
    first.session.close();
    const kept: GmScreenRecord | null = first.saved.at(-1) ?? null;
    // Vault B started its own Sidekick: the relay ended A's room for it, and B's is live.
    RelaySocket.all = [];
    const { create, asked } = relay(() => true);
    const rig = sessionRig(kept, create, first.held);
    rig.timers.sleep((first.held.read()?.at ?? 0) + DAY_AND_A_BIT);
    await rig.session.resume();
    closesOnArrival(rig.socket(), CLOSE.ended);
    await rig.settle();
    rig.timers.advance(60_000);
    await rig.settle();
    expect(asked).toEqual([expect.objectContaining({ unlessLive: true })]);
    expect(rig.session.view()).toMatchObject({ status: 'stopped', problem: null });
    expect(rig.notices).toEqual([]);
    expect(rig.saved.at(-1)?.secret).toBeNull();
    expect(RelaySocket.all.filter((socket) => socket.closedByGm === false && socket.readyState === RelaySocket.OPEN)).toEqual([]);
  });

  it('says it was started elsewhere when it wakes after a long sleep to a room another vault holds', async () => {
    let elsewhere = false;
    const { create, asked } = relay(() => elsewhere);
    const rig = await running(sessionRig(null, create));
    rig.timers.sleep(DAY_AND_A_BIT);
    elsewhere = true;
    closesOnArrival(blips(rig), CLOSE.ended);
    await rig.settle();
    expect(asked).toHaveLength(2);
    expect(rig.session.view()).toMatchObject({ status: 'stopped', problem: 'Sidekick was started in another vault or on another computer, so it stopped here.' });
    expect(rig.notices).toEqual(['Sidekick was started in another vault or on another computer, so it stopped here.']);
    expect(rig.saved.at(-1)?.secret).toBeNull();
  });
});
