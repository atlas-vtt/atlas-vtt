/**
 * Other people's lasers as messages bring them: each a trail that fades like Atlas's own, its
 * newest point held at full strength until the laser is let go. A laser that hears nothing for
 * a second is let go, so a lost lift never leaves one hanging. Shared by the GM's view
 * (`RemoteLaserRenderer`) and code outside Obsidian (`@atlas-vtt/shared`).
 *
 * Messages arrive in bursts, unevenly. So a laser is played back, not drawn on arrival: its
 * points keep the spacing in time they were drawn with (the sender's `dt`, or an even spread
 * over one send interval without), the whole stroke runs `LASER_PLAYBACK_DELAY_MS` behind the
 * messages, and the head glides between points. A burst that is later than that delay moves the
 * stroke back a little instead of stalling it. Each trail point fades from its own time.
 */
import type { BeamPoint } from './laserBeamGeometry';
import { LaserTrail } from './laserTrail';

export const LASER_STALE_MS = 1000;
/** How far behind the messages a remote laser is drawn: enough to cover a late burst. */
export const LASER_PLAYBACK_DELAY_MS = 90;
/**
 * What one `receive` may bring in, so a flood of messages cannot cost the frame more than a few lasers' worth:
 * the newest `points` of a message count, a gap in time is at most `maxGapMs`, points are never queued further than
 * `maxAheadMs` past the playback time, and `senders` lasers at a time.
 */
export const REMOTE_LASER_LIMITS = { points: 64, maxGapMs: 2000, maxAheadMs: 3000, senders: 32 } as const;
/** Points waiting to be played; a laser further behind than this skips ahead. */
const MAX_PENDING = 256;
/** The time one message spans when the sender did not say. */
const DEFAULT_SPAN_MS = 1000 / 30;
/** The head glides to a point over at most this long, so a laser held still and then moved does not crawl. */
const MAX_GLIDE_MS = 100;

interface Point {
  x: number;
  y: number;
}

interface TimedPoint extends Point {
  /** When the point is reached, on the receiver's clock. */
  at: number;
}

export interface RemoteLaserFrame {
  from: string;
  color: string;
  /** Oldest to newest, the held point last at full strength. */
  trail: BeamPoint[];
  /** Where the laser is while it is held; null once let go. */
  head: Point | null;
}

/** `dt`: the milliseconds from each point to the one before it; `immediate`: the laser of this page, drawn as it is made. */
export interface LaserTiming {
  dt?: ReadonlyArray<number>;
  immediate?: boolean;
}

interface Entry {
  color: string;
  trail: LaserTrail;
  /** The sender let go; the laser is let go once its points have been played. */
  lifted: boolean;
  lastAt: number;
  /** The newest point played, where the head rests. */
  head: TimedPoint | null;
  pending: TimedPoint[];
  /** Added to the sender's time to give the receiver's; null before the first point of a stroke. */
  offset: number | null;
  /** The sender's time of the newest point queued. */
  sentAt: number;
}

/** The newest `REMOTE_LASER_LIMITS.points` points, with their gaps, which are whole, non-negative and at most `maxGapMs`. */
function limited(points: ReadonlyArray<Point>, timing: LaserTiming): { points: ReadonlyArray<Point>; timing: LaserTiming } {
  const skip = Math.max(0, points.length - REMOTE_LASER_LIMITS.points);
  const matching = timing.dt?.length === points.length;
  const dt = matching ? timing.dt!.slice(skip).map((gap) => (gap > 0 ? Math.min(REMOTE_LASER_LIMITS.maxGapMs, gap) : 0)) : undefined;
  return { points: skip > 0 ? points.slice(skip) : points, timing: { ...timing, ...(dt ? { dt } : {}) } };
}

export class RemoteLasers {
  private readonly entries = new Map<string, Entry>();

  get isActive(): boolean {
    return this.entries.size > 0;
  }

  receive(from: string, color: string, sent: ReadonlyArray<Point>, lifted: boolean, now: number, sentTiming: LaserTiming = {}): void {
    const { points, timing } = limited(sent, sentTiming);
    let entry = this.entries.get(from);
    if (!entry) {
      if (points.length === 0 || this.entries.size >= REMOTE_LASER_LIMITS.senders) return;
      entry = { color, trail: new LaserTrail(), lifted, lastAt: now, head: null, pending: [], offset: null, sentAt: 0 };
      this.entries.set(from, entry);
    }
    // A point after a lift starts a new stroke, on its own timeline and without a line from the last one.
    if (entry.lifted && points.length > 0) {
      entry.offset = null;
      if (entry.pending.length === 0) {
        entry.trail.clear();
        entry.head = null;
      }
    }
    this.enqueue(entry, points, now, timing);
    entry.color = color;
    entry.lifted = lifted;
    entry.lastAt = now;
  }

  /** What to draw now; lasers that faded out are forgotten. */
  frame(now: number): RemoteLaserFrame[] {
    const frames: RemoteLaserFrame[] = [];
    for (const [from, entry] of this.entries) {
      if (!entry.lifted && now - entry.lastAt > LASER_STALE_MS) entry.lifted = true;
      this.play(entry, now);
      entry.trail.prune(now);
      const done = entry.pending.length === 0;
      if (entry.lifted && done && entry.trail.length === 0) {
        this.entries.delete(from);
        continue;
      }
      const head = entry.lifted && done ? null : this.headAt(entry, now);
      const trail = entry.trail.beamPoints(now);
      if (head) trail.push({ x: head.x, y: head.y, life: 1 });
      if (trail.length === 0) continue;
      frames.push({ from, color: entry.color, trail, head });
    }
    return frames;
  }

  clear(): void {
    this.entries.clear();
  }

  /** Puts the points on the entry's timeline. */
  private enqueue(entry: Entry, points: ReadonlyArray<Point>, now: number, timing: LaserTiming): void {
    if (points.length === 0) return;
    if (timing.immediate) {
      for (const point of points) entry.pending.push({ x: point.x, y: point.y, at: now });
      entry.offset = null;
      return;
    }
    const fresh = entry.offset === null;
    const gaps = timing.dt && timing.dt.length === points.length
      ? timing.dt
      : points.map(() => DEFAULT_SPAN_MS / points.length);
    let sent = fresh ? 0 : entry.sentAt;
    const times = gaps.map((gap, index) => (sent += index === 0 && fresh ? 0 : Math.max(0, gap)));
    const first = times[0] ?? 0;
    const last = times[times.length - 1] ?? 0;
    // The first point of a stroke, or of a batch that is already late, is placed the delay ahead of now.
    if (entry.offset === null || last + entry.offset < now) entry.offset = now + LASER_PLAYBACK_DELAY_MS - first;
    const offset = entry.offset;
    entry.sentAt = last;
    let previous = entry.pending[entry.pending.length - 1]?.at ?? entry.head?.at ?? -Infinity;
    points.forEach((point, index) => {
      previous = Math.max(previous, (times[index] ?? 0) + offset);
      entry.pending.push({ x: point.x, y: point.y, at: previous });
    });
    // However the gaps add up, a laser never holds more than a few seconds of future, so a lost lift cannot leave one hanging.
    const horizon = now + LASER_PLAYBACK_DELAY_MS + REMOTE_LASER_LIMITS.maxAheadMs;
    while (entry.pending.length > 0 && entry.pending[entry.pending.length - 1]!.at > horizon) entry.pending.pop();
    if (entry.pending.length > MAX_PENDING) entry.pending.splice(0, entry.pending.length - MAX_PENDING);
  }

  /** Points whose time has come join the trail, which fades each from its own time. */
  private play(entry: Entry, now: number): void {
    while (entry.pending[0] && entry.pending[0].at <= now) {
      const point = entry.pending.shift()!;
      entry.trail.add(point.x, point.y, point.at);
      entry.head = point;
    }
  }

  /** The head between the point it left and the one it is heading for. */
  private headAt(entry: Entry, now: number): Point | null {
    const from = entry.head;
    const to = entry.pending[0];
    if (!from) return null;
    if (!to) return { x: from.x, y: from.y };
    const start = Math.max(from.at, to.at - MAX_GLIDE_MS);
    const span = to.at - start;
    const share = span > 0 ? Math.min(1, Math.max(0, (now - start) / span)) : 1;
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
  }
}
