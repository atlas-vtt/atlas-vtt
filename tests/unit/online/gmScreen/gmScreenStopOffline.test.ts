import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import type { CreateRoom, RoomAnswer } from '../../../../src/app/online/gmScreen/index.ts';
import { CLOSE } from '../../../../src/app/online/protocol/index.ts';
import { deviceId, RelaySocket, sessionRig, type Rig } from './sessionRig.ts';

const PHONE = deviceId('p');
const LATER = 10 * 60_000;
const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const LATE_SECRET = 'room-secret-late-0123456789abcdef';

/** A relay that makes the room when the test says, answering Start late. */
function pendingCreate(): { create: CreateRoom; answer(code: string, secret: string): void } {
  let answer: (answer: RoomAnswer) => void = () => undefined;
  return {
    create: () => new Promise((resolve) => (answer = resolve)),
    answer: (code, secret) => answer({ room: { code, secret, maxPlayers: 4, kind: 'gm-screen' } }),
  };
}

beforeEach(() => {
  RelaySocket.all = [];
});
afterEach(() => vi.unstubAllGlobals());

async function withPhone(rig = sessionRig()): Promise<Rig> {
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

/** The sockets that said hello with a room's host secret. */
const withSecret = (secret: string | null | undefined): RelaySocket[] => RelaySocket.all.filter((socket) => socket.framesOf('hello').some((hello) => hello.secret === secret));
const ends = (secret: string | null | undefined): number => withSecret(secret).reduce((sum, socket) => sum + socket.framesOf('end').length, 0);
const socketsTo = (code: string | undefined): number => RelaySocket.all.filter((socket) => socket.room === code).length;

/** The socket Atlas opens next to the room at `code`, some while later. */
async function nextSocket(rig: Rig, code: string | undefined): Promise<RelaySocket> {
  rig.timers.advance(LATER);
  await rig.settle();
  const before = socketsTo(code);
  while (socketsTo(code) === before) rig.timers.advance(1000);
  return rig.socket(code);
}

/** Some while later the relay can be reached again and welcomes Atlas at the room at `code`. */
async function relayBack(rig: Rig, code: string | undefined): Promise<void> {
  (await nextSocket(rig, code)).welcome();
  await rig.settle();
}

describe('Stop and New link while the relay cannot be reached', () => {
  it('stops at once, and ends the room as soon as the relay can be reached again', async () => {
    const rig = await withPhone();
    const { link, secret } = rig.saved.at(-1) ?? {};
    rig.socket().drop();
    rig.session.stop();
    expect(rig.session.view().status).toBe('stopped');
    expect(rig.saved.at(-1)).toMatchObject({ secret: null, link, devices: [{ id: PHONE }] });
    await relayBack(rig, link?.code);
    expect(ends(secret)).toBe(1);
    expect(rig.saved.at(-1)?.ending).toEqual([]);
    const tries = socketsTo(link?.code);
    rig.timers.advance(LATER);
    await rig.settle();
    expect(socketsTo(link?.code)).toBe(tries);
  });

  it('makes a new link at once, and ends the old link\'s room, with every device of it, once the relay can be reached', async () => {
    const rig = await withPhone();
    const old = rig.saved.at(-1);
    rig.socket().drop();
    rig.session.newLink();
    await rig.settle();
    rig.socket(rig.saved.at(-1)?.link.code).welcome();
    await rig.settle();
    expect(rig.saved.at(-1)).toMatchObject({ devices: [] });
    expect(rig.saved.at(-1)?.link.code).not.toBe(old?.link.code);
    expect(rig.session.view().status).toBe('online');
    await relayBack(rig, old?.link.code);
    expect(ends(old?.secret)).toBe(1);
    expect(ends(rig.saved.at(-1)?.secret)).toBe(0);
    expect(rig.session.view().status).not.toBe('stopped');
  });

  it('keeps a stopped room until the relay shows it ended: an end lost with its connection is asked again by the next one', async () => {
    const rig = await withPhone();
    const { link, secret } = rig.saved.at(-1) ?? {};
    const gm = rig.socket();
    rig.session.stop();
    // The GM's connection died unnoticed: its end reaches nobody.
    gm.read = gm.sent.length;
    const ender = rig.socket(link?.code);
    expect(ender).not.toBe(gm);
    ender.welcome();
    await macrotask();
    expect(ender.framesOf('end')).toHaveLength(1);
    // The network goes the moment after the welcome: that end is lost too, and no close ever comes.
    ender.read = ender.sent.length;
    expect(rig.saved.at(-1)?.ending).toEqual([{ code: link?.code, secret }]);
    await relayBack(rig, link?.code);
    // The GM's connection's, the lost one's, and the one the relay heard.
    expect(ends(secret)).toBe(3);
    expect(rig.saved.at(-1)?.ending).toEqual([]);
    const tries = socketsTo(link?.code);
    rig.timers.advance(LATER);
    await rig.settle();
    expect(socketsTo(link?.code)).toBe(tries);
  });

  it('ends the room a Start made that Stop overtook, as a stopped room, however long the relay cannot be reached', async () => {
    const asked = pendingCreate();
    const first = sessionRig(null, asked.create);
    void first.session.start();
    await macrotask();
    const code = first.saved.at(-1)?.link.code ?? '';
    first.session.stop();
    asked.answer(code, LATE_SECRET);
    await macrotask();
    expect(first.saved.at(-1)?.ending).toEqual([{ code, secret: LATE_SECRET }]);
    // The relay stays out of reach, and Atlas unloads meanwhile; the next load ends the room.
    first.timers.advance(LATER);
    first.session.close();
    const kept = first.saved.at(-1) ?? null;
    expect(kept?.ending).toEqual([{ code, secret: LATE_SECRET }]);
    RelaySocket.all = [];
    const rig = sessionRig(kept);
    await rig.session.resume();
    rig.socket(code).welcome();
    await rig.settle();
    expect(ends(LATE_SECRET)).toBe(1);
    expect(rig.saved.at(-1)?.ending).toEqual([]);
    expect(rig.created).toEqual([]);
  });

  it('keeps nothing for a room a Start made that an unload overtook, which the next load may own: it is ended while it can be', async () => {
    const asked = pendingCreate();
    const rig = sessionRig(null, asked.create);
    void rig.session.start();
    await macrotask();
    const code = rig.saved.at(-1)?.link.code ?? '';
    rig.session.close();
    const saves = rig.saved.length;
    asked.answer(code, LATE_SECRET);
    await macrotask();
    rig.socket(code).welcome();
    await rig.settle();
    expect(ends(LATE_SECRET)).toBe(1);
    expect(rig.saved).toHaveLength(saves);
  });

  it('ends the room on the next load of Atlas when it could not be reached before Atlas unloaded', async () => {
    const first = await withPhone();
    const { link, secret } = first.saved.at(-1) ?? {};
    first.socket().drop();
    first.session.stop();
    first.session.close();
    const kept = first.saved.at(-1) ?? null;
    expect(kept?.ending).toEqual([{ code: link?.code, secret }]);
    RelaySocket.all = [];
    const rig = sessionRig(kept);
    await rig.session.resume();
    rig.socket(link?.code).welcome();
    await rig.settle();
    expect(ends(secret)).toBe(1);
    expect(rig.saved.at(-1)?.ending).toEqual([]);
    expect(rig.session.view().status).toBe('stopped');
    expect(rig.created).toEqual([]);
  });

  it('started again before the old room could be ended: the relay ends it as it makes the new one, and the new room is never ended', async () => {
    const rig = await withPhone();
    const { secret } = rig.saved.at(-1) ?? {};
    rig.socket().drop();
    rig.session.stop();
    await rig.session.start();
    const fresh = rig.saved.at(-1);
    expect(fresh?.secret).not.toBe(secret);
    expect(fresh?.ending).toEqual([]);
    rig.socket().welcome();
    await rig.settle();
    expect(rig.session.view().status).toBe('online');
    rig.timers.advance(LATER);
    await rig.settle();
    expect([ends(secret), ends(fresh?.secret)]).toEqual([0, 0]);
    expect(rig.session.view().status).not.toBe('stopped');
  });

  it('lets a room go that the relay ended itself, and tries no more', async () => {
    const rig = await withPhone();
    const { link } = rig.saved.at(-1) ?? {};
    rig.socket().drop();
    rig.session.stop();
    const socket = await nextSocket(rig, link?.code);
    socket.readyState = RelaySocket.OPEN;
    socket.dispatchEvent(new Event('open'));
    socket.drop(CLOSE.badSecret);
    await rig.settle();
    expect(rig.saved.at(-1)?.ending).toEqual([]);
    const tries = socketsTo(link?.code);
    rig.timers.advance(LATER);
    await rig.settle();
    expect(socketsTo(link?.code)).toBe(tries);
    expect(rig.notices).toEqual([]);
  });
});
