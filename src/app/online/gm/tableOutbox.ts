import type { ConnectionStats, GmMessage } from '../protocol/index.ts';
import type { CreatedTable } from './createdTable.ts';
import type { GateFrame } from './joinGate.ts';
import { RELAY_ORIGIN } from './servers.ts';
import { TableConnection, type GateEvents, type TableEvents } from './TableConnection.ts';
import type { RosterLink } from './tableRoster.ts';

/** What a running table sends through, and asks of its link to the relay. */
export interface TableOutbox extends RosterLink {
  start(): void;
  /** Closes the link and stops, leaving the table on the relay. */
  stop(): void;
  /** Ends the table on the relay, then stops. */
  end(): void;
  /** Sends a game message to one player, or to all (`ALL_PLAYERS`, the default). */
  send(body: GmMessage, to?: string): void;
  /** Sends a live message, which a newer one of the same `key` replaces while it waits. */
  sendLive(body: GmMessage, key: string, to?: string): void;
  /** Sends one time exchange; false where it cannot go. */
  sendTime(t1: number): boolean;
  sendGate(frame: GateFrame): void;
  answer(id: string, admit: boolean): void;
  kick(player: string): void;
  stats(): ConnectionStats;
  /** The players connected now. */
  readonly connected: ReadonlySet<string>;
  /** Whether the relay takes `sends` frames. */
  readonly batches: boolean;
  /** The least GM level the relay's player page needs, as its last welcome said; null while it said none. */
  readonly minLevel: number | null;
  /** The code the relay last closed the link with, or null. */
  readonly closeCode: number | null;
  /** Hears every game message that goes out (not the live lane's), as JSON, with whom it goes to. */
  onSent: ((text: string, to: string) => void) | null;
}

/** Opens the outbox of a table, which tells `events` what the relay says and the relay the table's gates (none: it tells no gates). */
export type OpenOutbox = (table: CreatedTable, events: TableEvents, gate: GateEvents | null) => TableOutbox;

/** The table's socket to Atlas's relay. */
export const relayOutbox: OpenOutbox = (table, events, gate) => new TableConnection(RELAY_ORIGIN, table.code, table.secret, events, gate);
