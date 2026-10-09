import { describe, expect, it } from 'vitest';
import type { Container, Ticker } from 'pixi.js';
import { TokenGlide, glideStep } from '../../src/app/pixi/token-renderer/TokenGlide';

type Step = (ticker: Pick<Ticker, 'deltaMS'>) => void;

function harness(reduced = false): { glide: TokenGlide; sprite: { position: { x: number; y: number; set(x: number, y: number): void } }; moves: number[]; steps: Set<Step>; frame(ms: number): void } {
  const steps = new Set<Step>();
  const ticker = { add: (step: Step) => steps.add(step), remove: (step: Step) => steps.delete(step) } as unknown as Ticker;
  const position = { x: 0, y: 0, set(x: number, y: number): void { this.x = x; this.y = y; } };
  const sprite = { position };
  const moves: number[] = [];
  const glide = new TokenGlide({
    getTicker: () => ticker,
    getSprite: () => sprite as unknown as Container,
    onMove: (_id, x) => moves.push(x),
    reducedMotion: () => reduced,
  });
  return { glide, sprite, moves, steps, frame: (ms) => [...steps].forEach((step) => step({ deltaMS: ms })) };
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

  it('puts the token in its place at once under reduced motion', () => {
    const h = harness(true);
    h.glide.to('hero', 70, 0);
    expect(h.sprite.position.x).toBe(70);
    expect(h.steps.size).toBe(0);
    expect(h.moves).toEqual([70]);
  });
});
