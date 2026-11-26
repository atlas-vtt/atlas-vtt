import { Container, type Ticker } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { bumpScale, bumpShare, TokenBump } from '../../src/app/pixi/token-renderer/TokenBump';

describe('a token bumping into a wall', () => {
  it('leans fully into the wall, springs back past its place a little and lands on it', () => {
    const samples = Array.from({ length: 341 }, (_, ms) => bumpShare(ms));
    expect(Math.max(...samples)).toBeCloseTo(1, 2);
    const overshoot = Math.min(...samples);
    expect(overshoot).toBeLessThan(-0.08);
    expect(overshoot).toBeGreaterThan(-0.25);
    expect(bumpShare(0)).toBe(0);
    expect(bumpShare(340)).toBe(0);
    expect(Math.abs(bumpShare(330))).toBeLessThan(0.01);
  });

  it('flattens against a wall it meets straight on, and keeps its shape at rest', () => {
    expect(bumpScale(0, 1, 0)).toEqual({ x: 1, y: 1 });
    const pressed = bumpScale(1, 1, 0);
    expect(pressed.x).toBeLessThan(1);
    expect(pressed.y).toBeGreaterThan(1);
    expect(bumpScale(-0.2, 0, 1)).toEqual({ x: 1, y: 1 });
  });

  it('moves only the drawing, towards the wall, and puts it back', () => {
    const group = new Container();
    group.position.set(100, 100);
    const listeners: ((ticker: Ticker) => void)[] = [];
    const ticker = { add: (fn: (ticker: Ticker) => void) => listeners.push(fn), remove: (fn: (ticker: Ticker) => void) => listeners.splice(listeners.indexOf(fn), 1) } as unknown as Ticker;
    const bumps = new TokenBump({ getTicker: () => ticker, getSprite: () => group, cell: () => 70, reducedMotion: () => false });
    bumps.bump('ogre', 1, 0);
    const tick = (deltaMS: number): void => [...listeners].forEach((fn) => fn({ deltaMS } as Ticker));
    tick(80);
    // The pivot moves against the lean, so the drawing moves towards the wall
    expect(group.pivot.x).toBeLessThan(-6);
    expect(group.position.x).toBe(100);
    for (let i = 0; i < 20; i += 1) tick(20);
    expect(group.pivot.x).toBe(0);
    expect(group.scale.x).toBe(1);
    expect(listeners).toHaveLength(0);
  });

  it('does not move under reduced motion', () => {
    const group = new Container();
    const bumps = new TokenBump({ getTicker: () => null, getSprite: () => group, cell: () => 70, reducedMotion: () => true });
    bumps.bump('ogre', 0, 1);
    expect(group.pivot.y).toBe(0);
  });
});
