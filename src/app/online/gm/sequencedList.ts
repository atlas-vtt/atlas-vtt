import { deltaChanges, type DeltaOf, type GmMessage, type JsonRecord } from '../protocol/index.ts';

type Sequenced<K extends DeltaOf> = Extract<GmMessage, { t: K }>;
/** What a sequenced message says, without its kind, scene and number. */
export type SequencedContent<K extends DeltaOf> = Omit<Sequenced<K>, 't' | 'scene' | 'seq'>;

/** How soon a player may ask for the whole message again. */
export const RESYNC_INTERVAL_MS = 1_000;

export interface SequencedListPorts {
  send(body: GmMessage, to?: string): void;
  now(): number;
}

interface Last {
  readonly scene: string;
  readonly seq: number;
  /** The content as players read it (through JSON), and its text. */
  readonly content: JsonRecord;
  readonly text: string;
}

/**
 * One sequenced message all players follow (the token list, the sight inputs): the first of a scene
 * goes out whole, each change after it as a delta from what everyone was last sent, or whole where
 * the delta would not be smaller. A player who joins or asks gets it whole with its number. The
 * content is worked out by the caller with its own filter; a delta only says how it changed.
 */
export class SequencedList<K extends DeltaOf> {
  private readonly of: K;
  private readonly ports: SequencedListPorts;
  private last: Last | null = null;
  /** Numbers every message of the list, across scenes. */
  private seq = 0;
  /** When each player last asked for the whole message. */
  private readonly asked = new Map<string, number>();

  constructor(of: K, ports: SequencedListPorts) {
    this.of = of;
    this.ports = ports;
  }

  /** Sends the content for a scene unless it is what everyone was last sent. */
  publish(scene: string, content: SequencedContent<K>): void {
    const text = JSON.stringify(content);
    const last = this.last;
    if (last?.scene === scene && last.text === text) return;
    const read = JSON.parse(text) as JsonRecord;
    this.seq += 1;
    this.last = { scene, seq: this.seq, content: read, text };
    const changes = last?.scene === scene ? deltaChanges(this.of, last.content, read) : null;
    const delta: GmMessage | null = changes === null ? null : { t: 'delta', of: this.of, scene, seq: this.seq, ...changes };
    this.ports.send(delta !== null && JSON.stringify(delta).length < text.length ? delta : this.whole());
  }

  /** The last message again, whole, to one player or to all, while it is of `scene`. */
  resend(scene: string | null, to?: string): void {
    if (this.last !== null && this.last.scene === scene) this.ports.send(this.whole(), to);
  }

  /** A player asks for the whole message: answered at most every `RESYNC_INTERVAL_MS`, and only for the scene shown. */
  resync(player: string, scene: string): void {
    const now = this.ports.now();
    const asked = this.asked.get(player);
    if (asked !== undefined && now - asked < RESYNC_INTERVAL_MS) return;
    this.asked.set(player, now);
    this.resend(scene, player);
  }

  /** Forgets what was sent: the next message goes out whole. */
  reset(): void {
    this.last = null;
  }

  private whole(): GmMessage {
    const last = this.last;
    if (last === null) throw new Error('nothing was sent');
    return { t: this.of, scene: last.scene, seq: last.seq, ...last.content } as unknown as GmMessage;
  }
}
