import { describe, expect, it } from 'vitest';
import { LASER_PLAYBACK_DELAY_MS, LASER_STALE_MS, REMOTE_LASER_LIMITS, RemoteLasers } from '../../src/app/pixi/laser/remoteLasers';
import { LASER_FADE_TIME } from '../../src/app/tools/laserPointerSettings';

const ORANGE = '#ff9f2e';

describe('RemoteLasers', () => {
  it("C-laser-2: holds the newest point at full strength until the laser is let go, then fades like Atlas's trail", () => {
    const lasers = new RemoteLasers();
    lasers.receive('p1', ORANGE, [{ x: 0, y: 0 }, { x: 10, y: 0 }], false, 0, { dt: [0, 0] });
    const played = LASER_PLAYBACK_DELAY_MS;
    const [frame] = lasers.frame(played + LASER_FADE_TIME / 2);
    expect(frame).toMatchObject({ from: 'p1', color: ORANGE, head: { x: 10, y: 0 } });
    // Each point fades from its own time, not from when the message came.
    expect(frame!.trail.map((point) => point.life)).toEqual([0.5, 0.5, 1]);
    lasers.receive('p1', ORANGE, [], true, played + LASER_FADE_TIME / 2);
    expect(lasers.frame(played + LASER_FADE_TIME / 2)[0]!.head).toBeNull();
    expect(lasers.frame(played + LASER_FADE_TIME)).toEqual([]);
    expect(lasers.isActive).toBe(false);
  });

  it('plays a laser a fixed delay behind its messages', () => {
    const lasers = new RemoteLasers();
    lasers.receive('p1', ORANGE, [{ x: 4, y: 4 }], false, 1000, { dt: [0] });
    expect(lasers.frame(1000 + LASER_PLAYBACK_DELAY_MS - 1)).toEqual([]);
    expect(lasers.frame(1000 + LASER_PLAYBACK_DELAY_MS)[0]!.head).toEqual({ x: 4, y: 4 });
  });

  it('glides the head between two points by their time', () => {
    const lasers = new RemoteLasers();
    lasers.receive('p1', ORANGE, [{ x: 0, y: 0 }, { x: 100, y: 0 }], false, 0, { dt: [0, 50] });
    const base = LASER_PLAYBACK_DELAY_MS;
    expect(lasers.frame(base)[0]!.head).toEqual({ x: 0, y: 0 });
    expect(lasers.frame(base + 25)[0]!.head!.x).toBeCloseTo(50);
    expect(lasers.frame(base + 40)[0]!.head!.x).toBeCloseTo(80);
    expect(lasers.frame(base + 50)[0]!.head!.x).toBeCloseTo(100);
  });

  it('spreads the points of a message without times over the send interval', () => {
    const lasers = new RemoteLasers();
    lasers.receive('p1', ORANGE, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], false, 0);
    const heads = [0, 10, 20, 30].map((ms) => lasers.frame(LASER_PLAYBACK_DELAY_MS + ms)[0]!.head!.x);
    expect(heads[0]).toBeLessThan(heads[1]!);
    expect(heads[1]).toBeLessThan(heads[2]!);
    expect(heads[3]).toBe(20);
  });

  it('moves the head smoothly and forward whatever the arrival jitter of the batches', () => {
    // A hand moving at 1 unit a ms, sent as it would: a point every 11 ms, in bursts that arrive unevenly.
    const lasers = new RemoteLasers();
    const sent = (from: number, to: number): { points: Array<{ x: number; y: number }>; dt: number[] } => {
      const points = [];
      for (let t = from; t <= to; t += 11) points.push({ x: t, y: 0 });
      return { points, dt: points.map((_, index) => (index === 0 && from === 0 ? 0 : 11)) };
    };
    const arrivals: Array<[number, number, number]> = [[0, 0, 0], [33, 11, 33], [76, 44, 66], [99, 77, 99], [140, 110, 132], [165, 143, 165]];
    const heads: number[] = [];
    let next = 0;
    for (let now = 0; now <= 400; now += 4) {
      while (arrivals[next] && arrivals[next]![0] <= now) {
        const [, from, to] = arrivals[next]!;
        const batch = sent(from, to);
        lasers.receive('p1', ORANGE, batch.points, false, arrivals[next]![0], { dt: batch.dt });
        next += 1;
      }
      const head = lasers.frame(now)[0]?.head;
      if (head) heads.push(head.x);
    }
    expect(heads.length).toBeGreaterThan(30);
    for (let i = 1; i < heads.length; i++) expect(heads[i]!).toBeGreaterThanOrEqual(heads[i - 1]!);
    // No frame jumps more than a few frames' worth of motion: the bursts do not show.
    const steps = heads.slice(1).map((x, i) => x - heads[i]!);
    expect(Math.max(...steps)).toBeLessThanOrEqual(4 * 3);
  });

  it('moves a stroke back instead of stalling when a message comes later than the delay', () => {
    const lasers = new RemoteLasers();
    lasers.receive('p1', ORANGE, [{ x: 0, y: 0 }], false, 0, { dt: [0] });
    lasers.receive('p1', ORANGE, [{ x: 10, y: 0 }], false, 400, { dt: [33] });
    expect(lasers.frame(400 + LASER_PLAYBACK_DELAY_MS)[0]!.head).toEqual({ x: 10, y: 0 });
  });

  it("draws this page's own laser at once", () => {
    const lasers = new RemoteLasers();
    lasers.receive('self', ORANGE, [{ x: 3, y: 3 }], false, 500, { immediate: true });
    expect(lasers.frame(500)[0]!.head).toEqual({ x: 3, y: 3 });
  });

  it('starts a new stroke without a line from the last one', () => {
    const lasers = new RemoteLasers();
    lasers.receive('p1', ORANGE, [{ x: 0, y: 0 }], true, 0, { dt: [0] });
    lasers.frame(LASER_PLAYBACK_DELAY_MS + 1);
    lasers.receive('p1', ORANGE, [{ x: 500, y: 0 }], false, 300, { dt: [0] });
    expect(lasers.frame(300 + LASER_PLAYBACK_DELAY_MS)[0]!.trail.map((point) => point.x)).toEqual([500, 500]);
  });

  it('C-laser-2: lets a laser go that heard nothing for a second', () => {
    const lasers = new RemoteLasers();
    lasers.receive('p1', ORANGE, [{ x: 0, y: 0 }], false, 0);
    expect(lasers.frame(LASER_STALE_MS)[0]!.head).toEqual({ x: 0, y: 0 });
    expect(lasers.frame(LASER_STALE_MS + 1)).toEqual([]);
  });

  it('keeps a laser held still alive on empty batches', () => {
    const lasers = new RemoteLasers();
    lasers.receive('p1', ORANGE, [{ x: 0, y: 0 }], false, 0);
    lasers.receive('p1', ORANGE, [], false, 900);
    expect(lasers.frame(1500)[0]!.head).toEqual({ x: 0, y: 0 });
  });

  it('ignores a lift or a keepalive from a laser it never saw', () => {
    const lasers = new RemoteLasers();
    lasers.receive('p2', ORANGE, [], true, 0);
    lasers.receive('p3', ORANGE, [], false, 0);
    expect(lasers.isActive).toBe(false);
  });

  describe('limits', () => {
    it('counts only the newest points of a message, and bounds the trail', () => {
      const lasers = new RemoteLasers();
      const flood = Array.from({ length: 10_000 }, (_, index) => ({ x: index, y: 0 }));
      lasers.receive('p1', ORANGE, flood, false, 0, { dt: flood.map(() => 1) });
      const [frame] = lasers.frame(LASER_PLAYBACK_DELAY_MS + 100);
      expect(frame!.trail.length).toBeLessThanOrEqual(REMOTE_LASER_LIMITS.points + 1);
      expect(frame!.head).toEqual({ x: 9999, y: 0 });
    });

    it('caps a gap in time, so a far-off point cannot keep a laser alive', () => {
      const lasers = new RemoteLasers();
      lasers.receive('p1', ORANGE, [{ x: 0, y: 0 }, { x: 1, y: 0 }], true, 0, { dt: [0, 1e12] });
      const later = LASER_PLAYBACK_DELAY_MS + REMOTE_LASER_LIMITS.maxGapMs + LASER_FADE_TIME;
      expect(lasers.frame(later)).toEqual([]);
      expect(lasers.isActive).toBe(false);
    });

    it('shows no more lasers than the limit', () => {
      const lasers = new RemoteLasers();
      for (let index = 0; index < REMOTE_LASER_LIMITS.senders + 10; index++) lasers.receive(`p${index}`, ORANGE, [{ x: 0, y: 0 }], false, 0);
      expect(lasers.frame(LASER_PLAYBACK_DELAY_MS + 1)).toHaveLength(REMOTE_LASER_LIMITS.senders);
    });

    it('never queues points further ahead than the limit, however the gaps add up', () => {
      const lasers = new RemoteLasers();
      const points = Array.from({ length: REMOTE_LASER_LIMITS.points }, (_, index) => ({ x: index, y: 0 }));
      lasers.receive('p1', ORANGE, points, false, 0, { dt: points.map(() => REMOTE_LASER_LIMITS.maxGapMs) });
      const horizon = LASER_PLAYBACK_DELAY_MS + REMOTE_LASER_LIMITS.maxAheadMs;
      // Heard from nothing else, the laser is let go and has played all it kept, soon after the horizon.
      lasers.frame(horizon + LASER_STALE_MS);
      expect(lasers.frame(horizon + LASER_STALE_MS + LASER_FADE_TIME)).toEqual([]);
      expect(lasers.isActive).toBe(false);
    });
  });

});
