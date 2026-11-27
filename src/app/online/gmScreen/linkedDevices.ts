import type { DeviceMessage, GmScreenMessage, PlayerInfo } from '../protocol/index.ts';
import type { Timers } from '../gm/companionTimers.ts';
import type { TableOutbox } from '../gm/tableOutbox.ts';
import type { ChannelCrypto } from './channel/index.ts';
import { DeviceChannels } from './deviceChannels.ts';
import { seenAt, type GmScreenRecord } from './gmScreenRecord.ts';
import type { ScreenRouter } from './screens.ts';

/** What the devices need of the session: its record and how to keep it, the room's connection, and its screens. */
export interface DeviceHost {
  readonly crypto: ChannelCrypto;
  readonly timers: Timers;
  readonly router: ScreenRouter;
  record(): GmScreenRecord | null;
  keep(record: GmScreenRecord): void;
  connection(): TableOutbox | null;
  now(): number;
}

/**
 * The devices of the link as the room sees them: which allowed ones are connected, which were allowed in
 * this session and have not been told their code yet, and the encrypted channel to each connected one.
 */
export class LinkedDevices {
  /** Allowed devices connected now. */
  readonly connected = new Set<string>();
  private readonly fresh = new Set<string>();
  private channels: DeviceChannels | null = null;

  constructor(private readonly host: DeviceHost) {}

  /** The devices whose channel is open now. */
  get open(): readonly string[] {
    return this.channels?.devices ?? [];
  }

  /** The room connects: each channel is made from the link's key. */
  start(key: CryptoKey): void {
    const { crypto, timers, router } = this.host;
    this.channels = new DeviceChannels(crypto, key, timers, (device, body) => this.host.connection()?.send(body, device), {
      opened: (device) => this.opened(device),
      message: (device, message: DeviceMessage) => router.message(device, message),
    });
  }

  /** The room is let go: nobody is connected, and nothing a device still says is heard. */
  stop(): void {
    this.away();
    this.channels?.clear();
    this.channels = null;
  }

  /** Until the next welcome no device is known to be there; that welcome opens every channel anew. */
  away(): void {
    for (const id of [...this.connected]) this.left(id);
  }

  /** A device the GM allowed just now: its first code is still to be told. */
  allowed(id: string): void {
    this.fresh.add(id);
  }

  /** Whether the device was allowed in this session and has not been told its code yet. */
  isFresh(id: string): boolean {
    return this.fresh.has(id);
  }

  /** A device taken off the list, or every device of a link let go (no `id`). */
  forget(id?: string): void {
    if (id === undefined) return this.fresh.clear();
    this.fresh.delete(id);
    this.left(id);
  }

  welcome(players: readonly PlayerInfo[]): void {
    for (const id of [...this.connected]) if (!players.some((player) => player.id === id)) this.left(id);
    for (const player of players) this.joined(player);
  }

  /** A device the relay seated: one the GM allowed connects, anyone else is turned away. */
  joined(player: PlayerInfo): void {
    const record = this.host.record();
    if (record?.devices.some((device) => device.id === player.id) !== true) return void this.host.connection()?.kick(player.id);
    this.host.keep(seenAt(record, player.id, this.host.now()));
    this.connected.add(player.id);
    this.channels?.connect(player.id);
  }

  left(id: string): void {
    if (!this.connected.delete(id)) return;
    const record = this.host.record();
    if (record?.devices.some((device) => device.id === id) === true) this.host.keep(seenAt(record, id, this.host.now()));
    this.channels?.drop(id);
    this.host.router.closed(id);
  }

  receive(from: string, body: unknown): void {
    if (this.connected.has(from)) this.channels?.receive(from, body);
  }

  send(message: GmScreenMessage, to?: string): void {
    this.channels?.send(message, to);
  }

  private opened(device: string): void {
    const code = this.host.record()?.devices.find((known) => known.id === device)?.code;
    if (code === undefined) return;
    this.send({ t: 'your-code', code, first: this.fresh.delete(device) }, device);
    this.host.router.opened(device);
  }
}
