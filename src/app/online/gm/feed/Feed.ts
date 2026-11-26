import type { DeltaOf, GmMessage, PlayerResync } from '../../protocol/index.ts';
import type { PacerClock } from '../../marks/index.ts';
import { FeedOutbox, type FeedChannel, type FeedOut, type Kept, type OutboxPorts } from './feedOutbox.ts';
import type { FeedMember } from './FeedGroup.ts';

export interface FeedPorts extends PacerClock, OutboxPorts {}

/** The shared scene a feed's messages belong to. */
export interface FeedScene {
  readonly id: string;
  readonly lit: boolean;
}

/** Why a feed builds: something it reads changed, or a player is to be sent what it says afresh (`resend: 'build'`). */
export type BuildCause = 'update' | 'resend';

/** What a feed says about itself: how to build its messages from what it reads, and how often. */
export interface FeedRules {
  /** The shortest time between two builds (ms); without it every update builds at once. */
  readonly interval?: number;
  /** Counts the interval from the last build that sent something, so a build that changed nothing does not hold the next one back. */
  readonly paceSends?: boolean;
  /** The kinds it sends as sequenced messages, in the order they are sent again. */
  readonly sequenced?: readonly DeltaOf[];
  /** How it is sent again: what it last sent (the default), or built afresh after forgetting what each player was told alone. */
  readonly resend?: 'last' | 'build';
  /** Messages it keeps by rules of its own, forgotten with each scene and sent again after the others. */
  readonly channels?: readonly FeedChannel[];
  /** Feeds of its own (the map's widgets): each takes the feed's scene before the feed starts it, is sent again after it and stops with it. */
  readonly parts?: readonly Feed[];
  /** The message sent again in place of a kept one, or null to send none (a message whose content ages, such as running timers). */
  again?(kept: Kept): GmMessage | null;
  /** Builds the feed's messages for `scene` from what it reads now and hands them to `out`; nothing while that cannot be read. */
  build(scene: FeedScene, out: FeedOut, cause: BuildCause): void | Promise<void>;
  /** A new scene, or none: what the feed worked out of the one before goes. */
  reset?(scene: FeedScene | null): void;
  /** What a new scene starts with: an update by default. */
  opened?(): void;
}

/**
 * The engine every feed of a shared scene runs on. A feed only builds its messages from what it reads (`FeedRules`); the
 * engine keeps its scene and forgets what was sent with each new one, paces its builds, skips a message that says
 * what the last of its kind said, numbers sequenced messages and sends their changes as deltas, sends everything
 * again whole to a player who joins or to all, and answers a player who asks for a sequenced message whole.
 */
export class Feed implements FeedMember {
  private current: FeedScene | null = null;
  private readonly outbox: FeedOutbox;
  private builtAt = Number.NEGATIVE_INFINITY;
  private sentAt = Number.NEGATIVE_INFINITY;
  private timer: number | undefined;
  /** A look once the interval since the last build has passed (`soon`), unless a build comes first. */
  private soonTimer: number | undefined;

  constructor(private readonly ports: FeedPorts, private readonly rules: FeedRules) {
    this.outbox = new FeedOutbox(ports, rules.sequenced ?? [], rules.channels ?? [], rules.again?.bind(rules));
  }

  /** The shared scene the feed sends of, or null while it sends none. */
  get scene(): FeedScene | null {
    return this.current;
  }

  /** The shared scene from now on, or none; another one forgets what was sent of the one before and starts. */
  setScene(scene: FeedScene | null): void {
    if (scene?.id === this.current?.id) return;
    this.current = scene;
    this.outbox.reset();
    // A feed paced by its sends keeps counting from the last scene's: a new scene's first message waits for it as any other does
    this.cancel();
    this.rules.reset?.(scene);
    for (const part of this.rules.parts ?? []) part.setScene(scene);
    if (scene === null) return;
    if (this.rules.opened === undefined) this.update();
    else this.rules.opened();
  }

  /** Builds now, or once the interval since the last build has passed, however many updates come meanwhile. */
  update(): void {
    if (this.current === null || this.timer !== undefined) return;
    const wait = (this.rules.paceSends === true ? this.sentAt : this.builtAt) + (this.rules.interval ?? 0) - this.ports.now();
    if (wait <= 0) return this.build('update');
    this.timer = this.ports.setTimer(() => {
      this.timer = undefined;
      this.build('update');
    }, wait);
  }

  /** Builds now, before the interval has passed: a build waiting goes. */
  updateNow(): void {
    if (this.current === null) return;
    this.cancelTimer();
    this.build('update');
  }

  /** Runs `look` (an update unless named) once the interval since the last build has passed, unless a build comes before. */
  soon(look: () => void = () => this.update()): void {
    if (this.current === null || this.timer !== undefined || this.soonTimer !== undefined) return;
    const wait = this.builtAt + (this.rules.interval ?? 0) - this.ports.now();
    if (wait <= 0) return look();
    this.soonTimer = this.ports.setTimer(() => {
      this.soonTimer = undefined;
      look();
    }, wait);
  }

  /** Everything the feed sent of its scene, whole, to one player or to all. */
  resend(to?: string): void {
    if (this.rules.resend === 'build') {
      this.outbox.forget(to);
      if (this.current !== null) this.build('resend');
    } else this.outbox.resend(to);
    for (const part of this.rules.parts ?? []) part.resend(to);
  }

  /** A player whose sequenced messages stopped following on asks for one whole: answered for the scene shared now. */
  resync(player: string, message: PlayerResync): void {
    if (message.scene === this.current?.id) this.outbox.resync(player, message.of);
  }

  clear(): void {
    this.setScene(null);
  }

  /** Drops a build that waits, keeping the scene: the next update builds as if none had come before. */
  cancel(): void {
    this.cancelTimer();
    this.cancelSoon();
    this.builtAt = Number.NEGATIVE_INFINITY;
  }

  stop(): void {
    this.setScene(null);
  }

  private build(cause: BuildCause): void {
    const scene = this.current;
    if (scene === null) return;
    this.cancelSoon();
    this.builtAt = this.ports.now();
    let sent = false;
    const out = this.outbox.out(scene.id, () => this.current === scene);
    const counted: FeedOut = {
      ...out,
      send: (body, key) => (out.send(body, key) ? (sent = true) : false),
      sequenced: (of, content) => (out.sequenced(of, content) ? (sent = true) : false),
    };
    void this.rules.build(scene, counted, cause);
    if (sent) this.sentAt = this.builtAt;
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) this.ports.clearTimer(this.timer);
    this.timer = undefined;
  }

  private cancelSoon(): void {
    if (this.soonTimer !== undefined) this.ports.clearTimer(this.soonTimer);
    this.soonTimer = undefined;
  }
}
