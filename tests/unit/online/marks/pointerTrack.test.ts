import { describe, expect, it } from 'vitest';
import { PointerTrack, TRACK_MAX_DELAY_MS, type TrackPoint } from '../../../../src/app/online/marks/PointerTrack.ts';

const INTERVAL = 33;
/** A 120 Hz display: the pointer is sampled, and the track drawn, this often. */
const FRAME = 25 / 3;
/** The pointer's speed along x, in world pixels a millisecond. */
const SPEED = 1;

interface Batch {
  readonly points: TrackPoint[];
  readonly span: number;
  /** When the sender sent it, on the sender's clock. */
  readonly sent: number;
}

/** A pointer moving along x at `SPEED`, sampled every frame and sent `perBatch` samples at a time, each batch with the whole milliseconds it covers. */
function straightPath(batches: number, perBatch = 4): Batch[] {
  let covered = 0;
  return Array.from({ length: batches }, (_, index) => {
    const sent = (index + 1) * perBatch * FRAME;
    const span = Math.round(sent) - covered;
    covered += span;
    const points = Array.from({ length: perBatch }, (_unused, step) => ({ x: (sent - (perBatch - 1 - step) * FRAME) * SPEED, y: 0, trail: true }));
    return { points, span, sent };
  });
}

/** When each batch arrives: sent plus the network's delay for it, never before the one sent before it. */
function arrivals(path: readonly Batch[], delay: (index: number) => number): number[] {
  let last = 0;
  return path.map((batch, index) => {
    last = Math.max(last, batch.sent + delay(index));
    return last;
  });
}

interface Frame {
  readonly now: number;
  readonly x: number | null;
  readonly delay: number;
  /** The newest sample the track had been given when the frame was drawn. */
  readonly newest: number;
}

/** Feeds `path` as it arrives and draws a frame every `FRAME` ms until `until`. */
function play(track: PointerTrack, path: readonly Batch[], arrived: readonly number[], until: number, say: (batch: Batch) => number | undefined = (batch) => batch.span): Frame[] {
  const frames: Frame[] = [];
  let next = 0;
  let newest = Number.NEGATIVE_INFINITY;
  for (let now = 0; now <= until; now += FRAME) {
    for (; next < path.length && (arrived[next] ?? Infinity) <= now; next += 1) {
      const batch = path[next];
      if (batch === undefined) break;
      track.push(batch.points, say(batch), arrived[next] ?? now);
      newest = batch.points.at(-1)?.x ?? newest;
    }
    frames.push({ now, x: track.at(now)?.x ?? null, delay: track.delay, newest });
  }
  return frames;
}

const steps = (frames: readonly Frame[]): number[] => frames.slice(1).map((frame, index) => (frame.x ?? 0) - (frames[index]?.x ?? 0));
const drawn = (frames: readonly Frame[]): Frame[] => frames.filter((frame) => frame.x !== null);

/** Bunched, late and early messages, the same every 12: two arrive together after one that came late, one comes early. */
const UNEVEN = [20, 20, 62, 20, 20, 4, 20, 20, 45, 20, 20, 20];

describe('PointerTrack', () => {
  it('draws a straight path evenly, however its messages arrive', () => {
    const path = straightPath(180);
    const arrived = arrivals(path, (index) => UNEVEN[index % UNEVEN.length] ?? 20);
    const frames = drawn(play(new PointerTrack({ interval: INTERVAL }), path, arrived, 6000));
    expect(frames.length).toBeGreaterThan(600);
    for (const frame of frames) expect(frame.x).toBeLessThanOrEqual(frame.newest + 1e-6);

    const moving = frames.filter((frame) => frame.now < (path.at(-1)?.sent ?? 0));
    const all = steps(moving);
    const mean = all.reduce((sum, step) => sum + step, 0) / all.length;
    expect(Math.min(...all)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...all)).toBeLessThanOrEqual(2.5 * mean);

    // Once the delay covers the network's jitter, every frame moves the pointer by about a frame of the path.
    const settled = steps(moving.filter((frame) => frame.now > 1500));
    expect(Math.min(...settled)).toBeGreaterThan(0.5 * FRAME * SPEED);
    expect(Math.max(...settled)).toBeLessThan(1.5 * FRAME * SPEED);
  });

  it('keeps its delay between one interval and the ceiling, and lets it fall only slowly', () => {
    const path = straightPath(400);
    // A stall of 300 ms and some of 120 ms, between quiet seconds.
    const arrived = arrivals(path, (index) => (index === 60 ? 300 : index % 97 === 50 ? 120 : 15 + (index * 7) % 11));
    const frames = play(new PointerTrack({ interval: INTERVAL }), path, arrived, 16500);
    for (const frame of frames) {
      expect(frame.delay).toBeGreaterThanOrEqual(INTERVAL);
      expect(frame.delay).toBeLessThanOrEqual(TRACK_MAX_DELAY_MS);
    }
    const falls = frames.slice(1).map((frame, index) => (frames[index]?.delay ?? 0) - frame.delay);
    expect(Math.max(...falls)).toBeLessThanOrEqual(0.1 * FRAME + 1e-9);
    expect(Math.max(...frames.map((frame) => frame.delay))).toBeGreaterThan(INTERVAL + 60);
    // Long after the last message the jitter is forgotten.
    expect(frames.at(-1)?.delay).toBe(INTERVAL);
  });

  it('rests on the newest sample when nothing more arrives', () => {
    const track = new PointerTrack({ interval: INTERVAL });
    const path = straightPath(6);
    const frames = play(track, path, arrivals(path, () => 20), 1000);
    const last = path.at(-1)?.points.at(-1)?.x ?? 0;
    expect(frames.at(-1)?.x).toBe(last);
    expect(Math.max(...drawn(frames).map((frame) => frame.x ?? 0))).toBe(last);
    expect(track.busy(1000)).toBe(false);
    expect(track.at(5000)?.x).toBe(last);
  });

  it('does not sweep across a pause: the pointer rests, then goes to the next sample in a moment', () => {
    const track = new PointerTrack({ interval: INTERVAL });
    track.push([{ x: 0, y: 0 }], undefined, 0);
    track.push([{ x: 10, y: 0 }], 33, 33);
    const rested: number[] = [];
    for (let now = 200; now < 900; now += FRAME) rested.push(track.at(now)?.x ?? Number.NaN);
    expect(new Set(rested)).toEqual(new Set([10]));
    track.push([{ x: 500, y: 0 }], 867, 900);
    expect(track.at(900)?.x).toBe(10);
    const after: number[] = [];
    for (let now = 900; now <= 1000; now += FRAME) after.push(track.at(now)?.x ?? Number.NaN);
    expect(after.some((x) => x > 10 && x < 500)).toBe(true);
    expect(after.at(-1)).toBe(500);
    expect(after.filter((x) => x === 10).length).toBeLessThan(4);
  });

  it('keeps a bounded number of samples over a long feed', () => {
    const track = new PointerTrack({ interval: INTERVAL, keep: 800 });
    const unread = new PointerTrack({ interval: INTERVAL, keep: 800 });
    const path = straightPath(5000, 16);
    let most = 0;
    path.forEach((batch, index) => {
      const now = index * 5;
      track.push(batch.points, batch.span, now);
      unread.push(batch.points, batch.span, now);
      track.at(now);
      most = Math.max(most, track.size, unread.size, track.played(now).length);
    });
    expect(most).toBeLessThanOrEqual(512);
    expect(track.at(5000 * 5 + 1000)?.x).toBe(path.at(-1)?.points.at(-1)?.x);
  });

  it('plays a batch of one sample and a batch of sixteen', () => {
    for (const perBatch of [1, 16]) {
      const path = straightPath(40, perBatch);
      const frames = drawn(play(new PointerTrack({ interval: INTERVAL }), path, arrivals(path, () => 25), 40 * perBatch * FRAME + 600));
      const all = steps(frames);
      expect(Math.min(...all), `${perBatch} a batch`).toBeGreaterThanOrEqual(0);
      expect(frames.at(-1)?.x, `${perBatch} a batch`).toBe(path.at(-1)?.points.at(-1)?.x);
      expect(new Set(frames.map((frame) => frame.x)).size, `${perBatch} a batch`).toBeGreaterThan(20 * perBatch);
    }
  });

  it('moves between the messages of a sender that says no span', () => {
    const path = straightPath(60);
    const arrived = arrivals(path, (index) => 20 + (index % 3) * 6);
    const frames = drawn(play(new PointerTrack({ interval: INTERVAL }), path, arrived, 2600, () => undefined));
    for (const frame of frames) expect(frame.x).toBeLessThanOrEqual(frame.newest + 1e-6);
    expect(Math.min(...steps(frames))).toBeGreaterThanOrEqual(0);
    expect(frames.at(-1)?.x).toBe(path.at(-1)?.points.at(-1)?.x);
    // About four frames pass between two messages, and the pointer moves in most of them.
    expect(new Set(frames.map((frame) => frame.x)).size).toBeGreaterThan(150);
  });

  it('takes a span of 0, and numbers that are no span, without losing its place', () => {
    const track = new PointerTrack({ interval: INTERVAL });
    track.push([{ x: 0, y: 0 }], 0, 0);
    track.push([{ x: 10, y: 0 }, { x: 20, y: 0 }], 0, 30);
    track.push([{ x: 30, y: 0 }], Number.NaN, 60);
    track.push([{ x: 40, y: 0 }], -5, 90);
    track.push([], 33, 100);
    const seen: number[] = [];
    for (let now = 0; now < 600; now += FRAME) seen.push(track.at(now)?.x ?? -1);
    expect(seen.every((x) => Number.isFinite(x))).toBe(true);
    expect(seen.filter((x) => x >= 0).every((x, index, all) => index === 0 || x >= (all[index - 1] ?? 0))).toBe(true);
    expect(seen.at(-1)).toBe(40);
    expect(track.delay).toBeGreaterThanOrEqual(INTERVAL);
    expect(track.delay).toBeLessThanOrEqual(TRACK_MAX_DELAY_MS);
  });

  it('lets a trail grow behind the pointer, each point at the moment the pointer passed it', () => {
    const track = new PointerTrack({ interval: INTERVAL, keep: 800 });
    const path = straightPath(60);
    const arrived = arrivals(path, (index) => UNEVEN[index % UNEVEN.length] ?? 20);
    let next = 0;
    let checked = 0;
    let settled: number[] = [];
    for (let now = 0; now < 2400; now += FRAME) {
      for (; next < path.length && (arrived[next] ?? Infinity) <= now; next += 1) track.push(path[next]?.points ?? [], path[next]?.span, arrived[next] ?? now);
      const pointer = track.at(now);
      const played = track.played(now);
      if (pointer === null) {
        expect(played).toEqual([]);
        continue;
      }
      for (const point of played) {
        expect(point.x).toBeLessThanOrEqual(pointer.x + 1e-6);
        expect(point.at).toBeLessThanOrEqual(now);
        expect(now - point.at).toBeLessThan(800 + FRAME);
        checked += 1;
      }
      const moments = played.map((point) => point.at);
      expect(moments).toEqual([...moments].sort((a, b) => a - b));
      if (now < 1700) settled = moments.slice(-20);
    }
    expect(checked).toBeGreaterThan(1000);
    // Once the delay has settled, the points are passed a frame apart, as the sender drew them.
    expect(settled).toHaveLength(20);
    for (let index = 1; index < settled.length; index += 1) expect((settled[index] ?? 0) - (settled[index - 1] ?? 0)).toBeCloseTo(FRAME, 0);
  });

  it('shows no pointer before its first sample is due, nor after it left, and starts apart when it comes back', () => {
    const track = new PointerTrack({ interval: INTERVAL });
    expect(track.at(0)).toBeNull();
    track.push([{ x: 0, y: 0 }, { x: 10, y: 0 }], 33, 100);
    expect(track.at(100)).toBeNull();
    expect(track.at(100 + INTERVAL)?.x).toBe(10);
    track.end();
    expect(track.at(200)).toBeNull();
    track.push([{ x: 900, y: 0 }], 33, 220);
    const seen = new Set<number | null>();
    for (let now = 220; now < 400; now += FRAME) seen.add(track.at(now)?.x ?? null);
    expect(seen).toEqual(new Set([null, 900]));
  });
});
