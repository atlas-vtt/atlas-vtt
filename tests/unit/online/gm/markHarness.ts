import type { CursorSource, LaserSource, Press, TrailBatch } from '../../../../src/app/online/marks/index.ts';
import type { GmMessage, LaserState, MarkPoint, MarksMessage, SharedCursor } from '../../../../src/app/online/protocol/index.ts';
import type { Measurements } from '../../../../src/app/pixi/MeasureRenderer';
import type { TokenFootprint } from '../../../../src/app/vision/measureOrigin';
import { MarkShare, type GmMarkSource, type PlayerMarks } from '../../../../src/app/online/gm/MarkShare.ts';
import type { MapSize } from '../../../../src/app/online/gm/moveCheck.ts';

/** A laser whose state a test sets. */
export class FakeLaser implements LaserSource {
  at: LaserState['at'] = null;
  on = false;
  pts: number[] = [];
  /** The time the points of the next take cover; none while unset. */
  span: number | undefined;
  press: Press | null = null;
  private readonly listeners = new Set<() => void>();

  state(): Pick<LaserState, 'at' | 'on'> {
    return { at: this.at, on: this.on };
  }

  takeTrail(max: number): TrailBatch {
    const pts = this.pts.slice(-max);
    const { span } = this;
    this.pts = [];
    this.span = undefined;
    return span === undefined ? { pts } : { pts, span };
  }

  lastPress(): Press | null {
    return this.press;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A press of the primary button at a world point. */
  pressAt(x: number, y: number): void {
    this.press = { serial: (this.press?.serial ?? 0) + 1, at: [x, y] };
    this.changed();
  }

  changed(): void {
    for (const listener of this.listeners) listener();
  }
}

/** The GM's cursor, moved by a test. */
export class FakeCursor implements CursorSource {
  place: MarkPoint | null = null;
  moved: number | null = null;
  pts: number[] = [];
  span: number | undefined;
  private readonly listeners = new Set<() => void>();

  at(): MarkPoint | null {
    return this.place;
  }

  movedAt(): number | null {
    return this.place === null ? null : this.moved;
  }

  take(max: number): TrailBatch {
    const pts = this.pts.slice(-max);
    const { span } = this;
    this.pts = [];
    this.span = undefined;
    return span === undefined ? { pts } : { pts, span };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Moves the pointer to a world point at `now`; null takes it off the map. */
  moveTo(place: MarkPoint | null, now: number): void {
    this.place = place;
    this.moved = now;
    if (place !== null) this.pts.push(...place);
    for (const listener of this.listeners) listener();
  }
}

export interface MarkHarness {
  readonly share: MarkShare;
  /** Every `marks` message sent, with whom it went to. */
  readonly sent: { readonly body: MarksMessage; readonly to: string | undefined }[];
  /** The live lane's key of each `marks` message that went through it, in order. */
  readonly live: string[];
  /** What the GM's overlay was last told to draw, and everything it was told, in order. */
  shown: PlayerMarks | null;
  readonly shows: PlayerMarks[];
  readonly laser: FakeLaser;
  readonly cursor: FakeCursor;
  /** Whether the GM lets everyone see each other's cursor. */
  cursorsOn: boolean;
  /** Every list of players' cursors the GM's overlay was told to draw, in order. */
  readonly cursorShows: (readonly SharedCursor[])[];
  /** Sets the GM's measurements as the measure renderer would, and lets the share read them. */
  measure(next: Measurements): Promise<void>;
  footprints: readonly TokenFootprint[];
  seen: (id: string) => boolean;
  now(): number;
  advance(ms: number): void;
  /** Called with each message as it is sent, before it is recorded. */
  onSend: ((body: MarksMessage) => void) | null;
}

/** A MarkShare over a fake clock, GM measurements and laser; the map is `map` large. */
export function markHarness(map: MapSize | null = { width: 2000, height: 2000 }): MarkHarness {
  let now = 0;
  let ids = 0;
  const timers = new Map<number, { readonly at: number; readonly run: () => void }>();
  let records: Measurements = { live: null, kept: [] };
  const listeners = new Set<(next: Measurements, previous: Measurements) => void>();
  const laser = new FakeLaser();
  const cursor = new FakeCursor();
  const names: Record<string, string> = { ['a'.repeat(20)]: 'Ana', ['b'.repeat(20)]: 'Ben' };
  const source: GmMarkSource = {
    measurements: {
      get: () => records,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    laser,
    cursor,
    laserLook: () => ({ color: '#ff0059', size: 16 }),
    footprints: () => harness.footprints,
    seen: () => harness.seen,
  };
  const harness: MarkHarness = {
    sent: [],
    live: [],
    shown: null,
    shows: [],
    laser,
    cursor,
    cursorsOn: false,
    cursorShows: [],
    footprints: [],
    seen: () => true,
    onSend: null,
    share: new MarkShare({
      send: (body: GmMessage, to?: string) => {
        if (body.t !== 'marks') return;
        harness.onSend?.(body);
        harness.sent.push({ body, to });
      },
      sendLive: (body: GmMessage, key: string) => {
        if (body.t !== 'marks') return;
        harness.onSend?.(body);
        harness.sent.push({ body, to: undefined });
        harness.live.push(key);
      },
      gmMarks: () => source,
      accent: () => '#123456',
      showPlayerMarks: (marks) => {
        harness.shown = marks;
        harness.shows.push(marks);
      },
      cursorsShown: () => harness.cursorsOn,
      nameOf: (player) => names[player] ?? null,
      showPlayerCursors: (cursors) => void harness.cursorShows.push(cursors),
      now: () => now,
      setTimer: (run, ms) => {
        ids += 1;
        timers.set(ids, { at: now + ms, run });
        return ids;
      },
      clearTimer: (timer) => void timers.delete(timer),
    }, () => map),
    measure: async (next) => {
      const previous = records;
      records = next;
      for (const listener of listeners) listener(next, previous);
      await Promise.resolve();
    },
    now: () => now,
    advance: (ms) => {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort(([, a], [, b]) => a.at - b.at)[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].run();
      }
      now = end;
    },
  };
  return harness;
}

/** The last `marks` message sent. */
export const lastMarks = (harness: MarkHarness): MarksMessage | undefined => harness.sent.at(-1)?.body;
