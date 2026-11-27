import { afterEach, describe, expect, it, vi } from 'vitest';
import { GmScreenSession, readGmScreenRecord, type GmScreenRecord, type RoomAnswer } from '../../../../src/app/online/gmScreen/index.ts';
import { TableConnection } from '../../../../src/app/online/gm/TableConnection.ts';
import { KEEPALIVE_PING, KEEPALIVE_PONG } from '../../../../src/app/online/protocol/index.ts';
import { nodeCrypto } from './channelPair.ts';
import { fakeTimers } from './fakeTimers.ts';
import { RELAY, RelaySocket, type Frame } from './sessionRig.ts';

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
/** Seeds each run plays; `VITE_GM_SCREEN_STOP_TRIALS=250` plays the long run (about ten minutes). */
const TRIALS = Number(import.meta.env.VITE_GM_SCREEN_STOP_TRIALS ?? 8);

/** A small deterministic random source. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

interface Room { secret: string; gm: RelaySocket | null }

/**
 * The relay as far as rooms go: one room per code with a host secret, one GM's room per account, a hello
 * welcomed only with the room's secret, `end` ends the room. Offline: nothing arrives either way.
 */
class ModelRelay {
  online = true;
  readonly rooms = new Map<string, Room>();
  /** Every room that ever ended, by its secret, with why. */
  readonly ended: string[] = [];
  private secrets = 0;
  private readonly gone = new Set<RelaySocket>();
  private readonly greeted = new Set<RelaySocket>();
  private pending: { code: string; resolve: (answer: RoomAnswer) => void }[] = [];
  readonly log: string[] = [];

  create(code: string): Promise<RoomAnswer> {
    return new Promise((resolve) => this.pending.push({ code, resolve }));
  }

  private endRoom(code: string, close: number, why: string): void {
    const room = this.rooms.get(code);
    if (room === undefined) return;
    this.rooms.delete(code);
    this.ended.push(`${room.secret}:${why}`);
    this.log.push(`relay: room ${code.slice(0, 4)} ${room.secret.slice(0, 14)} ended (${why})`);
    if (room.gm !== null && !this.gone.has(room.gm)) this.close(room.gm, close);
  }

  private close(socket: RelaySocket, code: number): void {
    this.gone.add(socket);
    socket.drop(code);
  }

  /** The network goes: open sockets either die loudly or stay silent. */
  setOnline(online: boolean, loud: boolean): void {
    this.online = online;
    this.log.push(`net: ${online ? 'online' : loud ? 'offline (sockets drop)' : 'offline (sockets silent)'}`);
    if (online || !loud) return;
    for (const socket of RelaySocket.all) if (!this.gone.has(socket) && socket.readyState !== RelaySocket.CLOSED) {
      for (const room of this.rooms.values()) if (room.gm === socket) room.gm = null;
      this.close(socket, 1006);
    }
  }

  pump(): void {
    if (this.online) {
      for (const { code, resolve } of this.pending.splice(0)) {
        // One GM's room an account: the others end as the new one is made.
        for (const other of [...this.rooms.keys()]) this.endRoom(other, 4016, other === code ? 'replaced at its code' : 'account made another');
        this.secrets += 1;
        const secret = `room-secret-${String(this.secrets).padStart(4, '0')}-0123456789abcdef`;
        this.rooms.set(code, { secret, gm: null });
        this.log.push(`relay: room ${code.slice(0, 4)} ${secret.slice(0, 16)} made`);
        resolve({ room: { code, secret, maxPlayers: 4, kind: 'gm-screen' } });
      }
    } else {
      for (const { resolve } of this.pending.splice(0)) resolve({ refused: 'offline' });
    }
    for (const socket of [...RelaySocket.all]) {
      if (this.gone.has(socket)) continue;
      if (!this.online) {
        // What Atlas sends reaches nobody.
        socket.read = socket.sent.length;
        if (socket.closedByGm) this.forget(socket);
        continue;
      }
      if (socket.readyState === RelaySocket.CONNECTING && !socket.closedByGm) {
        socket.readyState = RelaySocket.OPEN;
        socket.dispatchEvent(new Event('open'));
      }
      for (; socket.read < socket.sent.length && !this.gone.has(socket); socket.read += 1) {
        const text = socket.sent[socket.read] ?? '';
        if (text === KEEPALIVE_PING) {
          socket.receive(KEEPALIVE_PONG);
          continue;
        }
        if (!text.startsWith('{')) continue;
        this.frame(socket, JSON.parse(text) as Frame);
      }
      if (socket.closedByGm && !this.gone.has(socket)) this.forget(socket);
    }
  }

  private forget(socket: RelaySocket): void {
    this.gone.add(socket);
    for (const room of this.rooms.values()) if (room.gm === socket) room.gm = null;
  }

  private frame(socket: RelaySocket, frame: Frame): void {
    const room = this.rooms.get(socket.room);
    if (frame.t === 'hello') {
      if (room === undefined) return this.close(socket, 4008);
      if (room.secret !== frame.secret) return this.close(socket, 4001);
      if (room.gm !== null && room.gm !== socket && !this.gone.has(room.gm)) this.close(room.gm, 4002);
      room.gm = socket;
      this.greeted.add(socket);
      socket.receive({ t: 'welcome', role: 'gm', players: [], kind: 'gm-screen' });
      return;
    }
    if (frame.t === 'end' && room !== undefined && room.gm === socket && this.greeted.has(socket)) this.endRoom(socket.room, 4008, 'gm ended it');
  }
}

interface World {
  relay: ModelRelay;
  timers: ReturnType<typeof fakeTimers>;
  session: GmScreenSession;
  saved: GmScreenRecord | null;
  notices: string[];
  reload(): void;
}

function world(): World {
  vi.stubGlobal('WebSocket', RelaySocket);
  RelaySocket.all = [];
  const relay = new ModelRelay();
  const timers = fakeTimers();
  const notices: string[] = [];
  const made = (saved: GmScreenRecord | null): GmScreenSession => new GmScreenSession({
    crypto: nodeCrypto(),
    timers,
    origin: RELAY,
    create: (code) => relay.create(code),
    open: (room, events, gate) => new TableConnection(RELAY, room.code, room.secret, events, gate, timers),
    save: (record) => void (w.saved = readGmScreenRecord(JSON.parse(JSON.stringify(record)))),
    notice: (text) => void notices.push(text),
    now: () => timers.now(),
  }, saved);
  const w: World = {
    relay, timers, notices, saved: null, session: made(null),
    reload: () => {
      w.session.close();
      w.session = made(w.saved);
      void w.session.resume();
    },
  };
  return w;
}

async function run(w: World, ms: number, step = 250): Promise<void> {
  for (let passed = 0; passed < ms; passed += step) {
    w.timers.advance(step);
    w.relay.pump();
    await macrotask();
    w.relay.pump();
    await macrotask();
  }
}

/** What must hold once the relay was reachable for long: only the room Atlas runs lives, and nothing waits to be ended. */
function settledProblems(w: World): string[] {
  const problems: string[] = [];
  const status = w.session.view().status;
  const record = w.saved;
  const rooms = [...w.relay.rooms].map(([code, room]) => `${code.slice(0, 4)}/${room.secret.slice(0, 16)}`);
  if (status === 'online') {
    const own = record === null ? '' : `${record.link.code.slice(0, 4)}/${(record.secret ?? '').slice(0, 16)}`;
    if (rooms.length !== 1 || rooms[0] !== own) problems.push(`running ${own}, but the relay holds [${rooms.join(', ')}]`);
  } else if (status === 'stopped') {
    if (rooms.length > 0) problems.push(`stopped, but the relay still holds [${rooms.join(', ')}]`);
    if (record !== null && record.secret !== null) problems.push('stopped, but the record keeps a running secret');
  } else problems.push(`still ${status} after ten minutes online`);
  if ((record?.ending.length ?? 0) > 0) problems.push(`the record still has ${record?.ending.length} room(s) to end`);
  return problems;
}

type Op = 'start' | 'stop' | 'newLink' | 'reload' | 'offline-loud' | 'offline-silent' | 'online';

async function play(seed: number, steps: number, ops: readonly Op[]): Promise<{ problems: string[]; trace: string[] }> {
  const random = rng(seed);
  const w = world();
  const trace: string[] = [];
  for (let step = 0; step < steps; step += 1) {
    const op = ops[Math.floor(random() * ops.length)] ?? 'start';
    trace.push(`${op} (was ${w.session.view().status})`);
    w.relay.log.push(`atlas: ${op} (was ${w.session.view().status})`);
    if (op === 'start') void w.session.start();
    else if (op === 'stop') w.session.stop();
    else if (op === 'newLink') w.session.newLink();
    else if (op === 'reload') w.reload();
    else if (op === 'online') w.relay.setOnline(true, true);
    else w.relay.setOnline(false, op === 'offline-loud');
    // Sometimes the next press comes before anything travelled.
    const wait = [0, 0, 300, 2_000, 15_000, 70_000][Math.floor(random() * 6)] ?? 0;
    if (wait > 0) await run(w, wait, wait > 5_000 ? 1_000 : 250);
  }
  w.relay.setOnline(true, true);
  await run(w, 600_000, 1_000);
  const problems = settledProblems(w);
  w.session.close();
  return { problems, trace: w.relay.log };
}

afterEach(() => vi.unstubAllGlobals());

describe('Stop and New link end the room for certain, whatever came between', () => {
  it('a scripted run of the model relay behaves as the session tests expect (the model itself is sound)', async () => {
    const w = world();
    void w.session.start();
    await run(w, 2_000);
    expect(w.session.view().status).toBe('online');
    expect(w.relay.rooms.size).toBe(1);
    w.session.stop();
    await run(w, 5_000);
    expect(settledProblems(w)).toEqual([]);
  });

  it('holds over random presses with the relay always reachable', { timeout: 30_000 + TRIALS * 4_000 }, async () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= TRIALS && failures.length < 3; seed += 1) {
      const { problems, trace } = await play(seed, 12, ['start', 'stop', 'newLink', 'reload']);
      if (problems.length > 0) failures.push(`seed ${seed}: ${problems.join('; ')}\n  ${trace.join('\n  ')}`);
    }
    expect(failures.join('\n\n')).toBe('');
  });

  it('holds over random presses while the network comes and goes', { timeout: 30_000 + TRIALS * 4_000 }, async () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= TRIALS && failures.length < 3; seed += 1) {
      const { problems, trace } = await play(seed, 14, ['start', 'stop', 'newLink', 'reload', 'offline-loud', 'offline-silent', 'online', 'start', 'stop']);
      if (problems.length > 0) failures.push(`seed ${seed}: ${problems.join('; ')}\n  ${trace.join('\n  ')}`);
    }
    expect(failures.join('\n\n')).toBe('');
  });
});
