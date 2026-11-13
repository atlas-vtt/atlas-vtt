import { describe, expect, it } from 'vitest';
import { auraBadgePoint } from '../auraArea';
import { rimSpots, tokenHolding } from '../handleSpots';
import type { AreaToken } from '../measureTokens';
import type { KeptMeasure } from '../measureTypes';

const GRID = { size: 70 };
const centre = (col: number, row: number): { x: number; y: number } => ({ x: 35 + col * 70, y: 35 + row * 70 });
const token = (id: string, col: number, row: number, more: Partial<AreaToken> = {}): AreaToken => ({ id, ...centre(col, row), ...more });
const tokensOf = (...tokens: AreaToken[]): Record<string, AreaToken> => Object.fromEntries(tokens.map((entry) => [entry.id, entry]));
const kept = (id: string, shape: KeptMeasure['shape'], from: { x: number; y: number }, more: Partial<KeptMeasure> = {}): KeptMeasure => (
  { id, kind: 'measure', shape, points: [from, { x: from.x + 210, y: from.y }], ...more }
);
const fromCentre = (point: { x: number; y: number }, at: { x: number; y: number }): number => Math.hypot(point.x - at.x, point.y - at.y);

describe('tokenHolding', () => {
  it('is the token whose space holds the point, the one on top where several do, and none on a rim or beside every token', () => {
    const tokens = [token('low', 1, 1), token('top', 1, 1, { layer: 2 }), token('big', 5, 5, { size: 2 })];
    expect(tokenHolding(centre(1, 1), tokens, GRID)?.id).toBe('top');
    expect(tokenHolding({ x: 105 + 20, y: 105 - 20 }, tokens, GRID)?.id).toBe('top');
    // A large token's space is as wide as its cells.
    expect(tokenHolding({ x: centre(5, 5).x + 100, y: centre(5, 5).y }, tokens, GRID)?.id).toBe('big');
    expect(tokenHolding({ x: centre(5, 5).x + 106, y: centre(5, 5).y }, tokens, GRID)).toBeNull();
    // The middle of a cell's edge lies on the rim of the token in the cell, and a cell's corner beyond it: neither is in its space.
    expect(tokenHolding({ x: 140, y: 105 }, tokens, GRID)).toBeNull();
    expect(tokenHolding({ x: 140, y: 140 }, tokens, GRID)).toBeNull();
    expect(tokenHolding(centre(3, 3), tokens, GRID)).toBeNull();
  });
});

describe('rimSpots', () => {
  it('puts the badge of a measurement that starts on a token on the token\'s rim, where an aura\'s stands, and none for one on no token', () => {
    const hero = token('hero', 1, 1);
    const spots = rimSpots([kept('ruler', 'ruler', centre(1, 1)), kept('free', 'cone', centre(6, 6)), kept('edge', 'cone', { x: 140, y: 105 })], tokensOf(hero), GRID);
    expect([...spots.keys()]).toEqual(['ruler']);
    expect(spots.get('ruler')).toEqual(auraBadgePoint(hero, GRID));
    expect(fromCentre(spots.get('ruler')!, hero)).toBeCloseTo(35, 9);
  });

  it('follows the token\'s size: the rim of a larger space lies farther out', () => {
    const ruler = [kept('ruler', 'ruler', centre(1, 1))];
    const small = rimSpots(ruler, tokensOf(token('hero', 1, 1)), GRID).get('ruler')!;
    const large = rimSpots(ruler, tokensOf(token('hero', 1, 1, { size: 2 })), GRID).get('ruler')!;
    expect(fromCentre(small, centre(1, 1))).toBeCloseTo(35, 9);
    expect(fromCentre(large, centre(1, 1))).toBeCloseTo(105, 9);
    // And the cells' size.
    expect(fromCentre(rimSpots(ruler, tokensOf(token('hero', 1, 1)), { size: 100 }).get('ruler')!, centre(1, 1))).toBeCloseTo(50, 9);
  });

  it('fans the badges of several measurements on one token out along its rim, an aura\'s among them, in the order they were kept', () => {
    const hero = token('hero', 1, 1);
    const measures = [
      kept('aura', 'circle', centre(1, 1), { follows: 'hero', aura: 10 }),
      kept('ruler', 'ruler', centre(1, 1)),
      kept('other', 'ruler', centre(4, 4)),
      kept('cone', 'cone', { x: 100, y: 110 }),
    ];
    const spots = rimSpots(measures, tokensOf(hero, token('goblin', 4, 4)), GRID);
    expect(spots.get('aura')).toEqual(auraBadgePoint(hero, GRID));
    expect(spots.get('ruler')).toEqual(auraBadgePoint(hero, GRID, 1));
    expect(spots.get('cone')).toEqual(auraBadgePoint(hero, GRID, 2));
    // Another token's first badge stands where a first one does.
    expect(spots.get('other')).toEqual(auraBadgePoint(centre(4, 4), GRID));
    const onHero = ['aura', 'ruler', 'cone'].map((id) => spots.get(id)!);
    for (const spot of onHero) expect(fromCentre(spot, hero)).toBeCloseTo(35, 9);
    // No two on one spot: each a badge's width from the next on a token of one cell.
    for (let i = 1; i < onHero.length; i++) expect(fromCentre(onHero[i]!, onHero[i - 1]!)).toBeGreaterThan(20);
    // Ten steps go around the rim before one comes to lie on the first.
    expect(fromCentre(auraBadgePoint(hero, GRID, 9), auraBadgePoint(hero, GRID))).toBeGreaterThan(20);
  });

  it('takes the token lying on top where a measurement starts on several, and an aura\'s own token whatever lies on it', () => {
    const tokens = tokensOf(token('low', 1, 1), token('top', 1, 1, { layer: 3, size: 2 }));
    const spots = rimSpots([kept('ruler', 'ruler', centre(1, 1)), kept('aura', 'circle', centre(1, 1), { follows: 'low', aura: 5 })], tokens, GRID);
    expect(fromCentre(spots.get('ruler')!, centre(1, 1))).toBeCloseTo(105, 9);
    expect(fromCentre(spots.get('aura')!, centre(1, 1))).toBeCloseTo(35, 9);
  });

  it('has none for an aura whose token is not on the map, and is worked out once for the same measurements, tokens and cell size', () => {
    const measures = [kept('aura', 'circle', centre(1, 1), { follows: 'gone', aura: 10 }), kept('ruler', 'ruler', centre(1, 1))];
    const tokens = tokensOf(token('hero', 1, 1));
    const spots = rimSpots(measures, tokens, GRID);
    expect([...spots.keys()]).toEqual(['ruler']);
    expect(rimSpots(measures, tokens, { size: 70 })).toBe(spots);
    expect(rimSpots(measures, { ...tokens }, GRID)).not.toBe(spots);
    expect(rimSpots(measures, tokens, { size: 80 })).not.toBe(spots);
    expect(rimSpots([], tokens, GRID).size).toBe(0);
  });
});
