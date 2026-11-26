import { ALL_PLAYERS, FINAL_CLOSE_CODES, type CampaignSeat, type ConnectionStats, type GmMessage, type PlayerInfo, type YourCodeMessage } from '../../../../src/app/online/protocol/index.ts';
import type { CreatedTable } from '../../../../src/app/online/gm/createdTable.ts';
import type { GateFrame } from '../../../../src/app/online/gm/joinGate.ts';
import type { GateEvents, TableEvents, TableStatus } from '../../../../src/app/online/gm/TableConnection.ts';
import type { OpenOutbox, TableOutbox } from '../../../../src/app/online/gm/tableOutbox.ts';
import { PlayerPages, type PageMessage } from './playerPages.ts';

/** What a table told the relay, in order: the game's messages, and what only the relay reads. */
export type Told =
  /** `live`: sent through the live lane, which goes ahead of every other waiting message (`TableConnection.sendLive`). */
  | { readonly t: 'send'; readonly to: string | undefined; readonly body: PageMessage; readonly live?: true }
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

/**
 * A running table's outbox (`TableOutbox`) at the fake relay: what the table sends reaches the pages
 * of the players it knows to be connected, as `TableConnection` hands it on; the test plays the relay.
 */
export class RelayOutbox implements TableOutbox {
  /** What the table told the relay, in order. */
  readonly told: Told[] = [];
  started = false;
  onSent: ((text: string, to: string) => void) | null = null;
  private status: TableStatus = 'connecting';
  private readonly players = new Set<string>();
  private batching = false;
  private needed: number | null = null;
  private lastClose: number | null = null;
  private reconnects = 0;
  private roster: readonly CampaignSeat[] | null = null;

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
    this.players.clear();
    this.setStatus('stopped');
  }

  end(): void {
    if (this.online) this.told.push({ t: 'end' });
    this.stop();
  }

  send(body: GmMessage, to: string = ALL_PLAYERS): void {
    if (this.deliver(body, to)) this.onSent?.(JSON.stringify({ to, body }), to);
  }

  sendLive(body: GmMessage, _key: string, to: string = ALL_PLAYERS): void {
    this.deliver(body, to, true);
  }

  sendCode(message: YourCodeMessage, to: string): void {
    this.deliver(message, to);
  }

  sendTime(): boolean {
    return false;
  }

  sendGate(frame: GateFrame): void {
    if (this.online) this.told.push({ t: 'gate', ...frame });
  }

  setPlayers(players: readonly CampaignSeat[]): void {
    this.roster = players;
    if (this.online) this.told.push({ t: 'players', players });
  }

  answer(id: string, admit: boolean): void {
    this.told.push({ t: admit ? 'admit' : 'decline', id });
  }

  kick(player: string): void {
    this.told.push({ t: 'kick', id: player });
  }

  stats(): ConnectionStats {
    return { status: this.status, reconnects: this.reconnects, lastClose: this.lastClose, latencyMs: null, players: this.players.size };
  }

  /** The relay welcomes the table with these players connected: their pages join, and the relay is told the gates and players first. */
  welcome(players: readonly PlayerInfo[], welcome: Welcome = {}): void {
    this.needed = welcome.minLevel ?? null;
    this.batching = welcome.batch === true;
    for (const { id } of players) this.players.add(id);
    this.pages.join(...players.map(({ id }) => id));
    if (this.gate !== null) this.told.push({ t: 'gate', ...this.gate.frame() });
    if (this.roster !== null) this.told.push({ t: 'players', players: this.roster });
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

  /** A player's page goes. */
  leave(player: string): void {
    this.players.delete(player);
    this.pages.leave(player);
    this.events.left(player);
  }

  /** A player's message, as the relay hands it on. */
  from(player: string, body: object): void {
    this.events.message(player, body);
  }

  /** The relay closes the table's link: given up for good on a final code, otherwise tried again until the next welcome. */
  close(code: number): void {
    this.lastClose = code;
    this.players.clear();
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

  /** Whether the message went out: to someone the table knows to be connected, while it is online. */
  private deliver(body: PageMessage, to: string, live?: true): boolean {
    if (!this.online || (to === ALL_PLAYERS ? this.players.size === 0 : !this.players.has(to))) return false;
    this.told.push({ t: 'send', to: to === ALL_PLAYERS ? undefined : to, body, ...(live && { live }) });
    this.pages.deliver(body, to);
    return true;
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
