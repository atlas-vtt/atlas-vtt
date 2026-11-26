import { MAX_PLAYERS, type DeviceMessage, type GmScreenMessage, type PlayerInfo } from '../protocol/index.ts';
import type { CreatedTable } from '../gm/createdTable.ts';
import type { GateEvents, TableEvents, TableStatus } from '../gm/TableConnection.ts';
import type { TableOutbox } from '../gm/tableOutbox.ts';
import { endStrayTable } from '../gm/strayTable.ts';
import { t } from '../../i18n';
import { checkNumber, linkKey } from './channel/index.ts';
import { DeviceChannels } from './deviceChannels.ts';
import { gmScreenEndText } from './gmScreenEnd.ts';
import { GmScreenKnocks } from './gmScreenKnocks.ts';
import { newGmScreenRecord, seatsOf, seenAt, withDevice, withoutDevice, type GmScreenRecord } from './gmScreenRecord.ts';
import type { GmScreenPorts } from './gmScreenPorts.ts';
import { ScreenRouter, type GmScreen, type GmScreenOutlet } from './screens.ts';
import { gmScreenView, type GmScreenView } from './gmScreenView.ts';

export type { GmScreenDeviceView, GmScreenStatus, GmScreenView } from './gmScreenView.ts';

const NAME = t('gmScreen.name');

/**
 * The GM screen's session on Atlas's side: its room at the relay (a second connection beside a table's,
 * sharing nothing with it), the devices the GM lets in and removes, and an encrypted channel to each
 * connected device, which the plugged screens send through. Nothing is contacted before `start` or a
 * `resume` of a room that ran, nor after `stop`.
 */
export class GmScreenSession implements GmScreenOutlet {
  private record: GmScreenRecord | null;
  private phase: 'stopped' | 'starting' | 'running' = 'stopped';
  private connection: TableOutbox | null = null;
  private connectionStatus: TableStatus = 'connecting';
  private channels: DeviceChannels | null = null;
  private key: CryptoKey | null = null;
  /** Allowed devices connected now. */
  private readonly connected = new Set<string>();
  /** Devices allowed in this session that have not been told their code yet. */
  private readonly fresh = new Set<string>();
  private readonly knocks: GmScreenKnocks;
  private readonly router = new ScreenRouter();
  private problem: string | null = null;
  /** Counts starts, stops and closes, so an answer that comes after one of them changes nothing. */
  private run = 0;
  private readonly listeners = new Set<() => void>();
  private shown: GmScreenView;

  constructor(private readonly ports: GmScreenPorts, saved: GmScreenRecord | null) {
    this.record = saved;
    this.knocks = new GmScreenKnocks(ports.timers, (id) => (this.key === null ? Promise.resolve('') : checkNumber(ports.crypto, this.key, id)), () => this.changed());
    this.shown = this.makeView();
  }

  view(): GmScreenView {
    return this.shown;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Whether a room ran when the record was kept, so `resume` comes back to it. */
  get wasRunning(): boolean {
    return this.record !== null && this.record.secret !== null;
  }

  get devices(): readonly string[] {
    return this.channels?.devices ?? [];
  }

  /** Plugs a screen in; returns what unplugs it. */
  plug(screen: GmScreen): () => void {
    const unplug = this.router.plug(screen);
    for (const device of this.devices) screen.opened(device);
    return unplug;
  }

  send(message: GmScreenMessage, to?: string): void {
    this.channels?.send(message, to);
  }

  /** Asks the relay for the room at this computer's lasting code and connects to it. */
  async start(): Promise<void> {
    if (this.phase !== 'stopped') return;
    const record = this.record ?? newGmScreenRecord(this.ports.crypto);
    this.keep(record);
    this.problem = null;
    this.phase = 'starting';
    const run = (this.run += 1);
    this.changed();
    const answer = await this.ports.create(record.link.code);
    if (run !== this.run) {
      if ('room' in answer) endStrayTable(this.ports.open, answer.room, this.ports.timers);
      return;
    }
    if ('refused' in answer) return this.halt(answer.refused);
    this.keep({ ...record, secret: answer.room.secret });
    await this.connect(run);
  }

  /** Comes back to the room that ran before Obsidian or Atlas was reloaded, with the same link and devices. */
  resume(): Promise<void> {
    if (this.phase !== 'stopped' || !this.wasRunning) return Promise.resolve();
    this.phase = 'starting';
    this.changed();
    return this.connect((this.run += 1));
  }

  /** Ends the room on the relay, and with it every device's connection; the link and the devices are kept for the next start. */
  stop(): void {
    if (this.phase === 'stopped') return;
    this.connection?.end();
    this.halt(null);
  }

  /** Lets go of the connection, leaving the room on the relay for `resume` (Atlas unloads). */
  close(): void {
    this.letGo();
  }

  /** A new link: a new room code and key, no devices; every device of the old link is ended. */
  newLink(): void {
    const running = this.phase !== 'stopped';
    this.stop();
    this.fresh.clear();
    this.keep(newGmScreenRecord(this.ports.crypto));
    if (running) void this.start();
    else this.changed();
  }

  /** Lets the device the GM is asked about in, with a code of its own; false where it cannot be answered now. */
  allow(id: string): boolean {
    const { record, connection } = this;
    const knock = record === null || connection === null ? null : this.knocks.take(id);
    if (record === null || connection === null || knock === null) return false;
    const next = withDevice(record, knock.id, knock.name, this.ports.now());
    if (next === record) {
      connection.answer(id, false);
      this.ports.notice(t('gmScreen.tooMany', { name: NAME }));
      return false;
    }
    this.fresh.add(id);
    this.keep(next);
    connection.answer(id, true);
    connection.setPlayers(seatsOf(next));
    this.changed();
    return true;
  }

  refuse(id: string): void {
    this.knocks.remove(id);
    this.connection?.answer(id, false);
  }

  /** Takes a device off the list: its connection ends now, and it must ask again to come back. */
  remove(id: string): void {
    if (this.record === null) return;
    this.keep(withoutDevice(this.record, id));
    this.fresh.delete(id);
    this.left(id);
    this.connection?.setPlayers(seatsOf(this.record));
    this.connection?.kick(id);
    this.changed();
  }

  private async connect(run: number): Promise<void> {
    const record = this.record;
    const key = record === null ? null : await linkKey(this.ports.crypto, record.link.key);
    if (run !== this.run) return;
    if (record?.secret == null || key === null) return this.halt(t('gmScreen.end.refused', { name: NAME }));
    this.key = key;
    this.channels = new DeviceChannels(this.ports.crypto, key, (device, body) => this.connection?.send(body, device), {
      opened: (device) => this.opened(device),
      message: (device, message: DeviceMessage) => this.router.message(device, message),
    });
    this.phase = 'running';
    this.connectionStatus = 'connecting';
    const room: CreatedTable = { code: record.link.code, secret: record.secret, maxPlayers: MAX_PLAYERS };
    const connection = this.ports.open(room, this.tableEvents(() => run === this.run), this.gateEvents(() => run === this.run));
    this.connection = connection;
    connection.setPlayers(seatsOf(record));
    connection.start();
    this.changed();
  }

  /** What the room's connection says, heard only while it is `live` (its run is not over). */
  private tableEvents(live: () => boolean): TableEvents {
    return {
      status: (status) => live() && this.statusChanged(status),
      welcome: (players) => {
        if (!live()) return;
        for (const id of [...this.connected]) if (!players.some((player) => player.id === id)) this.left(id);
        for (const player of players) this.joined(player);
      },
      joined: (player) => live() && this.joined(player),
      left: (id) => {
        if (!live()) return;
        this.left(id);
        this.changed();
      },
      message: (from, body) => {
        if (live() && this.connected.has(from)) this.channels?.receive(from, body);
      },
      access: () => undefined,
    };
  }

  private gateEvents(live: () => boolean): GateEvents {
    return {
      frame: () => ({ code: null, ask: true }),
      welcomed: (waiting) => live() && this.knocks.reset(waiting),
      knocked: (player) => live() && this.knocks.add(player),
      gone: (id, full) => {
        if (!live()) return;
        this.knocks.remove(id);
        if (!full || !this.fresh.has(id)) return;
        // Let in while every seat was taken: it must ask again once one is free.
        this.remove(id);
        this.ports.notice(t('gmScreen.full', { name: NAME }));
      },
      paused: () => undefined,
    };
  }

  private statusChanged(status: TableStatus): void {
    this.connectionStatus = status;
    if (status === 'refused') return this.halt(gmScreenEndText(this.connection?.closeCode ?? null), true);
    // Until the next welcome no device is known to be there; that welcome opens every channel anew.
    if (status === 'connecting') for (const id of [...this.connected]) this.left(id);
    this.changed();
  }

  private joined(player: PlayerInfo): void {
    const known = this.record?.devices.some((device) => device.id === player.id) === true;
    if (!known) return this.connection?.kick(player.id);
    if (this.record !== null) this.keep(seenAt(this.record, player.id, this.ports.now()));
    this.connected.add(player.id);
    this.channels?.connect(player.id);
    this.changed();
  }

  private left(id: string): void {
    if (!this.connected.delete(id)) return;
    if (this.record?.devices.some((device) => device.id === id) === true) this.keep(seenAt(this.record, id, this.ports.now()));
    this.channels?.drop(id);
    this.router.closed(id);
  }

  private opened(device: string): void {
    const code = this.record?.devices.find((known) => known.id === device)?.code;
    if (code === undefined) return;
    this.send({ t: 'your-code', code, first: this.fresh.delete(device) }, device);
    this.router.opened(device);
  }

  /** The room is over here: nothing more connects, and `problem` says why (null: the GM stopped it). */
  private halt(problem: string | null, tell = false): void {
    this.letGo();
    this.problem = problem;
    if (this.record !== null && this.record.secret !== null) this.keep({ ...this.record, secret: null });
    if (tell && problem !== null) this.ports.notice(problem);
    this.changed();
  }

  /** Lets go of the connection and forgets who is connected and waits: nothing more goes to anyone, and nothing it still says is heard. */
  private letGo(): void {
    this.run += 1;
    const { connection } = this;
    this.connection = null;
    connection?.stop();
    this.phase = 'stopped';
    for (const id of [...this.connected]) this.left(id);
    this.channels?.clear();
    this.channels = null;
    this.key = null;
    this.knocks.clear();
  }

  private keep(record: GmScreenRecord): void {
    if (record === this.record) return;
    this.record = record;
    this.ports.save(record);
  }

  private changed(): void {
    this.shown = this.makeView();
    for (const listener of [...this.listeners]) listener();
  }

  private makeView(): GmScreenView {
    const status = this.phase === 'running' ? (this.connectionStatus === 'online' ? 'online' : 'connecting') : this.phase;
    return gmScreenView({ status, origin: this.ports.origin, record: this.record, connected: this.connected, knock: this.knocks.first, waiting: this.knocks.count, problem: this.problem });
  }
}
