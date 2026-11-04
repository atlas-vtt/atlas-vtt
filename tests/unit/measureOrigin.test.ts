import { describe, expect, it } from 'vitest';
import {
  NO_MEASURE_ORIGIN,
  measureOriginOf,
  measureShownToPlayers,
  tokenFootprints,
  type TokenFootprint,
} from '../../src/app/vision/measureOrigin';
import { computeTokenPixelSize } from '../../src/app/pixi/token-renderer/tokenSizing';
import type { TokenEntity } from '../../src/app/types';

const token = (id: string, x: number, y: number, overrides: Partial<TokenEntity> = {}): TokenEntity =>
  ({ id, kind: 'token', imagePath: '', x, y, size: 1, ...overrides }) as TokenEntity;
const sizeless = (id: string): TokenEntity => ({ id, kind: 'token', imagePath: '', x: 0, y: 0 });
const record = (...tokens: TokenEntity[]): Record<string, TokenEntity> => Object.fromEntries(tokens.map((t) => [t.id, t]));
const all = (): boolean => true;
const only = (...ids: string[]) => (id: string): boolean => ids.includes(id);
/** Radius of a size-1 token on a 70 px grid. */
const R = computeTokenPixelSize(70, 1) / 2;

describe('tokenFootprints', () => {
  it('gives every token, hidden ones too, a circle as wide as its sprite', () => {
    const tokens = record(token('a', 100, 100), token('b', 300, 100, { size: 2, isHidden: true }));
    expect(tokenFootprints(tokens, {}, 70, 1)).toEqual([
      { id: 'a', x: 100, y: 100, radius: R },
      { id: 'b', x: 300, y: 100, radius: computeTokenPixelSize(70, 2) / 2 },
    ]);
  });

  it('reads a missing or zero size as one cell', () => {
    const tokens = record(token('a', 0, 0, { size: 0 }), sizeless('b'));
    expect(tokenFootprints(tokens, {}, 70, 1).map((f) => f.radius)).toEqual([R, R]);
  });

  it('grows the circle with a ring larger than the token, never shrinks it with a smaller one', () => {
    const tokens = record(token('a', 0, 0));
    expect(tokenFootprints(tokens, {}, 70, 1.5)[0]?.radius).toBe(R * 1.5);
    expect(tokenFootprints(tokens, {}, 70, 0.8)[0]?.radius).toBe(R);
  });

  it('takes the displayed centre, and the stored one where it differs', () => {
    const tokens = record(token('a', 100, 100), token('b', 200, 100), token('c', 300, 100));
    const displayed = { a: { x: 140, y: 100 }, b: { x: 200, y: 100 }, c: null };
    expect(tokenFootprints(tokens, displayed, 70, 1)).toEqual([
      { id: 'a', x: 140, y: 100, radius: R },
      { id: 'a', x: 100, y: 100, radius: R },
      { id: 'b', x: 200, y: 100, radius: R },
      { id: 'c', x: 300, y: 100, radius: R },
    ]);
  });

  it('gives a position that is no finite number no footprint', () => {
    const tokens = record(token('a', Number.NaN, 0), token('b', 0, 0), token('c', Infinity, 0));
    const displayed = { b: { x: Number.NaN, y: 0 }, c: { x: 5, y: 5 } };
    expect(tokenFootprints(tokens, displayed, 70, 1)).toEqual([
      { id: 'b', x: 0, y: 0, radius: R },
      { id: 'c', x: 5, y: 5, radius: R },
    ]);
  });
});

describe('measureOriginOf', () => {
  const footprints: TokenFootprint[] = [
    { id: 'a', x: 100, y: 100, radius: 30 },
    { id: 'b', x: 140, y: 100, radius: 30 },
    { id: 'c', x: 400, y: 400, radius: 30 },
  ];

  it('records every token whose footprint covers the start, each once', () => {
    expect(measureOriginOf([{ x: 120, y: 100 }], footprints, all)).toEqual({ tokenIds: ['a', 'b'], unseenAtStart: false });
    const twice: TokenFootprint[] = [...footprints, { id: 'a', x: 110, y: 100, radius: 30 }];
    expect(measureOriginOf([{ x: 120, y: 100 }], twice, all).tokenIds).toEqual(['a', 'b']);
  });

  it('counts the footprint\'s edge as covered and nothing beyond it', () => {
    expect(measureOriginOf([{ x: 400, y: 430 }], footprints, all).tokenIds).toEqual(['c']);
    expect(measureOriginOf([{ x: 400, y: 430.001 }], footprints, all)).toBe(NO_MEASURE_ORIGIN);
  });

  it('records a token under the pressed point or under the drawn (snapped) start', () => {
    const pressed = { x: 75, y: 100 };
    const snapped = { x: 165, y: 100 };
    expect(measureOriginOf([pressed, snapped], footprints, all).tokenIds).toEqual(['a', 'b']);
    expect(measureOriginOf([pressed], footprints, all).tokenIds).toEqual(['a']);
    expect(measureOriginOf([snapped], footprints, all).tokenIds).toEqual(['b']);
  });

  it('notes whether any token under the start was not seen then', () => {
    expect(measureOriginOf([{ x: 120, y: 100 }], footprints, only('a')).unseenAtStart).toBe(true);
    expect(measureOriginOf([{ x: 120, y: 100 }], footprints, only('a', 'b')).unseenAtStart).toBe(false);
  });

  it('records nothing for a start on empty floor, or a point that is no finite number', () => {
    expect(measureOriginOf([{ x: 700, y: 700 }], footprints, () => false)).toBe(NO_MEASURE_ORIGIN);
    expect(measureOriginOf([{ x: Number.NaN, y: 100 }], footprints, all)).toBe(NO_MEASURE_ORIGIN);
  });
});

describe('measureShownToPlayers', () => {
  it('shows a measurement from empty floor whatever the players see', () => {
    expect(measureShownToPlayers(NO_MEASURE_ORIGIN, () => false)).toBe(true);
  });

  it('shows one from seen tokens while they stay seen, wherever they stand', () => {
    const origin = { tokenIds: ['a', 'b'], unseenAtStart: false };
    expect(measureShownToPlayers(origin, all)).toBe(true);
    expect(measureShownToPlayers(origin, only('a'))).toBe(false);
    expect(measureShownToPlayers(origin, only('a', 'b'))).toBe(true);
  });

  it('leaves out one started on a token the players did not see, for good', () => {
    expect(measureShownToPlayers({ tokenIds: ['a'], unseenAtStart: true }, all)).toBe(false);
  });

  it('leaves out one whose token is gone (a deleted token is not seen)', () => {
    const tokens: Record<string, { isHidden?: boolean }> = { a: {} };
    const seen = (id: string): boolean => !!tokens[id] && !tokens[id]?.isHidden;
    const origin = measureOriginOf([{ x: 0, y: 0 }], [{ id: 'a', x: 0, y: 0, radius: 10 }], seen);
    expect(measureShownToPlayers(origin, seen)).toBe(true);
    delete tokens.a;
    expect(measureShownToPlayers(origin, seen)).toBe(false);
  });

  it('follows the players\' sight of a seen origin that walked off the start: out of sight, then back', () => {
    let seenNow = true;
    const origin = measureOriginOf([{ x: 0, y: 0 }], [{ id: 'a', x: 0, y: 0, radius: 10 }], () => seenNow);
    // The token walks away from the start while seen: positions do not enter the rule.
    expect(measureShownToPlayers(origin, () => seenNow)).toBe(true);
    seenNow = false;
    expect(measureShownToPlayers(origin, () => seenNow)).toBe(false);
    seenNow = true;
    expect(measureShownToPlayers(origin, () => seenNow)).toBe(true);
  });
});
