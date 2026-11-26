import {
  ALL_PLAYERS, FINAL_CLOSE_CODES, PROTOCOL_VERSION, type CampaignSeat, type ConnectionStats, type GmMessage, type PlayerInfo, type YourCodeMessage,
} from '../../../../src/app/online/protocol/index.ts';
import { messageParts } from '../../../../src/app/online/gm/assetServe.ts';
import type { CreatedTable } from '../../../../src/app/online/gm/createdTable.ts';
import type { GateFrame } from '../../../../src/app/online/gm/joinGate.ts';
import { SendQueue, type QueueSocket } from '../../../../src/app/online/gm/sendQueue.ts';
import type { GateEvents, TableEvents, TableStatus } from '../../../../src/app/online/gm/TableConnection.ts';
import type { OpenOutbox, TableOutbox } from '../../../../src/app/online/gm/tableOutbox.ts';
import { WorkerTimers } from '../../../../src/app/utils/workerTimers';
import { PartJoiner, PlayerPages, type PageMessage } from './playerPages.ts';

/** What a table told the relay, in order, as the frames went out: the game's messages (one sent in parts as the message they make), and what only the relay reads. */
export type Told =
  | { readonly t: 'send'; readonly to: string | undefined; readonly body: PageMessage }
  | { readonly t: 'players'; readonly players: readonly CampaignSeat[] }
  | ({ readonly t: 'gate' } & GateFrame)
  | { readonly t: 'kick' | 'admit' | 'decline'; readonly id: string }
  | { readonly t: 'end' };

/** What a welcome says besides who is connected. */
export interface Welcome {
  readonly batch?: boolean;
  readonly minLevel?: number;
  /** The newcomers who wait for the GM's answer. */
  readonly waiting?: readonly PlayerInfo[];
}

interface Entry {
  readonly to: string;
  readonly body: PageMessage;
}

/** A frame on the table's socket, as `TableConnection` writes it. */
type Frame =
  | ({ readonly t: 'send' } & Entry)
  | { readonly t: 'sends'; readonly sends: readonly Entry[] }
  | ({ readonly t: 'gate' } & GateFrame)
  | { readonly t: 'players'; readonly players: readonly CampaignSeat[] }
  | { readonly t: 'kick' | 'admit' | 'decline'; readonly id: string }
  | { readonly t: 'end' };

const frame = (body: object): string => JSON.stringify({ v: PROTOCOL_VERSION, ...body });

/** A socket that hands every frame written to it to the relay at once. */
export class RelaySocket implements QueueSocket {
  /** Bytes the socket holds unsent: a test fills it to hold ordinary messages back, which live ones pass up to a limit (`SendQueue`). */
  bufferedAmount = 0;

  constructor(private readonly relay: (text: string) => void) {}

  send(text: string): void {
    this.relay(text);
  }
}

/**
 * A running table's outbox (`TableOutbox`) at the fake relay. It queues what the table sends as
 * `TableConnection` does, on the real `SendQueue` with its lanes, pacing and batches, to the players it
 * knows to be connected; the frames the queue writes reach the relay, and each game message the pages
 * of whom it is for that are there then. The test plays the relay.
 */
export class RelayOutbox implements TableOutbox {
  /** What the table told the relay, in order. */
  readonly told: Told[] = [];
  started = false;
  onSent: ((text: string, to: string) => void) | null = null;
  /** The table's socket to the relay, which the queue writes its frames to. */
  readonly socket = new RelaySocket((text) => this.hear(text));
  private status: TableStatus = 'connecting';
  private readonly players = new Set<string>();
  private batching = false;
  private needed: number | null = null;
  private lastClose: number | null = null;
  private reconnects = 0;
  private roster: string | null = null;
  private readonly queue = new SendQueue(new WorkerTimers());
  private readonly parts = new PartJoiner();
  private partIds = 0;

  constructor(readonly table: CreatedTable, private readonly events: TableEvents, private readonly gate: GateEvents | null, private readonly pages: PlayerPages) {}

  get connected(): ReadonlySet<string> {
    return this.players;
  }

  get batches(): boolean {
    return this.batching;
  }

  get minLevel(): number | null {
    return this.needed;
  }

  get closeCode(): number | null {
    return this.lastClose;
  }

  get online(): boolean {
    return this.status === 'online';
  }

  start(): void {
    this.started = true;
    this.setStatus('connecting');
  }

  stop(): void {
    this.queue.detach();
    this.forget();
    this.setStatus('stopped');
  }

  end(): void {
    if (this.online) this.hear(frame({ t: 'end' }));
    this.stop();
  }

  send(body: GmMessage, to: string = ALL_PLAYERS): void {
    if (this.isGone(to)) return;
    const parts = messageParts(body, () => (this.partIds += 1).toString(16).padStart(12, '0'));
    for (const part of parts) {
      const entry = JSON.stringify({ to, body: part });
      this.queue.push(frame({ t: 'send', to, body: part }), to, entry);
      if (parts.length === 1) this.onSent?.(entry, to);
    }
    if (parts.length > 1) this.onSent?.(JSON.stringify(body), to);
  }

  sendLive(body: GmMessage, key: string, to: string = ALL_PLAYERS): void {
    if (this.isGone(to)) return;
    this.queue.pushLive(`${to}\n${key}`, frame({ t: 'send', to, body }), to, JSON.stringify({ to, body }));
  }

  sendCode(message: YourCodeMessage, to: string): void {
    if (this.isGone(to)) return;
    this.queue.push(frame({ t: 'send', to, body: message }), to, JSON.stringify({ to, body: message }));
  }

  sendTime(): boolean {
    return false;
  }

  sendGate(gate: GateFrame): void {
    if (this.online) this.queue.push(frame({ t: 'gate', ...gate }));
  }

  setPlayers(players: readonly CampaignSeat[]): void {
    const roster = JSON.stringify(players);
    if (roster === this.roster) return;
    this.roster = roster;
    if (this.online) this.queue.push(frame({ t: 'players', players }));
  }

  answer(id: string, admit: boolean): void {
    this.queue.push(frame({ t: admit ? 'admit' : 'decline', id }));
  }

  kick(player: string): void {
    this.queue.push(frame({ t: 'kick', id: player }));
  }

  stats(): ConnectionStats {
    return { status: this.status, reconnects: this.reconnects, lastClose: this.lastClose, latencyMs: null, players: this.players.size };
  }

  /** The relay welcomes the table with these players connected: their pages join, and the relay is told the gates and players ahead of whatever waits. */
  welcome(players: readonly PlayerInfo[], welcome: Welcome = {}): void {
    this.needed = welcome.minLevel ?? null;
    for (const { id } of players) this.players.add(id);
    this.pages.join(...players.map(({ id }) => id));
    if (this.gate !== null) this.hear(frame({ t: 'gate', ...this.gate.frame() }));
    if (this.roster !== null) this.hear(frame({ t: 'players', players: JSON.parse(this.roster) as CampaignSeat[] }));
    this.batching = welcome.batch === true;
    this.queue.attach(this.socket, this.batching);
    this.setStatus('online');
    this.events.access(null);
    this.gate?.welcomed(welcome.waiting ?? []);
    this.events.welcome(players);
  }

  /** A player's page connects. */
  join(player: PlayerInfo): void {
    this.players.add(player.id);
    this.pages.join(player.id);
    this.events.joined(player);
  }

  /** A player's page goes, and what waits for them is dropped. */
  leave(player: string): void {
    this.players.delete(player);
    this.queue.drop((to) => this.isGone(to));
    this.pages.leave(player);
    this.events.left(player);
  }

  /** A player's message, as the relay hands it on. */
  from(player: string, body: object): void {
    this.events.message(player, body);
  }

  /** The relay closes the table's link: given up for good on a final code, otherwise tried again until the next welcome. */
  close(code: number): void {
    this.queue.detach();
    this.lastClose = code;
    this.forget();
    if (FINAL_CLOSE_CODES.includes(code)) return this.setStatus('refused');
    this.reconnects += 1;
    this.setStatus('connecting');
  }

  /** The relay says when the table closes for want of access, or that it no longer does. */
  access(closesAt: number | null): void {
    this.events.access(closesAt);
  }

  /** A newcomer knocks. */
  knock(player: PlayerInfo): void {
    this.gate?.knocked(player);
  }

  /** A knock ended; `full`: admitted, but the table had no seat left. */
  knockGone(id: string, full = false): void {
    this.gate?.gone(id, full);
  }

  /** Too many wrong codes: no newcomer joins until `until`. */
  pauseGate(until: number): void {
    this.gate?.paused(until);
  }

  private isGone(to: string): boolean {
    return to === ALL_PLAYERS ? this.players.size === 0 : !this.players.has(to);
  }

  /** Nobody is known to be there until the next welcome: no page hears the table, and what waits for them is dropped. */
  private forget(): void {
    for (const player of this.players) this.pages.leave(player);
    this.players.clear();
    this.queue.drop((to) => this.isGone(to));
  }

  /** A frame reaches the relay. */
  private hear(text: string): void {
    const heard = JSON.parse(text) as Frame;
    if (heard.t === 'sends') for (const entry of heard.sends) this.hand(entry);
    else if (heard.t === 'send') this.hand(heard);
    else if (heard.t === 'gate') this.told.push({ t: 'gate', code: heard.code, ask: heard.ask });
    else if (heard.t === 'players') this.told.push({ t: 'players', players: heard.players });
    else if (heard.t === 'end') this.told.push({ t: 'end' });
    else this.told.push({ t: heard.t, id: heard.id });
  }

  /** The relay hands a game message on to the pages of whom it is for that are there now. */
  private hand({ to, body }: Entry): void {
    this.pages.deliver(body, to);
    const whole = body.t === 'part' ? this.parts.join(`${to}\n${body.id}`, body) : body;
    if (whole !== null) this.told.push({ t: 'send', to: to === ALL_PLAYERS ? undefined : to, body: whole });
  }

  private setStatus(status: TableStatus): void {
    this.status = status;
    this.events.status(status);
  }
}

/** The relay for tests of running tables (`OnlineControl`, `OnlineTable`), with a page per player. */
export class FakeRelay {
  readonly pages = new PlayerPages();
  /** The outboxes of the tables opened here, the latest last. */
  readonly opened: RelayOutbox[] = [];

  readonly open: OpenOutbox = (table, events, gate) => {
    const outbox = new RelayOutbox(table, events, gate, this.pages);
    this.opened.push(outbox);
    return outbox;
  };

  /** Every game message the tables opened here sent, to anyone, in order. */
  sent(): Extract<Told, { t: 'send' }>[] {
    return this.opened.flatMap(({ told }) => told.filter((entry): entry is Extract<Told, { t: 'send' }> => entry.t === 'send'));
  }

  /** The outbox of the table opened last. */
  get outbox(): RelayOutbox {
    const outbox = this.opened.at(-1);
    if (outbox === undefined) throw new Error('no table opened');
    return outbox;
  }
}
