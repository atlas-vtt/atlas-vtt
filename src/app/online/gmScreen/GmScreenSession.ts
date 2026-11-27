import { MAX_PLAYERS, type GmScreenMessage } from '../protocol/index.ts';
import type { CreatedTable } from '../gm/createdTable.ts';
import type { TableEvents, TableStatus } from '../gm/TableConnection.ts';
import type { TableOutbox } from '../gm/tableOutbox.ts';
import { t } from '../../i18n';
import { checkNumber, linkKey } from './channel/index.ts';
import { gmScreenEndText } from './gmScreenEnd.ts';
import { RoomEnds } from './gmScreenEnds.ts';
import { GmScreenKnocks } from './gmScreenKnocks.ts';
import { newGmScreenRecord, seatsOf, withDevice, withEnding, withoutDevice, withoutEnding, withRoomEnding, type GmScreenRecord } from './gmScreenRecord.ts';
import type { GmScreenPorts } from './gmScreenPorts.ts';
import { Comeback } from './gmScreenComeback.ts';
import type { RoomAnswer } from './gmScreenRoom.ts';
import { roomPrint } from './heldMarks.ts';
import { LinkedDevices } from './linkedDevices.ts';
import { ScreenRouter, type GmScreen, type GmScreenOutlet } from './screens.ts';
import { gmScreenView, type GmScreenView } from './gmScreenView.ts';

export type { GmScreenDeviceView, GmScreenStatus, GmScreenView } from './gmScreenView.ts';

const NAME = t('gmScreen.name');

/**
 * The GM screen's session on Atlas's side: its room at the relay (a second connection beside a table's,
 * sharing nothing with it), the devices the GM lets in and removes, and an encrypted channel to each
 * connected device, which the plugged screens send through. Nothing is contacted before `start` or a
 * `resume` of a room that ran, nor after `stop` once its room is seen ended.
 */
export class GmScreenSession implements GmScreenOutlet {
  private record: GmScreenRecord | null;
  /** `restarting`: the room the GM left running expired, and a new one at the same link is on its way. */
  private phase: 'stopped' | 'starting' | 'running' | 'restarting' = 'stopped';
  private connection: TableOutbox | null = null;
  private connectionStatus: TableStatus = 'connecting';
  private key: CryptoKey | null = null;
  private readonly linked: LinkedDevices;
  private readonly knocks: GmScreenKnocks;
  /** Rooms stopped and not yet seen ended: each is ended, or found ended, once the relay can be reached. */
  private readonly ends: RoomEnds;
  private readonly router = new ScreenRouter();
  private readonly comeback: Comeback;
  private problem: string | null = null;
  /** The room came back with Atlas (`resume`) and the relay has not welcomed it yet. */
  private comingBack = false;
  /** Counts starts, stops and closes, so an answer that comes after one of them changes nothing. */
  private run = 0;
  private readonly listeners = new Set<() => void>();
  private shown: GmScreenView;

  constructor(private readonly ports: GmScreenPorts, saved: GmScreenRecord | null) {
    this.record = saved;
    this.linked = new LinkedDevices({ crypto: ports.crypto, timers: ports.timers, router: this.router, record: () => this.record, keep: (record) => this.keep(record), connection: () => this.connection, now: () => ports.now() });
    this.comeback = new Comeback(ports.timers, ports.held, () => ports.now());
    this.knocks = new GmScreenKnocks(ports.timers, (id) => (this.key === null ? Promise.resolve('') : checkNumber(ports.crypto, this.key, id)), () => this.changed());
    this.ends = new RoomEnds(ports.open, ports.timers, (room) => this.record !== null && this.keep(withEnding(this.record, room)), (ended) => {
      if (this.record !== null) this.keep(withoutEnding(this.record, (room) => room.secret === ended.secret));
    });
    this.shown = this.makeView();
  }

  view(): GmScreenView {
    return this.shown;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get devices(): readonly string[] {
    return this.linked.open;
  }

  /** Plugs a screen in; returns what unplugs it. */
  plug(screen: GmScreen): () => void {
    const unplug = this.router.plug(screen);
    for (const device of this.devices) screen.opened(device);
    return unplug;
  }

  send(message: GmScreenMessage, to?: string): void {
    this.linked.send(message, to);
  }

  /** Asks the relay for the room at this computer's lasting code and connects to it. */
  async start(): Promise<void> {
    if (this.phase !== 'stopped') return;
    const record = this.record ?? newGmScreenRecord(this.ports.crypto);
    this.keep(record);
    this.problem = null;
    this.phase = 'starting';
    this.comeback.forget();
    this.changed();
    await this.make((this.run += 1), (refused) => this.halt(refused.refused));
  }

  /** Comes back to the room that ran before Obsidian or Atlas was reloaded, with the same link and devices, and ends the rooms stopped offline. */
  resume(): Promise<void> {
    this.ends.end(this.record?.ending ?? []);
    // Only a room that ran when the record was kept comes back.
    if (this.phase !== 'stopped' || this.record?.secret == null) return Promise.resolve();
    this.phase = 'starting';
    this.comingBack = true;
    this.changed();
    return this.connect((this.run += 1));
  }

  /**
   * Ends the room and every device's connection: at once where the connection is up, and by a connection of its own
   * that sees it ended (`RoomEnds`), since a socket that died unnoticed takes it nowhere. Link and devices stay.
   */
  stop(): void {
    if (this.phase === 'stopped') return;
    if (this.phase === 'running' && this.connectionStatus === 'online') this.connection?.end();
    if (this.record !== null) this.keep(withRoomEnding(this.record));
    this.halt(null);
    this.comeback.forget();
    this.ends.end(this.record?.ending ?? []);
  }

  /** Lets go of the connections, leaving the room on the relay for `resume` (Atlas unloads). */
  close(): void {
    this.letGo();
    this.ends.close();
  }

  /** A new link: a new room code and key, no devices; every device of the old link is ended. */
  newLink(): void {
    const running = this.phase !== 'stopped';
    this.stop();
    this.linked.forget();
    this.keep(newGmScreenRecord(this.ports.crypto, this.record?.ending));
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
    this.linked.allowed(id);
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
    this.linked.forget(id);
    this.connection?.setPlayers(seatsOf(this.record));
    this.connection?.kick(id);
    this.changed();
  }

  /** Asks the relay for the room at the link's code and connects to it, unless a stop, close or new link came first. */
  private async make(run: number, refused: (answer: Extract<RoomAnswer, { refused: string }>) => void, unlessLive = false): Promise<void> {
    const code = this.record?.link.code;
    if (code === undefined) return;
    const answer = await this.ports.create(code, unlessLive);
    if (run !== this.run || this.record === null) {
      if ('room' in answer) this.ends.overtaken(answer.room);
      return;
    }
    if ('refused' in answer) return refused(answer);
    // The relay ended every room at this code as it made this one: none is to be ended any more, and this one never.
    this.ends.forget(code);
    this.keep({ ...withoutEnding(this.record, (room) => room.code === code), secret: answer.room.secret });
    await this.connect(run);
  }

  /**
   * The room the GM left running expired while Atlas was away: a new one at the same link, with the same
   * devices, which come back by their own codes, and not a word to the GM. It is asked for only where the
   * account has no room of its kind live, so a Sidekick started meanwhile on another computer or in another
   * vault is never ended by it: then this one ends as a start elsewhere ends it, silently where Atlas came
   * back to it (`quiet`). The old secret stays in the record until the new room is made, so an unload
   * meanwhile comes back here on the next load.
   */
  private restart(heldAt: number, quiet: boolean): void {
    this.letGo(true);
    const run = this.run;
    const refused = (answer: Extract<RoomAnswer, { refused: string }>): void => {
      if (answer.later === true) return this.comeback.retry(again);
      this.halt(answer.live === true && quiet ? null : answer.refused, true);
    };
    const again = (): void => void this.make(run, refused, true);
    if (!this.comeback.restart(again, heldAt)) return this.halt(t('gmScreen.end.refused', { name: NAME }), true);
    this.phase = 'restarting';
    this.changed();
  }

  private async connect(run: number): Promise<void> {
    const asked = this.record;
    const key = asked === null ? null : await linkKey(this.ports.crypto, asked.link.key);
    const print = asked?.secret == null ? null : await roomPrint(asked.secret);
    if (run !== this.run) return;
    // Read again after the waits: a device removed meanwhile is not seated.
    const record = this.record;
    if (record?.secret == null || record.secret !== asked?.secret || key === null || print === null) return this.halt(t('gmScreen.end.refused', { name: NAME }));
    this.key = key;
    this.comeback.opened(print);
    this.linked.start(key);
    this.phase = 'running';
    this.connectionStatus = 'connecting';
    const room: CreatedTable = { code: record.link.code, secret: record.secret, maxPlayers: MAX_PLAYERS };
    const live = (): boolean => run === this.run;
    const connection = this.ports.open(room, this.tableEvents(live), this.knocks.gate(live, (id) => this.full(id)));
    this.connection = connection;
    connection.setPlayers(seatsOf(record));
    connection.start();
    this.changed();
  }

  /** What the room's connection says, heard only while it is `live` (its run is not over). */
  private tableEvents(live: () => boolean): TableEvents {
    return {
      status: (status) => live() && this.statusChanged(status),
      welcome: (players) => live() && (this.linked.welcome(players), this.changed()),
      joined: (player) => live() && (this.linked.joined(player), this.changed()),
      left: (id) => live() && (this.linked.left(id), this.changed()),
      message: (from, body) => live() && this.linked.receive(from, body),
      access: () => undefined,
      heard: () => live() && this.comeback.heard(),
    };
  }

  /** A device let in while every seat was taken: it must ask again once one is free. */
  private full(id: string): void {
    if (!this.linked.isFresh(id)) return;
    this.remove(id);
    this.ports.notice(t('gmScreen.full', { name: NAME }));
  }

  private statusChanged(status: TableStatus): void {
    const whileOnline = this.connectionStatus === 'online';
    this.connectionStatus = status;
    const closeCode = this.connection?.closeCode ?? null;
    const expiredAt = this.comeback.status(status, closeCode, whileOnline, this.ports.now());
    if (expiredAt !== null) return this.restart(expiredAt, this.comingBack);
    if (status === 'refused') return this.halt(gmScreenEndText(closeCode, this.comingBack), true);
    if (status === 'online') this.comingBack = false;
    if (status === 'connecting') this.linked.away();
    this.changed();
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
  private letGo(restarting = false): void {
    this.run += 1;
    this.comeback.letGo(restarting);
    const { connection } = this;
    this.connection = null;
    connection?.stop();
    this.phase = 'stopped';
    this.comingBack = false;
    this.linked.stop(!restarting);
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
    const status = this.phase === 'restarting' ? 'connecting' : this.phase === 'running' ? (this.connectionStatus === 'online' ? 'online' : 'connecting') : this.phase;
    return gmScreenView({ status, origin: this.ports.origin, record: this.record, connected: this.linked.connected, knock: this.knocks.first, waiting: this.knocks.count, problem: this.problem });
  }
}
