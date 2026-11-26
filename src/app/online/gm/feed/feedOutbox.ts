import { deltaChanges, type DeltaOf, type GmMessage, type JsonRecord } from '../../protocol/index.ts';

type Sequenced<K extends DeltaOf> = Extract<GmMessage, { t: K }>;
/** What a sequenced message says, without its kind, scene and number. */
export type SequencedContent<K extends DeltaOf> = Omit<Sequenced<K>, 't' | 'scene' | 'seq'>;

/** How soon a player may ask for a sequenced message whole again. */
export const RESYNC_INTERVAL_MS = 1_000;

export interface OutboxPorts {
  send(body: GmMessage, to?: string): void;
  /** The live lane: it goes before other waiting frames, and a newer message under the same key replaces one still waiting. */
  sendLive?(body: GmMessage, key: string, to?: string): void;
  now(): number;
}

/** A message kept to send again, and what tells it from another of its kind (its text unless the feed names another). */
export interface Kept {
  readonly body: GmMessage;
  readonly key: string;
}

/** Messages a feed keeps by rules of its own (the marks' audiences): forgotten with each scene, sent again after the engine's own. */
export interface FeedChannel {
  resend(to?: string): void;
  reset(): void;
}

/** What a feed's build hands its messages to. Each send is skipped where it says what was last said. */
export interface FeedOut {
  /** Sends `body` to the feed's players unless the last message of its kind said the same: its `key`, else its text. */
  send(body: GmMessage, key?: string): boolean;
  /** Whether a message of this kind went out since the scene was shared. */
  has(kind: GmMessage['t']): boolean;
  /** Sends the next message of a sequenced kind: whole where it is the scene's first or the delta would not be smaller, else as a delta. */
  sequenced<K extends DeltaOf>(of: K, content: SequencedContent<K>): boolean;
  /** Sends `body` to one player unless the last message of its kind to them said the same. */
  to(player: string, body: GmMessage): boolean;
  /** Forgets what everyone but `players` was sent alone: they are told afresh should they be told again. */
  keepOnly(players: ReadonlySet<string> | ReadonlyMap<string, unknown>): void;
  /** Sends a message through the live lane under `key`, which nothing keeps. */
  live(body: GmMessage, key: string): void;
}

interface Last {
  readonly scene: string;
  readonly seq: number;
  /** The content as players read it (through JSON), and its text. */
  readonly content: JsonRecord;
  readonly text: string;
}

/**
 * One sequenced message all the feed's players follow (the token list, the sight inputs): numbered across scenes, the
 * scene's first goes out whole, each change after it as a delta from what was last sent where that is smaller. A
 * player who joins or asks gets it whole with its number.
 */
class SequencedLane<K extends DeltaOf> {
  private last: Last | null = null;
  private seq = 0;
  /** When each player last asked for the whole message. */
  private readonly asked = new Map<string, number>();

  constructor(private readonly of: K, private readonly ports: OutboxPorts) {}

  publish(scene: string, content: SequencedContent<K>): boolean {
    const text = JSON.stringify(content);
    const last = this.last;
    if (last?.scene === scene && last.text === text) return false;
    const read = JSON.parse(text) as JsonRecord;
    this.seq += 1;
    this.last = { scene, seq: this.seq, content: read, text };
    const changes = last?.scene === scene ? deltaChanges(this.of, last.content, read) : null;
    const delta: GmMessage | null = changes === null ? null : { t: 'delta', of: this.of, scene, seq: this.seq, ...changes };
    this.ports.send(delta !== null && JSON.stringify(delta).length < text.length ? delta : this.whole(this.last));
    return true;
  }

  resend(to?: string): void {
    if (this.last !== null) this.ports.send(this.whole(this.last), to);
  }

  /** A player asks for the whole message: answered at most every `RESYNC_INTERVAL_MS`. */
  resync(player: string): void {
    const now = this.ports.now();
    const asked = this.asked.get(player);
    if (asked !== undefined && now - asked < RESYNC_INTERVAL_MS) return;
    this.asked.set(player, now);
    this.resend(player);
  }

  reset(): void {
    this.last = null;
  }

  private whole(last: Last): GmMessage {
    return { t: this.of, scene: last.scene, seq: last.seq, ...last.content } as unknown as GmMessage;
  }
}

/**
 * What one feed sent since its scene was shared, by the rules every feed sends by: a message is not sent again while
 * it says what the last of its kind said, and is kept to be sent again whole. Sent again, the kinds go in the order
 * they first went out, then the sequenced ones, then what single players were told, then the feed's own channels.
 */
export class FeedOutbox {
  private readonly kept = new Map<GmMessage['t'], Kept>();
  private readonly lanes: Map<DeltaOf, SequencedLane<DeltaOf>>;
  private readonly own = new Map<string, Map<GmMessage['t'], Kept>>();

  constructor(private readonly ports: OutboxPorts, sequenced: readonly DeltaOf[], private readonly channels: readonly FeedChannel[], private readonly again?: (kept: Kept) => GmMessage | null) {
    this.lanes = new Map(sequenced.map((of) => [of, new SequencedLane(of, ports)]));
  }

  /** What a build of the scene `scene` sends through, while `current` says its scene is still shared. */
  out(scene: string, current: () => boolean): FeedOut {
    return {
      send: (body, key) => current() && this.send(body, key ?? JSON.stringify(body)),
      has: (kind) => this.kept.has(kind),
      sequenced: (of, content) => current() && this.lane(of).publish(scene, content),
      to: (player, body) => current() && this.sendTo(player, body),
      keepOnly: (players) => {
        for (const player of [...this.own.keys()]) if (!players.has(player)) this.own.delete(player);
      },
      live: (body, key) => {
        if (current()) this.ports.sendLive?.(body, key);
      },
    };
  }

  /** Everything kept, whole, to one player or to all. */
  resend(to?: string): void {
    for (const kept of this.kept.values()) {
      const body = this.again === undefined ? kept.body : this.again(kept);
      if (body !== null) this.ports.send(body, to);
    }
    for (const lane of this.lanes.values()) lane.resend(to);
    for (const [player, kinds] of this.own) {
      if (to === undefined || to === player) for (const { body } of kinds.values()) this.ports.send(body, player);
    }
    for (const channel of this.channels) channel.resend(to);
  }

  /** A player asks for a sequenced message whole: answered where the feed sends that kind. */
  resync(player: string, of: DeltaOf): void {
    this.lanes.get(of)?.resync(player);
  }

  /** Forgets what one player (each, without `to`) was told alone. */
  forget(to?: string): void {
    if (to === undefined) this.own.clear();
    else this.own.delete(to);
  }

  /** Another scene: nothing sent before counts. Sequenced kinds keep counting. */
  reset(): void {
    this.kept.clear();
    this.own.clear();
    for (const lane of this.lanes.values()) lane.reset();
    for (const channel of this.channels) channel.reset();
  }

  private send(body: GmMessage, key: string): boolean {
    if (this.kept.get(body.t)?.key === key) return false;
    this.kept.set(body.t, { body, key });
    this.ports.send(body);
    return true;
  }

  private sendTo(player: string, body: GmMessage): boolean {
    const key = JSON.stringify(body);
    const kinds = this.own.get(player) ?? new Map<GmMessage['t'], Kept>();
    if (kinds.get(body.t)?.key === key) return false;
    kinds.set(body.t, { body, key });
    this.own.set(player, kinds);
    this.ports.send(body, player);
    return true;
  }

  private lane(of: DeltaOf): SequencedLane<DeltaOf> {
    const lane = this.lanes.get(of);
    if (lane === undefined) throw new Error(`the feed sends no ${of}`);
    return lane;
  }
}
