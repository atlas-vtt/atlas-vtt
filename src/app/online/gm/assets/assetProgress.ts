import { ALL_PLAYERS, MAX_PROGRESS_ENTRIES, type GmMessage } from '../../protocol/index.ts';
import type { Timers } from '../companionTimers.ts';

/** How often players hear how far the uploads came, at most. */
export const PROGRESS_INTERVAL_MS = 500;
/** How long an asset that reached 1 stays in the paced messages, so a message the live lane replaced before it left loses no completion. */
export const DONE_KEPT_MS = 5_000;
/**
 * While anything is still on its way, players hear of it at least this often even when no share
 * moved (one large object uploads in one request and its share stands still for a long time): a page
 * takes a long silence as the GM gone and fetches on its own, which costs it requests for nothing.
 */
export const PROGRESS_HEARTBEAT_MS = 5_000;
/** The key the paced messages share in the live lane (per recipient): a newer one replaces one that still waits. */
const LIVE_KEY = 'asset-progress';
/** An asset id where a message names one: a reference's `id` (64 hex; random ids are 24). */
const REF_ID = /"id":"([0-9a-f]{64})"/g;

export interface ProgressPorts {
  /** Sends ahead of other frames, the newest of a key replacing one that waits. */
  sendLive(body: GmMessage, key: string, to?: string): void;
  send(body: GmMessage, to?: string): void;
  /** The players connected now. */
  connected(): readonly string[];
  readonly timers: Timers;
}

/** Shares as messages of at most `MAX_PROGRESS_ENTRIES` each. */
function messagesOf(entries: readonly (readonly [string, number])[]): GmMessage[] {
  const messages: GmMessage[] = [];
  for (let start = 0; start < entries.length; start += MAX_PROGRESS_ENTRIES) {
    messages.push({ t: 'asset-progress', shares: Object.fromEntries(entries.slice(start, start + MAX_PROGRESS_ENTRIES)) });
  }
  return messages;
}

/** The asset ids a message sent to players names in its references. */
export function refIdsIn(text: string): string[] {
  return [...text.matchAll(REF_ID)].map((match) => match[1] ?? '');
}

/**
 * How far each asset has come on its way into the store (0 to 1, where 1 means it can be fetched),
 * told to each player only for the ids they were sent references of (`handed`: an id is the right to
 * read the object, and a player's book holds what nobody else may read). Paced at
 * `PROGRESS_INTERVAL_MS` through the live lane while anything moves, at least every
 * `PROGRESS_HEARTBEAT_MS` while anything is still on its way, with a last message saying 1; every
 * share a player holds again, whole, after a reconnect and when they join; and the shares of ids a
 * player is handed for the first time at once (a stored map handed on a floor change, which no paced
 * message would name again: the page would wait out the GM's silence before it drew). Players who
 * hold the same ids are told in one message, all of them at once where everyone holds them.
 */
export class AssetProgress {
  private readonly shares = new Map<string, number>();
  /** The ids each player was sent references of. */
  private readonly handed = new Map<string, Set<string>>();
  /** When each asset reached 1, while it is still named in the paced messages. */
  private readonly doneAt = new Map<string, number>();
  private readonly changed = new Set<string>();
  private timer: number | undefined;
  private heartbeat: number | undefined;
  private lastAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly ports: ProgressPorts) {}

  /** Sets an asset's share; told to whoever holds it within `PROGRESS_INTERVAL_MS` where it changed. */
  set(id: string, share: number): void {
    const clamped = Math.min(1, Math.max(0, share));
    if (this.shares.get(id) === clamped) return;
    this.shares.set(id, clamped);
    if (clamped === 1) this.doneAt.set(id, this.ports.timers.now());
    else this.doneAt.delete(id);
    this.changed.add(id);
    this.schedule();
  }

  share(id: string): number | undefined {
    return this.shares.get(id);
  }

  /** A message went to `to` (a player, or everyone connected): the ids its references name are theirs to hear of from now on. */
  sent(text: string, to: string): void {
    const ids = refIdsIn(text).filter((id) => this.shares.has(id));
    if (ids.length === 0) return;
    const players = to === ALL_PLAYERS ? this.ports.connected() : [to];
    const fresh = new Map<string, string[]>();
    for (const player of players) {
      const held = this.handed.get(player) ?? new Set<string>();
      const unheard = [...new Set(ids.filter((id) => !held.has(id)))].sort();
      for (const id of ids) held.add(id);
      this.handed.set(player, held);
      if (unheard.length > 0) fresh.set(player, unheard);
    }
    // Told at once and to each alone, so a page never waits out a silence for an asset that is already there.
    for (const [player, list] of fresh) {
      const entries = list.map((id): [string, number] => [id, this.shares.get(id) ?? 0]);
      for (const body of messagesOf(entries)) this.ports.send(body, player);
    }
  }

  /** A player left: what they were handed is forgotten (they are sent it again when they come back). */
  playerLeft(player: string): void {
    this.handed.delete(player);
  }

  /** Forgets an asset: it is named no more, to anyone. */
  delete(id: string): void {
    this.shares.delete(id);
    this.doneAt.delete(id);
    this.changed.delete(id);
    for (const held of this.handed.values()) held.delete(id);
  }

  /** Every share a player holds, whole, to that player; to everyone, each their own. */
  resend(to?: string): void {
    const players = to === undefined || to === ALL_PLAYERS ? this.ports.connected() : [to];
    this.tell(players, () => true, (body, recipient) => this.ports.send(body, recipient));
  }

  stop(): void {
    if (this.timer !== undefined) this.ports.timers.clearTimer(this.timer);
    this.timer = undefined;
    if (this.heartbeat !== undefined) this.ports.timers.clearTimer(this.heartbeat);
    this.heartbeat = undefined;
  }

  /** While any asset is still on its way, a flush is due again after `PROGRESS_HEARTBEAT_MS` of nothing moving. */
  private keepHeard(): void {
    const moving = [...this.shares].filter(([, share]) => share < 1).map(([id]) => id);
    if (moving.length === 0 || this.heartbeat !== undefined) return;
    this.heartbeat = this.ports.timers.setTimer(() => {
      this.heartbeat = undefined;
      if (this.ports.timers.now() - this.lastAt < PROGRESS_HEARTBEAT_MS) return this.keepHeard();
      for (const id of moving) if ((this.shares.get(id) ?? 1) < 1) this.changed.add(id);
      this.flush();
    }, PROGRESS_HEARTBEAT_MS);
  }

  private schedule(): void {
    if (this.timer !== undefined) return;
    const wait = Math.max(0, this.lastAt + PROGRESS_INTERVAL_MS - this.ports.timers.now());
    this.timer = this.ports.timers.setTimer(() => {
      this.timer = undefined;
      this.flush();
    }, wait);
  }

  /** What moves now: every asset not yet there, and those that got there lately; nothing when nothing changed. */
  private flush(): void {
    if (this.changed.size === 0) return;
    const now = this.ports.timers.now();
    this.lastAt = now;
    this.changed.clear();
    for (const [id, at] of [...this.doneAt]) if (now - at > DONE_KEPT_MS) this.doneAt.delete(id);
    const moving = (id: string, share: number): boolean => share < 1 || this.doneAt.has(id);
    this.tell(this.ports.connected(), moving, (body, recipient, first) => {
      if (first) this.ports.sendLive(body, LIVE_KEY, recipient);
      else this.ports.send(body, recipient);
    });
    this.keepHeard();
  }

  /** Tells each player the shares of their ids that `include` lets through, players holding the same in one message. */
  private tell(players: readonly string[], include: (id: string, share: number) => boolean, send: (body: GmMessage, to: string, first: boolean) => void): void {
    const groups = new Map<string, { readonly entries: [string, number][]; readonly players: string[] }>();
    for (const player of players) {
      const entries = [...(this.handed.get(player) ?? [])].flatMap((id): [string, number][] => {
        const share = this.shares.get(id);
        return share !== undefined && include(id, share) ? [[id, share]] : [];
      }).sort(([a], [b]) => a.localeCompare(b));
      if (entries.length === 0) continue;
      const key = entries.map(([id]) => id).join(',');
      const group = groups.get(key) ?? { entries, players: [] };
      group.players.push(player);
      groups.set(key, group);
    }
    const everyone = this.ports.connected().length;
    for (const { entries, players: holders } of groups.values()) {
      const recipients = holders.length === everyone && everyone > 1 ? [ALL_PLAYERS] : holders;
      for (const recipient of recipients) messagesOf(entries).forEach((body, index) => send(body, recipient, index === 0));
    }
  }
}
