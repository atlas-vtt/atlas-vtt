import {
  ALL_PLAYERS, FINAL_CLOSE_CODES, KEEPALIVE_PONG, PROTOCOL_VERSION, parseRelayFrame, type ConnectionStats, type GmMessage, type PlayerInfo,
} from '../protocol/index.ts';
import { randomHex } from '../../utils/randomHex';
import { messageParts } from './assetServe.ts';
import { companionTimers, type Timers } from './companionTimers.ts';
import type { GateFrame } from './joinGate.ts';
import { SendQueue } from './sendQueue.ts';
import { Deadline, OPEN_TIMEOUT_MS, Pulse, WELCOME_TIMEOUT_MS } from './socketWatch.ts';

export type TableStatus = 'connecting' | 'online' | 'stopped' | 'refused';

export interface TableEvents {
  status(status: TableStatus): void;
  /** Welcomed, first or after a reconnect: everything the players should have goes out again. */
  welcome(players: readonly PlayerInfo[]): void;
  joined(player: PlayerInfo): void;
  left(player: string): void;
  message(from: string, body: unknown): void;
  /** The table closes at `closesAt` (the relay's clock) because its account may no longer host; null: it does not, said by the relay or by a welcome. */
  access(closesAt: number | null): void;
}

/** The table's gates as the connection needs them: what the relay is told, and what it says back. */
export interface GateEvents {
  /** The gates the relay is told on every welcome, before anything else. */
  frame(): GateFrame;
  /** Welcomed: the newcomers who wait for an answer now. */
  welcomed(waiting: readonly PlayerInfo[]): void;
  knocked(player: PlayerInfo): void;
  /** A knock ended; `full`: admitted, but the table had no seat left. */
  gone(id: string, full: boolean): void;
  /** Too many wrong codes: no newcomer joins until `until`, by the relay's clock. */
  paused(until: number): void;
}

const MAX_BACKOFF_MS = 30_000;
/** The close code of a connection that failed without a close frame. */
const CLOSE_ABNORMAL = 1006;

/** A reconnect delay: doubling from half a second up to 30 seconds, with jitter from the cryptographic source. */
export function backoff(attempt: number, random: () => number = cryptoFraction): number {
  return Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt) * (0.5 + random() / 2);
}

function cryptoFraction(): number {
  return (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) / 2 ** 32;
}

/** A `send` frame of a message as a batch carries it (`{"to":…,"body":…}`), so it is written out once. */
const sendFrame = (entry: string): string => `{"v":${PROTOCOL_VERSION},"t":"send",${entry.slice(1)}`;

/** A random id for the parts of one large message. */
const partId = (): string => randomHex(12);

/** The socket address of a table on a server origin (`https://…` becomes `wss://…`). */
export function socketUrl(origin: string, code: string): string {
  return `${origin.replace(/^http/, 'ws')}/api/tables/${code}/socket`;
}

/**
 * The GM's socket to the table: hello with the host secret, reconnect with backoff, paced sends.
 * Game messages go out only to players who are connected, so a table nobody plays at hears nothing
 * but keep-alives and its Durable Object hibernates; a player who joins is sent everything anew.
 * A try has its time (`OPEN_TIMEOUT_MS` to open, `WELCOME_TIMEOUT_MS` for the relay's welcome) and a
 * welcomed socket a pulse (`Pulse`): one that hangs or dies without a close is given up like one that
 * closed, the status says so, and the next try is timed, so the table never stands still for good
 * while the panel says online. There is one socket at a time.
 */
export class TableConnection {
  private readonly url: string;
  private readonly secret: string;
  private readonly events: TableEvents;
  /** The table's gates; a connection without them tells the relay none, and its table lets newcomers in as tables always did. */
  private readonly gate: GateEvents | null;
  private readonly queue: SendQueue;
  private socket: WebSocket | null = null;
  private attempts = 0;
  private stopped = false;
  private readonly timers: Timers;
  private retry: number | undefined;
  /** The time a try has to open, then to be welcomed. */
  private readonly limit: Deadline;
  private readonly pulse: Pulse;
  private lastClose: number | null = null;
  private status: TableStatus = 'connecting';
  private reconnects = 0;
  /** The players connected now, as the relay last told. */
  private readonly players = new Set<string>();

  constructor(origin: string, code: string, secret: string, events: TableEvents, gate: GateEvents | null = null, timers: Timers = companionTimers()) {
    this.url = socketUrl(origin, code);
    this.secret = secret;
    this.events = events;
    this.gate = gate;
    this.timers = timers;
    this.queue = new SendQueue(timers);
    this.limit = new Deadline(timers);
    this.pulse = new Pulse(timers, () => this.giveUp());
  }

  start(): void {
    if (this.stopped) return;
    this.clearRetry();
    // A socket still there is given up first: never two at once.
    this.release();
    this.setStatus('connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      // A socket that cannot be made is a try that failed.
      return this.failed(CLOSE_ABNORMAL);
    }
    this.socket = socket;
    this.limit.set(OPEN_TIMEOUT_MS, () => this.giveUp());
    socket.addEventListener('open', () => {
      if (socket !== this.socket) return;
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, t: 'hello', role: 'gm', secret: this.secret }));
      this.limit.set(WELCOME_TIMEOUT_MS, () => this.giveUp());
    });
    socket.addEventListener('message', (event) => {
      if (socket === this.socket && typeof event.data === 'string') this.receive(socket, event.data);
    });
    socket.addEventListener('close', (event) => this.closed(socket, event.code));
    // A failed handshake: browsers follow with a close, Node's WebSocket never does.
    socket.addEventListener('error', () => this.closed(socket, CLOSE_ABNORMAL));
  }

  /** How the connection went, for feedback's diagnostics: no address, code or secret. */
  stats(): ConnectionStats {
    return { status: this.status, reconnects: this.reconnects, lastClose: this.lastClose, latencyMs: this.pulse.latencyMs(), players: this.players.size };
  }

  /** The code the relay last closed the socket with, or null before it closed one. */
  get closeCode(): number | null {
    return this.lastClose;
  }

  /** Sends a game message to one player, or to all. */
  send(body: GmMessage, to: string = ALL_PLAYERS): void {
    if (this.isGone(to)) return;
    for (const part of messageParts(body, partId)) {
      const entry = JSON.stringify({ to, body: part });
      this.queue.push(sendFrame(entry), to, entry);
    }
  }

  /**
   * Sends a live message (where dragged tokens are now) to one player or to all: it goes before every
   * other waiting frame, and a newer one of the same `key` replaces it while it waits.
   */
  sendLive(body: GmMessage, key: string, to: string = ALL_PLAYERS): void {
    if (this.isGone(to)) return;
    const entry = JSON.stringify({ to, body });
    this.queue.pushLive(`${to}\n${key}`, sendFrame(entry), to, entry);
  }

  /** Whether a message to `to` would reach nobody: no player is connected, or not that one. */
  private isGone(to: string): boolean {
    return to === ALL_PLAYERS ? this.players.size === 0 : !this.players.has(to);
  }

  /** Removes a player from the table: the relay forgets their key and closes their socket. */
  kick(player: string): void {
    this.queue.push(JSON.stringify({ v: PROTOCOL_VERSION, t: 'kick', id: player }));
  }

  /** Tells the relay the gates as they are now; while offline the next welcome does. */
  sendGate(frame: GateFrame): void {
    if (this.status === 'online') this.queue.push(JSON.stringify({ v: PROTOCOL_VERSION, t: 'gate', ...frame }));
  }

  /** Lets a waiting newcomer in, or turns them away. */
  answer(id: string, admit: boolean): void {
    this.queue.push(JSON.stringify({ v: PROTOCOL_VERSION, t: admit ? 'admit' : 'decline', id }));
  }

  /** Ends the table on the relay and closes the socket for good. */
  end(): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, t: 'end' }));
    this.stop();
  }

  stop(): void {
    this.stopped = true;
    this.clearRetry();
    this.release(1000, 'stopped');
    this.setStatus('stopped');
  }

  private clearRetry(): void {
    if (this.retry !== undefined) this.timers.clearTimer(this.retry);
    this.retry = undefined;
  }

  /** Lets go of the socket there is, open or not: its timers stop, and what it still says is ignored. */
  private release(code?: number, reason?: string): void {
    const { socket } = this;
    this.limit.clear();
    this.pulse.stop();
    this.queue.detach();
    this.socket = null;
    try {
      socket?.close(code, reason);
    } catch {
      // A socket that cannot even close is gone all the same.
    }
  }

  /** A try that ran out of time, or a socket without a pulse: given up like one that closed, and the next is timed. */
  private giveUp(): void {
    if (this.socket === null || this.stopped) return;
    this.release();
    this.failed(CLOSE_ABNORMAL);
  }

  private receive(socket: WebSocket, text: string): void {
    const pong = text === KEEPALIVE_PONG;
    this.pulse.heard(pong);
    if (pong) return;
    const frame = parseRelayFrame(text);
    if (frame === null) return;
    if (frame.t === 'welcome' && frame.role === 'gm') {
      this.limit.clear();
      this.attempts = 0;
      for (const player of frame.players) this.players.add(player.id);
      // The gates first, ahead of whatever waits in the queue: the relay keeps them, and a restarted companion's are the same.
      if (this.gate !== null) socket.send(JSON.stringify({ v: PROTOCOL_VERSION, t: 'gate', ...this.gate.frame() }));
      this.queue.attach(this.pulse.start(socket), frame.batch === true);
      this.setStatus('online');
      // A table that still closes for want of access says so again after its welcome.
      this.events.access(null);
      this.gate?.welcomed(frame.waiting ?? []);
      this.events.welcome(frame.players);
    } else if (frame.t === 'knock') this.gate?.knocked({ id: frame.id, name: frame.name });
    else if (frame.t === 'knock-gone') this.gate?.gone(frame.id, frame.full === true);
    else if (frame.t === 'gate-paused') this.gate?.paused(frame.until);
    else if (frame.t === 'access') this.events.access(frame.closesAt);
    else if (frame.t === 'player-joined') {
      this.players.add(frame.id);
      this.events.joined({ id: frame.id, name: frame.name });
    } else if (frame.t === 'player-left') {
      this.players.delete(frame.id);
      this.dropUnreachable();
      this.events.left(frame.id);
    } else if (frame.t === 'game' && frame.from !== undefined) this.events.message(frame.from, frame.body);
  }

  private setStatus(status: TableStatus): void {
    this.status = status;
    this.events.status(status);
  }

  /** Drops what waits for players who left, so nothing goes out for them. */
  private dropUnreachable(): void {
    this.queue.drop((to) => this.isGone(to));
  }

  private closed(socket: WebSocket, code: number): void {
    if (socket !== this.socket || this.stopped) return;
    this.release();
    this.failed(code);
  }

  /** The socket is gone, by `code`: the status says so, and unless the relay closed for good the next try is timed. */
  private failed(code: number): void {
    this.lastClose = code;
    // Until the next welcome nobody is known to be there; that welcome sends everything anew.
    this.players.clear();
    this.dropUnreachable();
    if (FINAL_CLOSE_CODES.includes(code)) {
      this.stopped = true;
      this.setStatus('refused');
      return;
    }
    this.setStatus('connecting');
    this.attempts += 1;
    this.reconnects += 1;
    this.retry = this.timers.setTimer(() => this.start(), backoff(this.attempts));
  }
}
