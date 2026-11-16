import { describe, expect, it } from 'vitest';
import type { Container, Ticker } from 'pixi.js';
import { ShownPlaces } from '../../src/app/lighting/shownPlaces';
import { PointerTrack } from '../../src/app/online/marks/PointerTrack';
import { TokenGlide, glideStep, placedAtOnce } from '../../src/app/pixi/token-renderer/TokenGlide';

type Step = (ticker: Pick<Ticker, 'deltaMS'>) => void;

function harness(reduced = false, clearWay = true): { glide: TokenGlide; shown: ShownPlaces; sprite: { position: { x: number; y: number; set(x: number, y: number): void } }; moves: number[]; steps: Set<Step>; frame(ms: number): void } {
  const steps = new Set<Step>();
  const ticker = { add: (step: Step) => steps.add(step), remove: (step: Step) => steps.delete(step) } as unknown as Ticker;
  const position = { x: 0, y: 0, set(x: number, y: number): void { this.x = x; this.y = y; } };
  const sprite = { position };
  const moves: number[] = [];
  const shown = new ShownPlaces();
  const glide = new TokenGlide({
    shown,
    clearWay: () => clearWay,
    getTicker: () => ticker,
    getSprite: () => sprite as unknown as Container,
    onMove: (_id, x) => moves.push(x),
    reducedMotion: () => reduced,
  });
  return { glide, shown, sprite, moves, steps, frame: (ms) => [...steps].forEach((step) => step({ deltaMS: ms })) };
}

describe('TokenGlide', () => {
  it('covers the same share of the way left whatever the frame length', () => {
    const twoFrames = glideStep(glideStep({ x: 0, y: 0 }, { x: 100, y: 0 }, 8), { x: 100, y: 0 }, 8);
    expect(twoFrames.x).toBeCloseTo(glideStep({ x: 0, y: 0 }, { x: 100, y: 0 }, 16).x, 9);
  });

  it('moves a token towards its place frame by frame, never past it, and lets the ticker go on arrival', () => {
    const h = harness();
    h.glide.to('hero', 70, 0);
    expect(h.sprite.position.x).toBe(0);
    h.frame(16);
    expect(h.sprite.position.x).toBeGreaterThan(0);
    expect(h.sprite.position.x).toBeLessThan(70);
    for (let i = 0; i < 60; i += 1) h.frame(16);
    expect(h.sprite.position.x).toBe(70);
    expect(h.moves.at(-1)).toBe(70);
    expect(h.moves).toEqual([...h.moves].sort((a, b) => a - b));
    expect(h.steps.size).toBe(0);
  });

  it('bends towards a place given mid-way and stops where a drag takes over', () => {
    const h = harness();
    h.glide.to('hero', 70, 0);
    h.frame(16);
    h.glide.to('hero', 0, 0);
    const turned = h.sprite.position.x;
    h.frame(16);
    expect(h.sprite.position.x).toBeLessThan(turned);
    h.glide.cancel('hero');
    expect(h.steps.size).toBe(0);
  });

  it('tells sight and light where a gliding token is drawn, and nothing once it has arrived', () => {
    const h = harness();
    h.glide.to('hero', 70, 0);
    expect(new Map(h.shown.entries()).get('hero')).toEqual({ x: 0, y: 0 });
    h.frame(16);
    expect(new Map(h.shown.entries()).get('hero')?.x).toBe(h.sprite.position.x);
    for (let i = 0; i < 60; i += 1) h.frame(16);
    expect(h.shown.size).toBe(0);
  });

  it('forgets where a token is drawn once something else moves it', () => {
    const h = harness();
    h.glide.to('hero', 70, 0);
    h.frame(16);
    h.glide.cancel('hero');
    expect(h.shown.size).toBe(0);
  });

  it('puts a token whose way it may not be drawn on in its place at once', () => {
    const h = harness(false, false);
    h.glide.to('hero', 70, 0);
    expect(h.sprite.position.x).toBe(70);
    expect(h.steps.size).toBe(0);
    expect(h.shown.size).toBe(0);
  });

  it('puts the token in its place at once under reduced motion', () => {
    const h = harness(true);
    h.glide.to('hero', 70, 0);
    expect(h.sprite.position.x).toBe(70);
    expect(h.steps.size).toBe(0);
    expect(h.moves).toEqual([70]);
  });
});

describe('whether a move the store made is shown at once', () => {
  const glides = { held: false, pointerDrags: false, loading: false, mayGlide: true };

  it('glides an ordinary move', () => {
    expect(placedAtOnce(glides)).toBe(false);
  });

  it('places a token this view\'s own pointer drags: the drag draws it', () => {
    expect(placedAtOnce({ ...glides, held: true, pointerDrags: true })).toBe(true);
  });

  it('glides a token someone else holds: a player dragging it online sends places, and nothing here draws the way between them', () => {
    expect(placedAtOnce({ ...glides, held: true, pointerDrags: false })).toBe(false);
  });

  it('places everything while a map loads, and a move that may not be shown on its way', () => {
    expect(placedAtOnce({ ...glides, loading: true })).toBe(true);
    expect(placedAtOnce({ ...glides, mayGlide: false })).toBe(true);
    expect(placedAtOnce({ ...glides, held: true, pointerDrags: false, mayGlide: false })).toBe(true);
  });
});

describe('a token someone else holds', () => {
  const FRAME = 25 / 3;

  /** A glide whose held tokens are played out at the lag `lag` gives, on a clock the test moves. */
  function held(lag: () => number | null, holder: { by: 'pointer' | 'elsewhere' | null }): ReturnType<typeof harness> & { clock: { now: number }; tick(): void } {
    const steps = new Set<Step>();
    const ticker = { add: (step: Step) => steps.add(step), remove: (step: Step) => steps.delete(step) } as unknown as Ticker;
    const position = { x: 0, y: 0, set(x: number, y: number): void { this.x = x; this.y = y; } };
    const sprite = { position };
    const moves: number[] = [];
    const shown = new ShownPlaces();
    const clock = { now: 0 };
    const glide = new TokenGlide({
      shown,
      getTicker: () => ticker,
      getSprite: () => sprite as unknown as Container,
      onMove: (_id, x) => moves.push(x),
      reducedMotion: () => false,
      heldPlayout: () => ({ interval: 33, lag: () => lag() }),
      heldBy: () => holder.by,
      now: () => clock.now,
    });
    const frame = (ms: number): void => [...steps].forEach((step) => step({ deltaMS: ms }));
    return { glide, shown, sprite, moves, steps, frame, clock, tick: () => frame(FRAME) };
  }

  it('moves as one with the cursor of the player dragging it: both are drawn as far behind their messages', () => {
    // The player's cursor comes every 100 ms with its frames' places, their drag's places every 33 ms, both 20 ms of network away.
    const cursor = new PointerTrack({ interval: 100 });
    const holder = { by: 'elsewhere' as const };
    const h = held(() => cursor.lag(h.clock.now), holder);
    let cursorSent = 0;
    let dragSent = 0;
    let waiting: { x: number; y: number }[] = [];
    const apart: number[] = [];
    for (let now = 0; now <= 3000; now += FRAME) {
      h.clock.now = now;
      const hand = now - 20;
      if (hand >= 0) {
        waiting.push({ x: hand, y: 0 });
        if (hand - cursorSent >= 100) {
          cursor.push(waiting, Math.round(hand - cursorSent), now);
          cursorSent = hand;
          waiting = [];
        }
        if (hand - dragSent >= 33) {
          h.glide.follow('hero', hand, 0);
          dragSent = hand;
        }
      }
      h.tick();
      const drawn = cursor.at(now);
      if (now > 1000 && drawn !== null) apart.push(h.sprite.position.x - drawn.x);
    }
    expect(apart.length).toBeGreaterThan(200);
    expect(Math.max(...apart.map(Math.abs))).toBeLessThan(FRAME);
    expect(new Map(h.shown.entries()).get('hero')?.x).toBe(h.sprite.position.x);
  });

  it('never runs ahead of the cursor of a fast drag, through the drop and to its end', () => {
    // Two pixels a millisecond for a second, then the player lets go where the hand stopped; their cursor stays shown.
    const cursor = new PointerTrack({ interval: 100 });
    const holder: { by: 'pointer' | 'elsewhere' | null } = { by: 'elsewhere' };
    const h = held(() => (holder.by === 'elsewhere' ? cursor.lag(h.clock.now) : null), holder);
    const speed = 2;
    const stop = 1000;
    let cursorSent = 0;
    let dragSent = 0;
    let waiting: { x: number; y: number }[] = [];
    let dropped = false;
    const ahead: number[] = [];
    for (let now = 0; now <= 1600; now += FRAME) {
      h.clock.now = now;
      const hand = Math.min(now - 20, stop);
      if (hand >= 0 && (hand < stop || waiting.length > 0 || !dropped)) {
        if (hand < stop || waiting.at(-1)?.x !== hand * speed) waiting.push({ x: hand * speed, y: 0 });
        if (hand - cursorSent >= 100 || (hand === stop && waiting.length > 0)) {
          cursor.push(waiting, Math.round(hand - cursorSent), now);
          cursorSent = hand;
          waiting = [];
        }
        if (hand < stop && hand - dragSent >= 33) {
          h.glide.follow('hero', hand * speed, 0);
          dragSent = hand;
        }
        if (hand === stop && !dropped) {
          dropped = true;
          holder.by = null;
          h.glide.to('hero', stop * speed, 0);
        }
      }
      h.tick();
      const drawn = cursor.at(now);
      if (now > 300 && drawn !== null) ahead.push(h.sprite.position.x - drawn.x);
    }
    expect(h.sprite.position.x).toBe(stop * speed);
    expect(h.steps.size).toBe(0);
    expect(Math.max(...ahead)).toBeLessThan(speed);
  });

  it('plays out its way to where it was put down, then is read where the store has it', () => {
    const holder: { by: 'pointer' | 'elsewhere' | null } = { by: 'elsewhere' };
    const h = held(() => 120, holder);
    for (let now = 0; now <= 600; now += 33) {
      h.clock.now = now;
      h.glide.follow('hero', now, 0);
      h.tick();
    }
    expect(h.sprite.position.x).toBeLessThan(600 - 100);
    holder.by = null;
    h.glide.to('hero', 640, 0);
    expect(h.glide.headsTo('hero', 640, 0)).toBe(true);
    for (let now = 600; now <= 1200; now += FRAME) {
      h.clock.now = now;
      h.tick();
    }
    expect(h.sprite.position.x).toBe(640);
    expect(h.steps.size).toBe(0);
    expect(h.shown.size).toBe(0);
  });

  it('ends where its last place was once nobody holds it, and leaves it to this view\'s pointer once that takes it', () => {
    const holder: { by: 'pointer' | 'elsewhere' | null } = { by: 'elsewhere' };
    const h = held(() => 100, holder);
    h.glide.follow('hero', 50, 0);
    holder.by = null;
    for (let now = 0; now <= 400; now += FRAME) {
      h.clock.now = now;
      h.tick();
    }
    expect(h.sprite.position.x).toBe(50);
    expect(h.steps.size).toBe(0);

    holder.by = 'elsewhere';
    h.clock.now = 500;
    h.glide.follow('hero', 90, 0);
    holder.by = 'pointer';
    h.tick();
    expect(h.steps.size).toBe(0);
    expect(h.shown.size).toBe(0);
  });

  it('glides as any token without a held playout', () => {
    const h = harness();
    h.glide.follow('hero', 70, 0);
    h.frame(16);
    expect(h.sprite.position.x).toBeGreaterThan(0);
    expect(h.sprite.position.x).toBeLessThan(70);
  });
});
