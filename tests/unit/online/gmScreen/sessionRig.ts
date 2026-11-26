import { vi } from 'vitest';
import { checkNumber, DeviceChannel, linkKey } from '../../../../src/app/online/gmScreen/channel/index.ts';
import { GmScreenSession, readGmScreenRecord, type CreateRoom, type GmScreenRecord } from '../../../../src/app/online/gmScreen/index.ts';
import type { Timers } from '../../../../src/app/online/gm/companionTimers.ts';
import { BATCH_MS } from '../../../../src/app/online/gm/sendQueue.ts';
import { TableConnection } from '../../../../src/app/online/gm/TableConnection.ts';
import { KEEPALIVE_PING, KEEPALIVE_PONG, type DeviceMessage, type GmScreenMessage } from '../../../../src/app/online/protocol/index.ts';
import { nodeCrypto } from './channelPair.ts';

export const RELAY = 'https://relay.example';
export type Frame = Record<string, unknown>;

/** A WebSocket the rig plays the relay for: it records what Atlas sends and hands Atlas the relay's frames. */
export class RelaySocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static all: RelaySocket[] = [];
  readyState = RelaySocket.CONNECTING;
  bufferedAmount = 0;
  readonly sent: string[] = [];
  closedByGm = false;
  /** How many of `sent` the rig has handed on. */
  read = 0;

  constructor(readonly url: string) {
    super();
    RelaySocket.all.push(this);
  }

  send(text: string): void {
    this.sent.push(text);
  }

  close(): void {
    this.closedByGm = true;
    this.readyState = RelaySocket.CLOSING;
  }

  receive(frame: Frame | string): void {
    const data = typeof frame === 'string' ? frame : JSON.stringify({ v: 1, ...frame });
    this.dispatchEvent(Object.assign(new Event('message'), { data }));
  }

  welcome(players: readonly { id: string; name: string }[] = [], waiting: readonly { id: string; name: string }[] = []): void {
    this.readyState = RelaySocket.OPEN;
    this.dispatchEvent(new Event('open'));
    this.receive({ t: 'welcome', role: 'gm', players, kind: 'gm-screen', ...(waiting.length > 0 && { waiting }) });
  }

  drop(code = 1006): void {
    this.readyState = RelaySocket.CLOSED;
    this.dispatchEvent(Object.assign(new Event('close'), { code }));
  }

  /** Every JSON frame Atlas sent, in order. */
  frames(): Frame[] {
    return this.sent.filter((text) => text.startsWith('{')).map((text) => JSON.parse(text) as Frame);
  }

  framesOf(type: string): Frame[] {
    return this.frames().filter((frame) => frame.t === type);
  }

  /** The code of the room this socket reaches. */
  get room(): string {
    return /\/api\/tables\/([a-z2-7]+)\/socket$/.exec(this.url)?.[1] ?? '';
  }
}

/** The companion's timers under the test's hand. */
export function fakeTimers(): Timers & { advance(ms: number): void } {
  let now = 0;
  let ids = 0;
  let timers: { at: number; run: () => void; id: number }[] = [];
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
  };
}

/** A device's page as far as the channel goes: what Atlas sealed for it, opened. */
export interface Device {
  readonly id: string;
  readonly channel: DeviceChannel;
  readonly heard: GmScreenMessage[];
  /** Seals a message for Atlas and hands it to the relay. */
  say(message: DeviceMessage): Promise<boolean>;
  /** The check number the device shows while it waits as the knock `id`. */
  check(knock: string): Promise<string>;
}

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export interface Rig {
  readonly session: GmScreenSession;
  readonly timers: ReturnType<typeof fakeTimers>;
  /** Room codes Atlas asked the relay for. */
  readonly created: string[];
  readonly saved: GmScreenRecord[];
  readonly notices: string[];
  /** The last socket Atlas opened to the room at `room` (by default any room's). */
  socket(room?: string): RelaySocket;
  /** A device's page under the link Atlas keeps now (the record's key unless given), connected as `id`. */
  device(id: string, key?: string): Promise<Device>;
  /** Hands on everything Atlas and the devices sent, until neither has anything more to say. */
  settle(): Promise<void>;
}

/** A session as Atlas runs it, with the relay played by the rig; `saved` is the record it starts from. */
export function sessionRig(saved: GmScreenRecord | null = null, create?: CreateRoom): Rig {
  vi.stubGlobal('WebSocket', RelaySocket);
  const timers = fakeTimers();
  const created: string[] = [];
  const records: GmScreenRecord[] = [];
  const notices: string[] = [];
  const devices = new Map<string, { device: Device; outbox: unknown[] }>();
  let secrets = 0;
  const session = new GmScreenSession({
    crypto: nodeCrypto(),
    timers,
    origin: RELAY,
    create: create ?? ((code) => {
      created.push(code);
      secrets += 1;
      return Promise.resolve({ room: { code, secret: `room-secret-${secrets}-0123456789abcdef`, maxPlayers: 4, kind: 'gm-screen' } });
    }),
    open: (room, events, gate) => new TableConnection(RELAY, room.code, room.secret, events, gate, timers),
    save: (record) => void records.push(readGmScreenRecord(JSON.parse(JSON.stringify(record))) ?? record),
    notice: (text) => void notices.push(text),
    now: () => timers.now(),
  }, saved);
  const socket = (room?: string): RelaySocket => {
    const found = RelaySocket.all.filter((each) => room === undefined || each.room === room).at(-1);
    if (found === undefined) throw new Error('no socket');
    return found;
  };
  /** The socket of the room Atlas keeps now. */
  const current = (): RelaySocket | undefined => RelaySocket.all.filter((each) => each.room === records.at(-1)?.link.code).at(-1);
  /** Hands on what is waiting; true where anything moved. */
  const deliver = (): boolean => {
    let moved = false;
    for (const each of RelaySocket.all) {
      for (; each.read < each.sent.length; each.read += 1) {
        const text = each.sent[each.read] ?? '';
        moved = true;
        if (text === KEEPALIVE_PING) each.receive(KEEPALIVE_PONG);
        if (!text.startsWith('{') || each !== current()) continue;
        const frame = JSON.parse(text) as Frame;
        const sends = frame.t === 'sends' ? (frame.sends as Frame[]) : frame.t === 'send' ? [frame] : [];
        for (const { to, body } of sends) if (typeof to === 'string') devices.get(to)?.device.channel.receive(body);
      }
    }
    for (const [id, { outbox }] of devices) {
      for (const body of outbox.splice(0)) {
        moved = true;
        current()?.receive({ t: 'game', from: id, body });
      }
    }
    return moved;
  };
  return {
    session, timers, created, saved: records, notices, socket,
    device: async (id, key) => {
      const crypto = nodeCrypto();
      const link = await linkKey(crypto, key ?? records.at(-1)?.link.key ?? '');
      if (link === null) throw new Error('no link key');
      const heard: GmScreenMessage[] = [];
      const outbox: unknown[] = [];
      const channel = new DeviceChannel(crypto, link, (body) => void outbox.push(JSON.parse(JSON.stringify(body))), { opened: () => undefined, message: (message) => void heard.push(message) });
      const device: Device = { id, channel, heard, say: (message) => channel.send(message), check: (knock) => checkNumber(crypto, link, knock) };
      devices.set(id, { device, outbox });
      return device;
    },
    settle: async () => {
      for (let quiet = 0; quiet < 6;) {
        timers.advance(BATCH_MS);
        quiet = deliver() ? 0 : quiet + 1;
        await macrotask();
      }
    },
  };
}

/** A device id in the relay's alphabet. */
export const deviceId = (letter: string): string => letter.repeat(20);
