import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import type { CreateRoom, GmScreenRecord, RoomAnswer } from '../../../../src/app/online/gmScreen/index.ts';
import { expiredWhileAway, HELD_MS, MAX_RESTARTS, ROOM_IDLE_MS } from '../../../../src/app/online/gmScreen/gmScreenRestart.ts';
import { SIGN_IN_TEXT } from '../../../../src/app/online/gmScreen/gmScreenRoom.ts';
import { CLOSE } from '../../../../src/app/online/protocol/index.ts';
import { deviceId, RelaySocket, sessionRig, type Rig } from './sessionRig.ts';

const PHONE = deviceId('p');
const DAY_AND_A_BIT = ROOM_IDLE_MS + 60 * 60_000;

beforeEach(() => {
  RelaySocket.all = [];
});
afterEach(() => vi.unstubAllGlobals());

/** A relay that makes rooms at the code asked for, or answers what `refuse` says for the attempt (0 the first). */
function relay(refuse: (attempt: number) => RoomAnswer | null = () => null): { create: CreateRoom; created: string[] } {
  const created: string[] = [];
  return {
    created,
    create: (code) => {
      const attempt = created.push(code) - 1;
      return Promise.resolve(refuse(attempt) ?? { room: { code, secret: `room-secret-${attempt}-0123456789abcdef`, maxPlayers: 4, kind: 'gm-screen' } });
    },
  };
}

/** Started, with a phone allowed and connected. */
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

/** The relay answers a coming-back socket of Atlas: it lets it open, then closes it with `code`. */
function closesOnArrival(socket: RelaySocket, code: number): void {
  socket.readyState = RelaySocket.OPEN;
  socket.dispatchEvent(new Event('open'));
  socket.drop(code);
}

/** The computer sleeps for `ms`; on waking Atlas finds its socket dead and tries again; returns that try's socket. */
async function sleepsAndWakes(rig: Rig, ms: number): Promise<RelaySocket> {
  const before = RelaySocket.all.length;
  rig.timers.sleep(ms);
  rig.socket().drop();
  while (RelaySocket.all.length === before) rig.timers.advance(500);
  return rig.socket();
}

/** Time passes while the relay answers: its keep-alives are answered, and what Atlas waits for comes. */
async function passes(rig: Rig, ms: number, until: () => boolean = () => false): Promise<void> {
  const end = rig.timers.now() + ms;
  while (rig.timers.now() < end && !until()) {
    rig.timers.advance(1000);
    await rig.settle();
  }
}

/** Every frame Atlas sent into the relay on the sockets from `from` on. */
const framesFrom = (from: number): number => RelaySocket.all.slice(from).reduce((sum, socket) => sum + socket.sent.length, 0);

describe('Sidekick\'s room, which the relay let expire while Atlas was away', () => {
  it('is told from every other end by its close and the time away alone', () => {
    const away = { closeCode: CLOSE.ended, whileOnline: false, heldAt: 0, now: ROOM_IDLE_MS };
    expect(expiredWhileAway(away)).toBe(true);
    expect(expiredWhileAway({ ...away, now: ROOM_IDLE_MS - 1 })).toBe(false);
    expect(expiredWhileAway({ ...away, whileOnline: true })).toBe(false);
    expect(expiredWhileAway({ ...away, heldAt: undefined })).toBe(false);
    for (const closeCode of [CLOSE.superseded, CLOSE.badSecret, CLOSE.noAccess, CLOSE.version, CLOSE.replaced, null]) expect(expiredWhileAway({ ...away, closeCode })).toBe(false);
  });

  it('runs again at the same link with its devices after a long sleep, without a word, and the phone comes back by its own code', async () => {
    const { create, created } = relay();
    const rig = await running(sessionRig(null, create));
    const { link } = rig.saved.at(-1)!;
    const first = RelaySocket.all.length;
    closesOnArrival(await sleepsAndWakes(rig, DAY_AND_A_BIT), CLOSE.ended);
    await rig.settle();
    expect(created).toEqual([link.code, link.code]);
    const fresh = rig.socket();
    expect(fresh.room).toBe(link.code);
    fresh.welcome();
    await rig.settle();
    expect(fresh.frames()[0]).toMatchObject({ t: 'hello', secret: 'room-secret-1-0123456789abcdef' });
    expect(fresh.framesOf('players')).toEqual([{ v: 1, t: 'players', players: [{ id: PHONE, name: 'Phone', code: rig.saved.at(-1)?.devices[0]?.code }] }]);
    const phone = await rig.device(PHONE);
    fresh.receive({ t: 'player-joined', id: PHONE, name: 'Phone' });
    await rig.settle();
    expect(rig.session.view()).toMatchObject({ status: 'online', problem: null, knock: null, devices: [{ id: PHONE, connected: true }] });
    expect(phone.heard.at(-1)).toMatchObject({ t: 'your-code', first: false });
    expect(rig.saved.at(-1)?.link).toEqual(link);
    expect(rig.notices).toEqual([]);
    // From the wake to the phone back: the coming-back hello the relay refuses, then hello, gate, roster and the phone's two channel frames.
    expect(framesFrom(first)).toBe(6);
  });

  it('runs again when Obsidian was quit without Stop and opened a day later, with its devices and without a word', async () => {
    const first = await running(sessionRig());
    first.session.close();
    const kept: GmScreenRecord | null = first.saved.at(-1) ?? null;
    expect(kept?.heldAt).toBe(first.timers.now());
    RelaySocket.all = [];
    const { create, created } = relay();
    const rig = sessionRig(kept, create);
    rig.timers.sleep(kept!.heldAt! + DAY_AND_A_BIT);
    await rig.session.resume();
    closesOnArrival(rig.socket(), CLOSE.ended);
    await rig.settle();
    expect(created).toEqual([kept?.link.code]);
    rig.socket().welcome([{ id: PHONE, name: 'Phone' }]);
    await rig.settle();
    expect(rig.session.view()).toMatchObject({ status: 'online', problem: null, devices: [{ id: PHONE, connected: true }] });
    expect(rig.notices).toEqual([]);
  });

  it('stays stopped where the room ended sooner than the relay lets a room expire: somebody ended it', async () => {
    const { create, created } = relay();
    const rig = await running(sessionRig(null, create));
    closesOnArrival(await sleepsAndWakes(rig, 8 * 60 * 60_000), CLOSE.ended);
    await rig.settle();
    expect(created).toHaveLength(1);
    expect(rig.session.view().status).toBe('stopped');
    expect(rig.notices).toEqual(['The server ended Sidekick.']);
  });

  it('marks nothing on a late timer at the wake, which would make a long sleep look short', async () => {
    const rig = await running(sessionRig());
    const held = rig.saved.at(-1)?.heldAt ?? -1;
    await passes(rig, HELD_MS + 1000);
    const marked = rig.saved.at(-1)?.heldAt ?? -1;
    expect(marked).toBe(held + HELD_MS);
    rig.timers.sleep(DAY_AND_A_BIT);
    expect(rig.saved.at(-1)?.heldAt).toBe(marked);
  });

  it('is not started again after Stop, after New link, or when started on another computer', async () => {
    const stopped = relay();
    const a = await running(sessionRig(null, stopped.create));
    a.session.stop();
    a.timers.sleep(DAY_AND_A_BIT);
    a.timers.advance(10 * 60_000);
    await a.settle();
    expect(stopped.created).toHaveLength(1);
    expect(a.session.view().status).toBe('stopped');

    RelaySocket.all = [];
    const renewed = relay();
    const b = await running(sessionRig(null, renewed.create));
    const old = b.saved.at(-1)?.link.code;
    b.session.newLink();
    await b.settle();
    b.timers.sleep(DAY_AND_A_BIT);
    b.timers.advance(10 * 60_000);
    await b.settle();
    expect(renewed.created.filter((code) => code === old)).toHaveLength(1);

    for (const code of [CLOSE.superseded, CLOSE.badSecret]) {
      RelaySocket.all = [];
      const elsewhere = relay();
      const c = await running(sessionRig(null, elsewhere.create));
      closesOnArrival(await sleepsAndWakes(c, DAY_AND_A_BIT), code);
      await c.settle();
      expect(elsewhere.created).toHaveLength(1);
      expect(c.session.view().status).toBe('stopped');
      expect(c.notices).toHaveLength(1);
    }
  });

  it('stops with its reason, said once, where the account is signed out by then', async () => {
    const { create, created } = relay((attempt) => (attempt > 0 ? { refused: SIGN_IN_TEXT } : null));
    const rig = await running(sessionRig(null, create));
    closesOnArrival(await sleepsAndWakes(rig, DAY_AND_A_BIT), CLOSE.ended);
    await rig.settle();
    expect(created).toHaveLength(2);
    expect(rig.session.view()).toMatchObject({ status: 'stopped', problem: SIGN_IN_TEXT });
    expect(rig.notices).toEqual([SIGN_IN_TEXT]);
    expect(rig.saved.at(-1)?.secret).toBeNull();
  });

  it('asks the relay again while it cannot be reached, as reconnects wait, shown as connecting, and runs once it can', async () => {
    const { create, created } = relay((attempt) => (attempt === 1 || attempt === 2 ? { refused: 'unreachable', later: true } : null));
    const rig = await running(sessionRig(null, create));
    closesOnArrival(await sleepsAndWakes(rig, DAY_AND_A_BIT), CLOSE.ended);
    await rig.settle();
    expect(rig.session.view().status).toBe('connecting');
    await passes(rig, 30_000, () => created.length === 4);
    expect(created).toHaveLength(4);
    rig.socket().welcome();
    await rig.settle();
    expect(rig.session.view().status).toBe('online');
    expect(rig.notices).toEqual([]);
  });

  it('gives up, saying why, on a room that keeps ending before the relay welcomes it, waiting longer each time', async () => {
    const { create, created } = relay();
    const rig = await running(sessionRig(null, create));
    closesOnArrival(await sleepsAndWakes(rig, DAY_AND_A_BIT), CLOSE.ended);
    await rig.settle();
    const waits: number[] = [];
    for (let restart = 1; restart <= MAX_RESTARTS; restart++) {
      expect(created).toHaveLength(restart + 1);
      closesOnArrival(rig.socket(), CLOSE.ended);
      const at = rig.timers.now();
      while (created.length === restart + 1 && rig.timers.now() - at < 60_000) {
        rig.timers.advance(100);
        await rig.settle();
      }
      waits.push(rig.timers.now() - at);
    }
    expect(created).toHaveLength(MAX_RESTARTS + 1);
    expect(waits[0]!).toBeGreaterThanOrEqual(2000);
    expect(waits[1]!).toBeGreaterThanOrEqual(waits[0]!);
    expect(rig.session.view()).toMatchObject({ status: 'stopped', problem: 'The server ended Sidekick.' });
    expect(rig.notices).toEqual(['The server ended Sidekick.']);
  });

  it('stops for good on Stop while it waits to start again', async () => {
    const { create, created } = relay((attempt) => (attempt > 0 ? { refused: 'unreachable', later: true } : null));
    const rig = await running(sessionRig(null, create));
    closesOnArrival(await sleepsAndWakes(rig, DAY_AND_A_BIT), CLOSE.ended);
    await rig.settle();
    expect(rig.session.view().status).toBe('connecting');
    rig.session.stop();
    const asked = created.length;
    await passes(rig, 10 * 60_000);
    expect(created).toHaveLength(asked);
    expect(rig.session.view()).toMatchObject({ status: 'stopped', problem: null });
    expect(rig.notices).toEqual([]);
  });
});
