import type { GmMessage, LogEntry } from '../../protocol/index.ts';
import { entriesWithin, isOpen, sharedEntry, viewOf, type GmLogEntry } from './logEntries.ts';

type Send = (body: GmMessage, to?: string) => void;

/** An entry added or changed, to each player as they may see it: once to all where everyone sees it alike. */
export function publishEntry(send: Send, players: Iterable<string>, entry: GmLogEntry): void {
  if (isOpen(entry)) return send({ t: 'log-entry', entry: sharedEntry(entry) });
  for (const player of players) {
    const view = viewOf(entry, player);
    if (view !== null) send({ t: 'log-entry', entry: view }, player);
  }
}

/** An entry removed, for the players who held it. */
export function retractEntry(send: Send, players: Iterable<string>, entry: GmLogEntry): void {
  if (isOpen(entry)) return send({ t: 'log-remove', id: entry.id });
  for (const player of players) if (viewOf(entry, player) !== null) send({ t: 'log-remove', id: entry.id }, player);
}

/** The newest entries one player may see that fit `bytes`, or of a log everyone sees alike (`null`). */
export function snapshotFor(list: readonly GmLogEntry[], player: string | null, bytes: number): LogEntry[] {
  const seen = list.flatMap((entry) => {
    const view = player === null ? (entry.hidden === true ? null : sharedEntry(entry)) : viewOf(entry, player);
    return view === null ? [] : [view];
  });
  return entriesWithin(seen, bytes);
}

/** The log to one player or to all: alike where every entry is open, else each as they may see it. */
export function sendLog(send: Send, players: Iterable<string>, list: readonly GmLogEntry[], bytes: number, to?: string): void {
  if (to !== undefined) return send({ t: 'log', entries: snapshotFor(list, to, bytes) }, to);
  if (list.every(isOpen)) return send({ t: 'log', entries: snapshotFor(list, null, bytes) });
  for (const player of players) send({ t: 'log', entries: snapshotFor(list, player, bytes) }, player);
}
