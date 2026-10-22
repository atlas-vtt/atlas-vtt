import { CLOSE, KEEPALIVE_MS, KEEPALIVE_PING, KEEPALIVE_PONG } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Timers } from '../../../../src/app/online/gm/companionTimers.ts';
import { BATCH_MS, BURST } from '../../../../src/app/online/gm/sendQueue.ts';
import { FLUSH_LOOK_MS, LATE_MS, OPEN_TIMEOUT_MS, PULSE_DEADLINE_MS, SETTLE_MS, WELCOME_TIMEOUT_MS } from '../../../../src/app/online/gm/socketWatch.ts';
import { TableConnection, type TableStatus } from '../../../../src/app/online/gm/TableConnection.ts';

/** A WebSocket the test opens, feeds and closes; `bufferedAmount` is what it holds unsent. */
class FakeSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static all: FakeSocket[] = [];
  static refuses = false;
  readyState = FakeSocket.CONNECTING;
  bufferedAmount = 0;
  readonly sent: string[] = [];
  closedByGm = false;

  constructor(readonly url: string) {
    super();
    if (FakeSocket.refuses) throw new Error('refused');
    FakeSocket.all.push(this);
  }

  send(text: string): void {
    this.sent.push(text);
  }

  close(): void {
    this.closedByGm = true;
    this.readyState = FakeSocket.CLOSING;
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  receive(data: string): void {
    this.dispatchEvent(Object.assign(new Event('message'), { data }));
  }

  welcome(players: readonly { id: string; name: string }[] = [], batch = false): void {
    this.open();
    this.receive(JSON.stringify({ v: 1, t: 'welcome', role: 'gm', players, ...(batch && { batch: true }) }));
  }

  drop(code = 1006): void {
    this.readyState = FakeSocket.CLOSED;
    this.dispatchEvent(Object.assign(new Event('close'), { code }));
  }

  pings(): number {
    return this.sent.filter((text) => text === KEEPALIVE_PING).length;
  }
}

/**
 * The companion's timers under the test's hand. `advance` runs them on time; `late` moves the clock on
 * while nothing runs (a hidden window, a machine asleep) and hands back what is due, for the test to
 * run when it likes, as the browser does when the window wakes.
 */
function fakeTimers(): Timers & { advance(ms: number): void; late(ms: number): (() => void)[]; pending(): number } {
  let now = 0;
  let timers: { at: number; run: () => void; id: number }[] = [];
  let ids = 0;
  const due = (): { at: number; run: () => void; id: number }[] => {
    const ready = timers.filter((timer) => timer.at <= now).sort((a, b) => a.at - b.at);
    timers = timers.filter((timer) => timer.at > now);
    return ready;
  };
  return {
    now: () => now,
    setTimer: (run, ms) => (timers.push({ at: now + ms, run, id: (ids += 1) }), ids),
    clearTimer: (id) => void (timers = timers.filter((timer) => timer.id !== id)),
    advance: (ms) => {
      const end = now + ms;
      for (;;) {
        const next = timers.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at)[0];
        if (next === undefined) break;
        now = next.at;
        timers = timers.filter((timer) => timer !== next);
        next.run();
      }
      now = end;
    },
    late: (ms) => {
      now += ms;
      return due().map((timer) => timer.run);
    },
    pending: () => timers.length,
  };
}

const last = (): FakeSocket => {
  const socket = FakeSocket.all.at(-1);
  if (socket === undefined) throw new Error('no socket');
  return socket;
};

function table(): { connection: TableConnection; timers: ReturnType<typeof fakeTimers>; statuses: TableStatus[]; welcomes: number[]; closing: (number | null)[] } {
  const timers = fakeTimers();
  const statuses: TableStatus[] = [];
  const welcomes: number[] = [];
  const closing: (number | null)[] = [];
  const connection = new TableConnection('https://relay.example', 'abcdefghijklmnopqrstuvwxyz', 'host-secret-0123456789abcdefABCDEF', {
    status: (status) => statuses.push(status), welcome: (players) => welcomes.push(players.length), joined: () => undefined, left: () => undefined, message: () => undefined, access: (closesAt) => closing.push(closesAt),
  }, null, timers);
  connection.start();
  return { connection, timers, statuses, welcomes, closing };
}

beforeEach(() => {
  FakeSocket.all = [];
  FakeSocket.refuses = false;
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => vi.unstubAllGlobals());

describe('the GM\'s try to reach the table', () => {
  it('gives up a socket that never opens after 10 s and tries again, where it waited for good', () => {
    expect(OPEN_TIMEOUT_MS).toBe(10_000);
    const { timers, statuses } = table();
    const first = last();
    timers.advance(OPEN_TIMEOUT_MS - 1);
    expect(first.closedByGm).toBe(false);
    timers.advance(1);
    expect(first.closedByGm).toBe(true);
    expect(statuses.at(-1)).toBe('connecting');
    timers.advance(1_000);
    expect(FakeSocket.all).toHaveLength(2);
    // What the socket given up on still does changes nothing: it says no hello and times no second try.
    first.open();
    expect(first.sent).toEqual([]);
    first.drop();
    timers.advance(OPEN_TIMEOUT_MS - 1_001);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('gives up a socket that opens and is not welcomed within 8 s', () => {
    expect(WELCOME_TIMEOUT_MS).toBe(8_000);
    const { timers } = table();
    const first = last();
    timers.advance(OPEN_TIMEOUT_MS - 1);
    first.open();
    expect(first.sent).toHaveLength(1);
    timers.advance(WELCOME_TIMEOUT_MS - 1);
    expect(first.closedByGm).toBe(false);
    timers.advance(1);
    expect(first.closedByGm).toBe(true);
    timers.advance(1_000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('never stops trying: a socket that never opens is followed by the next, at most 40 s apart', () => {
    const { timers } = table();
    for (let round = 0; round < 12; round += 1) {
      const before = FakeSocket.all.length;
      timers.advance(OPEN_TIMEOUT_MS + 30_000);
      expect(FakeSocket.all.length).toBeGreaterThan(before);
    }
    expect(FakeSocket.all.slice(0, -1).every((socket) => socket.closedByGm)).toBe(true);
  });

  it('tries again when the socket cannot even be made', () => {
    FakeSocket.refuses = true;
    const { timers, statuses } = table();
    expect(FakeSocket.all).toHaveLength(0);
    expect(statuses.at(-1)).toBe('connecting');
    FakeSocket.refuses = false;
    timers.advance(1_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('never holds two sockets: one still there when another try starts is given up first', () => {
    const { connection } = table();
    const first = last();
    connection.start();
    expect(FakeSocket.all).toHaveLength(2);
    expect(first.closedByGm).toBe(true);
    first.welcome();
    expect(first.sent).toEqual([]);
  });

  it('does not take a timer that fired late for a socket that hangs: what waited with it is heard first', () => {
    const { timers, statuses } = table();
    const first = last();
    // The window was hidden or the machine asleep: the 10 s ran out long ago when the timer fires, and the socket's open waits beside it.
    const overdue = timers.late(5 * 60_000);
    for (const run of overdue) run();
    expect(first.closedByGm, 'not judged yet').toBe(false);
    first.welcome();
    timers.advance(SETTLE_MS + 1);
    expect(first.closedByGm).toBe(false);
    expect(statuses.at(-1)).toBe('online');
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('gives up a socket that still hangs once a late timer has waited for what queued up', () => {
    expect(SETTLE_MS).toBe(1_000);
    const { timers } = table();
    const first = last();
    for (const run of timers.late(5 * 60_000)) run();
    timers.advance(SETTLE_MS - 1);
    expect(first.closedByGm).toBe(false);
    timers.advance(1);
    expect(first.closedByGm).toBe(true);
  });

  it('stops for good when the relay refuses the table, with nothing left timed', () => {
    const { timers, statuses } = table();
    last().open();
    last().drop(CLOSE.badSecret);
    expect(statuses.at(-1)).toBe('refused');
    expect(timers.pending()).toBe(0);
    timers.advance(10 * 60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('stops for good when the account may not host, or started another table: neither is tried again', () => {
    for (const code of [CLOSE.noAccess, CLOSE.superseded]) {
      FakeSocket.all = [];
      const { connection, timers, statuses } = table();
      last().welcome();
      last().drop(code);
      expect(statuses.at(-1), String(code)).toBe('refused');
      expect(connection.closeCode).toBe(code);
      expect(timers.pending()).toBe(0);
      timers.advance(10 * 60_000);
      expect(FakeSocket.all, String(code)).toHaveLength(1);
    }
  });

  it('passes on when the relay says the table closes, and that it no longer does: by its word, or by a welcome', () => {
    const { timers, closing } = table();
    last().welcome();
    expect(closing).toEqual([null]);
    last().receive('{"v":1,"t":"access","closesAt":1760000000000}');
    last().receive('{"v":1,"t":"access","closesAt":null}');
    last().receive('{"v":1,"t":"access","closesAt":1760000000000}');
    expect(closing).toEqual([null, 1760000000000, null, 1760000000000]);
    // The socket drops and comes back: the welcome clears the word, and the relay's reminder behind it sets it again.
    last().drop();
    timers.advance(1_000);
    last().welcome();
    expect(closing.at(-1)).toBeNull();
    last().receive('{"v":1,"t":"access","closesAt":1760000000000}');
    expect(closing.at(-1)).toBe(1760000000000);
    // A frame that is no such word changes nothing.
    last().receive('{"v":1,"t":"access","closesAt":"soon"}');
    expect(closing).toHaveLength(6);
  });
});

describe('the pulse of the GM\'s socket', () => {
  it('replaces a welcomed socket that died without a close, within 50 s, and the status says so meanwhile', () => {
    expect(KEEPALIVE_MS).toBe(30_000);
    expect(PULSE_DEADLINE_MS).toBe(20_000);
    const { timers, statuses, welcomes } = table();
    const first = last();
    first.welcome([{ id: 'abcdefghijklmnopqrst', name: 'Ana' }]);
    expect(statuses.at(-1)).toBe('online');
    timers.advance(KEEPALIVE_MS + PULSE_DEADLINE_MS - 1);
    expect(first.pings()).toBe(1);
    expect(first.closedByGm).toBe(false);
    timers.advance(1);
    expect(first.closedByGm).toBe(true);
    expect(statuses.at(-1), 'the panel no longer says online').toBe('connecting');
    timers.advance(1_000);
    last().welcome();
    expect(statuses.at(-1)).toBe('online');
    expect(welcomes, 'the players are sent everything anew, once').toEqual([1, 0]);
  });

  it('keeps a socket that answers, for as long as it does, with one ping every 30 s', () => {
    const { timers, connection } = table();
    const socket = last();
    socket.welcome();
    timers.advance(KEEPALIVE_MS - 120);
    for (let beat = 0; beat < 20; beat += 1) {
      timers.advance(120);
      timers.advance(120);
      socket.receive(KEEPALIVE_PONG);
      timers.advance(KEEPALIVE_MS - 240);
    }
    expect(FakeSocket.all).toHaveLength(1);
    expect(socket.pings()).toBe(20);
    expect(connection.stats().latencyMs).toBe(120);
  });

  it('takes any frame for a sign of life', () => {
    const { timers } = table();
    last().welcome();
    timers.advance(KEEPALIVE_MS + PULSE_DEADLINE_MS - 1);
    last().receive(JSON.stringify({ v: 1, t: 'player-left', id: 'abcdefghijklmnopqrst' }));
    timers.advance(KEEPALIVE_MS - PULSE_DEADLINE_MS);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('does not declare a healthy socket dead because its timer fired late: an answer that waited beside it counts', () => {
    const { timers, statuses } = table();
    const socket = last();
    socket.welcome();
    // Hidden for five minutes: every beat and its deadline are overdue at once, and so is the relay's answer.
    const overdue = timers.late(5 * 60_000);
    for (const run of overdue) run();
    expect(socket.closedByGm, 'a late timer judges nothing').toBe(false);
    socket.receive(KEEPALIVE_PONG);
    timers.advance(SETTLE_MS + LATE_MS);
    expect(socket.closedByGm).toBe(false);
    expect(statuses.at(-1)).toBe('online');
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('does replace a socket that is silent after such a wake, once a keep-alive has had its full time', () => {
    const { timers } = table();
    const socket = last();
    socket.welcome();
    for (const run of timers.late(5 * 60_000)) run();
    expect(socket.closedByGm).toBe(false);
    timers.advance(KEEPALIVE_MS + PULSE_DEADLINE_MS + SETTLE_MS);
    expect(socket.closedByGm).toBe(true);
  });

  it.each([1, 3])('does not judge a ping that still stands in the buffer behind an asset, while the buffer drains (%i bytes a character)', (bytes) => {
    const { timers, connection } = table();
    const socket = last();
    socket.welcome([{ id: 'abcdefghijklmnopqrst', name: 'Ana' }]);
    // A slow uplink: what the table sends stays in the buffer and leaves it bit by bit. The buffer counts bytes, of which a character may take several.
    const sent = socket.send.bind(socket);
    socket.send = (text: string): void => {
      sent(text);
      socket.bufferedAmount += text.length * bytes;
    };
    connection.send({ t: 'log', entries: [], players: [], rolls: 0 } as never);
    const asset = socket.bufferedAmount;
    expect(asset).toBeGreaterThan(0);
    timers.advance(KEEPALIVE_MS);
    for (let step = 0; step < 5; step += 1) {
      timers.advance(PULSE_DEADLINE_MS - 1_000);
      socket.bufferedAmount -= Math.floor(asset / 6);
      timers.advance(1_000);
      expect(socket.closedByGm, `window ${step}`).toBe(false);
    }
    // The ping has left the buffer now, and gets its own time; no answer in it is a dead socket.
    socket.bufferedAmount = 0;
    timers.advance(PULSE_DEADLINE_MS);
    expect(socket.closedByGm).toBe(false);
    timers.advance(PULSE_DEADLINE_MS);
    expect(socket.closedByGm).toBe(true);
  });

  it('gives up a socket whose buffer stands still for the whole time: nothing leaves it any more', () => {
    const { timers, connection } = table();
    const socket = last();
    socket.welcome([{ id: 'abcdefghijklmnopqrst', name: 'Ana' }]);
    const sent = socket.send.bind(socket);
    socket.send = (text: string): void => {
      sent(text);
      socket.bufferedAmount += text.length;
    };
    connection.send({ t: 'log', entries: [], players: [], rolls: 0 } as never);
    timers.advance(KEEPALIVE_MS + FLUSH_LOOK_MS + PULSE_DEADLINE_MS - 1);
    expect(socket.closedByGm).toBe(false);
    timers.advance(1);
    expect(socket.closedByGm).toBe(true);
  });

  it('is not fooled by frames that keep going into the buffer: only a ping that left it, or a buffer that drains, counts', () => {
    const { timers, connection } = table();
    const socket = last();
    socket.welcome([{ id: 'abcdefghijklmnopqrst', name: 'Ana' }]);
    timers.advance(KEEPALIVE_MS);
    // The path is dead, and the table goes on sending small frames into a socket that takes them.
    for (let step = 0; step < 19; step += 1) {
      timers.advance(1_000);
      connection.send({ t: 'scene', scene: null });
    }
    expect(socket.closedByGm).toBe(false);
    timers.advance(1_000);
    expect(socket.closedByGm).toBe(true);
  });

  it('leaves the send queue its whole burst: the ping goes beside it', () => {
    const { timers, connection } = table();
    const socket = last();
    socket.welcome([{ id: 'abcdefghijklmnopqrst', name: 'Ana' }]);
    timers.advance(KEEPALIVE_MS);
    socket.receive(KEEPALIVE_PONG);
    const before = socket.sent.length;
    for (let index = 0; index < BURST; index += 1) connection.send({ t: 'scene', scene: null });
    expect(socket.sent.length - before).toBe(BURST);
  });

  it('times nothing once the table is stopped', () => {
    const { timers, connection, statuses } = table();
    last().welcome();
    timers.advance(KEEPALIVE_MS + 1_000);
    connection.stop();
    expect(statuses.at(-1)).toBe('stopped');
    expect(timers.pending()).toBe(0);
    expect(last().closedByGm).toBe(true);
  });

  it('batches game messages only for a relay whose welcome offers it, and each one as its own send for any other', () => {
    const ana = [{ id: 'abcdefghijklmnopqrst', name: 'Ana' }];
    const { timers, connection } = table();
    const plain = last();
    plain.welcome(ana);
    const before = plain.sent.length;
    for (let index = 0; index < 3; index += 1) connection.send({ t: 'scene', scene: null });
    expect(plain.sent.slice(before).map((text) => (JSON.parse(text) as { t: string }).t)).toEqual(['send', 'send', 'send']);

    plain.drop();
    timers.advance(1_000);
    const batching = last();
    batching.welcome(ana, true);
    timers.advance(BATCH_MS);
    const start = batching.sent.length;
    for (let index = 0; index < 3; index += 1) connection.send({ t: 'scene', scene: null });
    timers.advance(BATCH_MS);
    const frames = batching.sent.slice(start).map((text) => JSON.parse(text) as { t: string; sends?: unknown[] });
    expect(frames.map((frame) => frame.t)).toEqual(['send', 'sends']);
    expect(frames[1]?.sends).toEqual([{ to: '*', body: { t: 'scene', scene: null } }, { to: '*', body: { t: 'scene', scene: null } }]);
  });
});

describe('the campaign\'s players the relay is told', () => {
  const ANA = { id: 'a'.repeat(20), name: 'Ana', code: '111111' };
  const BEN = { id: 'b'.repeat(20), name: 'Ben', code: '222222' };
  const gates = { frame: () => ({ code: '483912', ask: true }), welcomed: () => undefined, knocked: () => undefined, gone: () => undefined, paused: () => undefined };

  function seated(): { connection: TableConnection; frames: () => { t: string; players?: unknown }[] } {
    const connection = new TableConnection('https://relay.example', 'abcdefghijklmnopqrstuvwxyz', 'host-secret-0123456789abcdefABCDEF', {
      status: () => undefined, welcome: () => undefined, joined: () => undefined, left: () => undefined, message: () => undefined, access: () => undefined,
    }, gates, fakeTimers());
    connection.setPlayers([ANA]);
    connection.start();
    return { connection, frames: () => last().sent.filter((text) => text !== KEEPALIVE_PING).map((text) => JSON.parse(text) as { t: string; players?: unknown }) };
  }

  it('follow the gates on every welcome, before anything that waited', () => {
    const { connection, frames } = seated();
    // A kick queued while offline goes out once welcomed, after the gates and the players.
    connection.kick(BEN.id);
    last().welcome();
    expect(frames().map((frame) => frame.t)).toEqual(['hello', 'gate', 'players', 'kick']);
    expect(frames()[2]).toEqual({ v: 1, t: 'players', players: [ANA] });
    // The socket drops and comes back: the relay is told again.
    last().drop();
    connection.start();
    last().welcome();
    expect(frames().map((frame) => frame.t)).toEqual(['hello', 'gate', 'players']);
  });

  it('are sent again when they change while online, and kept for the next welcome while offline', () => {
    const { connection, frames } = seated();
    last().welcome();
    connection.setPlayers([ANA, BEN]);
    expect(frames().at(-1)).toEqual({ v: 1, t: 'players', players: [ANA, BEN] });
    // The same players again say nothing new.
    connection.setPlayers([ANA, BEN]);
    expect(frames().filter((frame) => frame.t === 'players')).toHaveLength(2);
    last().drop();
    connection.setPlayers([BEN]);
    connection.start();
    last().welcome();
    expect(frames().filter((frame) => frame.t === 'players')).toEqual([{ v: 1, t: 'players', players: [BEN] }]);
  });

  it('tell one player their own code', () => {
    const { connection, frames } = seated();
    last().welcome([{ id: ANA.id, name: 'Ana' }]);
    connection.sendCode({ t: 'your-code', code: ANA.code, first: true }, ANA.id);
    // Nobody else is there to hear one.
    connection.sendCode({ t: 'your-code', code: BEN.code, first: false }, BEN.id);
    expect(frames().filter((frame) => frame.t === 'send')).toEqual([{ v: 1, t: 'send', to: ANA.id, body: { t: 'your-code', code: ANA.code, first: true } }]);
  });
});
