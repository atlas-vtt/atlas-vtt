/** A place a pointer was; `trail` says it drew on its way there. */
export interface TrackPoint {
  readonly x: number;
  readonly y: number;
  readonly trail?: boolean;
}

/** A sample the drawn pointer has passed, and the moment it passed it (the clock `push` and `at` run on). */
export interface PlayedPoint {
  readonly x: number;
  readonly y: number;
  readonly trail: boolean;
  readonly at: number;
}

/** Where the pointer is drawn; `trail` says it draws on its way, or drew where it rests. */
export interface TrackPosition {
  readonly x: number;
  readonly y: number;
  readonly trail: boolean;
}

export interface PointerTrackOptions {
  /** The sender's nominal send interval in ms: the least delay. */
  readonly interval: number;
  /** How long a passed sample is kept for `played`, in ms. */
  readonly keep?: number;
}

/** The longest a pointer is drawn behind what arrived, in ms. */
export const TRACK_MAX_DELAY_MS = 250;
/** No message for longer than this, or than `PACE_INTERVALS` send intervals, is a rest: the next one starts a new stretch. */
export const TRACK_REST_MS = 250;
/** The longest span a message is taken to cover, in ms. */
const MAX_SPAN_MS = 1000;
/** How long a message's lateness counts towards the delay. */
const JITTER_WINDOW_MS = 2000;
const MAX_ARRIVALS = 128;
const MAX_SAMPLES = 512;
/** The delay falls by this share of the time that passes, once the lateness it covered is forgotten. */
const SHRINK = 0.1;
/** A pointer behind its moment closes the distance in about this long. */
const CATCH_UP_MS = 250;
/** The drawn pointer runs at most this much faster than the sender's, and at most this much slower. */
const FASTEST = 1;
const SLOWEST = 0.5;
/** A sender up to this many times slower than nominal is keeping its own pace; a longer gap is a pause. */
const PACE_INTERVALS = 3;

interface Sample {
  readonly x: number;
  readonly y: number;
  readonly trail: boolean;
  /** Its moment on the sender's timeline. */
  readonly t: number;
  /** Starts a path apart from the sample before it. */
  readonly start: boolean;
  /** When the drawn pointer passed it; NaN until then. */
  at: number;
}

interface Arrival {
  readonly at: number;
  /** The clock less the timeline's newest moment, as the message arrived. */
  readonly lead: number;
  readonly late: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** The span a sender said, or null when it said none. */
function saidSpan(span: number | undefined): number | null {
  return typeof span === 'number' && Number.isFinite(span) && span >= 0 ? Math.min(span, MAX_SPAN_MS) : null;
}

/**
 * The playout buffer of one remote pointer. Messages bring samples in bursts and at uneven times;
 * the track puts them on the sender's timeline (each message's span after the one before) and draws
 * the pointer at a moment a little in the past, between the two samples around it, so it moves on
 * every frame as it moved for its sender. The delay is one send interval plus how much later than
 * the quickest recent message the latest ones came: it rises with a late message, which the pointer
 * was already waiting for, and falls slowly. The pointer is never drawn ahead of the newest sample.
 */
export class PointerTrack {
  private readonly interval: number;
  private readonly keep: number;
  /** A gap longer than this between two messages is a rest. */
  private readonly rest: number;
  private readonly samples: Sample[] = [];
  /** How many samples the drawn pointer has passed. */
  private passed = 0;
  private arrivals: Arrival[] = [];
  private clock = Number.NEGATIVE_INFINITY;
  private arrived = Number.NEGATIVE_INFINITY;
  /** The timeline's moment the pointer is drawn at, and its newest. */
  private playhead = Number.NEGATIVE_INFINITY;
  private head = 0;
  /** The least lead of the recent messages: what the clock is ahead of the timeline for a message that is not late. */
  private lead = 0;
  private wait: number;
  private ended = false;

  constructor({ interval, keep = 0 }: PointerTrackOptions) {
    this.interval = interval;
    this.keep = keep;
    // A cursor relayed by the GM can wait for the GM's next message as well: two intervals between messages are no rest.
    this.rest = Math.max(TRACK_REST_MS, PACE_INTERVALS * interval);
    this.wait = interval;
  }

  /** How far behind the messages the pointer is drawn, in ms. */
  get delay(): number {
    return this.wait;
  }

  /** How many samples are held. */
  get size(): number {
    return this.samples.length;
  }

  /**
   * The samples of one message, oldest first, arriving at `now`. `spanMs` is the time from the newest
   * sample of the sender's last message to the newest of this one; without it the message is taken as
   * it arrives.
   */
  push(points: readonly TrackPoint[], spanMs: number | undefined, now: number): void {
    if (points.length === 0) return;
    this.advance(now);
    const last = this.samples.at(-1);
    const floor = last?.t ?? Number.NEGATIVE_INFINITY;
    const apart = last === undefined || this.ended;
    const fresh = apart || now - this.arrived > this.rest;
    const span = saidSpan(spanMs);
    const live = Math.max(floor, now - this.lead);
    const head = fresh || span === null ? live : this.head + span;
    const covers = fresh ? Math.min(span ?? this.interval, this.interval) : head - this.head;
    const count = points.length;
    const moment = (index: number): number => Math.max(floor, head - (covers * (count - 1 - index)) / count);
    // After a rest the pointer leaves where it rested one interval before the first new sample.
    const from = fresh && !apart ? Math.max(floor, moment(0) - this.interval) : moment(0);
    if (fresh && !apart) this.samples.push({ x: last.x, y: last.y, trail: false, t: from, start: false, at: Number.NaN });
    points.forEach(({ x, y, trail }, index) => this.samples.push({ x, y, trail: trail === true, t: moment(index), start: apart && index === 0, at: Number.NaN }));
    this.note(now, now - head, fresh ? 0 : covers - this.interval);
    // The rest itself is not played: the pointer waits for the stretch where it begins.
    if (fresh) this.playhead = Math.max(this.playhead, Math.min(now - this.lead - this.wait, from));
    this.head = head;
    this.arrived = now;
    this.ended = false;
    this.forget(now);
  }

  /** The pointer left: what was not drawn yet still is, and what comes next starts apart from it. */
  end(): void {
    this.ended = true;
  }

  /** Where the pointer is drawn at `now`; null before its first sample is due and once it left. */
  at(now: number): TrackPosition | null {
    this.advance(now);
    const a = this.samples[this.passed - 1];
    const b = this.samples[this.passed];
    if (a === undefined || b?.start === true) return null;
    if (b === undefined) return this.ended ? null : { x: a.x, y: a.y, trail: a.trail };
    const length = b.t - a.t;
    const share = length > 0 ? clamp((this.playhead - a.t) / length, 0, 1) : 1;
    return { x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share, trail: b.trail };
  }

  /** The samples the drawn pointer has passed, oldest first, as long as they are kept. */
  played(now: number): readonly PlayedPoint[] {
    this.advance(now);
    return this.samples.slice(0, this.passed);
  }

  /** Whether samples are still to be drawn. */
  busy(now: number): boolean {
    this.advance(now);
    return this.passed < this.samples.length;
  }

  /** Counts a message's lateness: behind the quickest recent one, and a sender's own slower pace. */
  private note(now: number, lead: number, slower: number): void {
    const least = this.arrivals.reduce((min, arrival) => Math.min(min, arrival.lead), lead);
    const pace = slower > 0 && slower <= (PACE_INTERVALS - 1) * this.interval ? slower : 0;
    this.arrivals.push({ at: now, lead, late: lead - least + pace });
    if (this.arrivals.length > MAX_ARRIVALS) this.arrivals.shift();
    this.lead = least;
    this.wait = Math.max(this.wait, this.target());
  }

  /** One interval plus the most any recent message was late. */
  private target(): number {
    const late = this.arrivals.reduce((max, arrival) => Math.max(max, arrival.late), 0);
    return clamp(this.interval + late, this.interval, TRACK_MAX_DELAY_MS);
  }

  private advance(now: number): void {
    if (!(now > this.clock)) return;
    const before = this.clock;
    const passes = Number.isFinite(before) ? now - before : 0;
    this.clock = now;
    const oldest = this.arrivals[0];
    if (oldest !== undefined && now - oldest.at > JITTER_WINDOW_MS) {
      this.arrivals = this.arrivals.filter((arrival) => now - arrival.at <= JITTER_WINDOW_MS);
      if (this.arrivals.length > 0) this.lead = this.arrivals.reduce((min, arrival) => Math.min(min, arrival.lead), Number.POSITIVE_INFINITY);
    }
    this.wait = Math.max(this.target(), this.wait - SHRINK * passes);
    if (!Number.isFinite(this.playhead)) return;
    const due = now - this.lead - this.wait;
    const behind = due - this.playhead;
    const run = this.playhead + passes * (1 + clamp(behind / CATCH_UP_MS, -SLOWEST, FASTEST));
    const followed = behind >= 0 ? Math.min(run, due) : Math.max(run, due);
    const from = this.playhead;
    this.playhead = Math.max(from, Math.min(this.head, Math.max(followed, now - this.lead - TRACK_MAX_DELAY_MS)));
    const moved = this.playhead - from;
    for (let sample = this.samples[this.passed]; sample !== undefined && sample.t <= this.playhead; sample = this.samples[this.passed]) {
      sample.at = moved > 0 ? before + clamp((sample.t - from) / moved, 0, 1) * passes : now;
      this.passed += 1;
    }
    this.forget(now);
  }

  /** Drops passed samples older than `keep` but the one the pointer left last, and the oldest of too many. */
  private forget(now: number): void {
    let drop = Math.max(0, this.samples.length - MAX_SAMPLES);
    while (drop < this.passed - 1 && now - (this.samples[drop]?.at ?? now) >= this.keep) drop += 1;
    if (drop === 0) return;
    this.samples.splice(0, drop);
    this.passed = Math.max(0, this.passed - drop);
  }
}
