import { describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { sceneFromFile, sceneToFile, tokenFromFile, tokenToFile } from '../../resources/resourceFileFormat';
import {
  countsHeight, heightChipText, heightField, MAX_TOKEN_HEIGHT, riseBetweenEnds, riseInCells, signedHeight, steppedHeight, tokenHeight,
} from '../tokenHeight';

const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'alternating', rangeBands: [], coneAngle: 90 };
const METRES: MeasurementSettings = { ...FEET, unitType: 'meters', unitDistance: 1.5, ruleDistance: 1.5 };
const BANDS: MeasurementSettings = { ...FEET, mode: 'abstract', rangeBands: [{ name: 'Close', maxSquares: 2 }] };

describe('tokenHeight', () => {
  it('reads a height in game units, above the floor and below it', () => {
    expect(tokenHeight({ elevation: 30 })).toBe(30);
    expect(tokenHeight({ elevation: -7.5 })).toBe(-7.5);
    expect(tokenHeight({})).toBe(0);
    expect(tokenHeight(null)).toBe(0);
  });

  it('reads what is no height as the floor, and no farther off it than a token is ever put', () => {
    for (const [index, elevation] of [NaN, Infinity, -Infinity, '30', null, undefined, {}, [30], true].entries()) expect(tokenHeight({ elevation }), `value ${index}`).toBe(0);
    expect(tokenHeight({ elevation: 1e12 })).toBe(MAX_TOKEN_HEIGHT);
    expect(tokenHeight({ elevation: -1e12 })).toBe(-MAX_TOKEN_HEIGHT);
  });
});

describe('a step of the height', () => {
  it('goes up and down by one cell\'s distance, through the floor', () => {
    expect(steppedHeight(0, 1, 5)).toBe(5);
    expect(steppedHeight(30, -1, 5)).toBe(25);
    expect(steppedHeight(5, -1, 5)).toBe(0);
    expect(steppedHeight(0, -1, 5)).toBe(-5);
    expect(steppedHeight(7, 1, 5)).toBe(12);
  });

  it('adds up without rounding errors, and stops at the farthest a token is put', () => {
    let height = 0;
    for (let i = 0; i < 3; i++) height = steppedHeight(height, 1, 1.5);
    expect(height).toBe(4.5);
    expect(steppedHeight(0.1, 1, 0.2)).toBe(0.3);
    expect(steppedHeight(MAX_TOKEN_HEIGHT - 2, 1, 5)).toBe(MAX_TOKEN_HEIGHT);
    expect(steppedHeight(-MAX_TOKEN_HEIGHT, -1, 5)).toBe(-MAX_TOKEN_HEIGHT);
  });

  it('leaves no field on a token that lands', () => {
    expect(heightField(15)).toEqual({ elevation: 15 });
    expect(heightField(0)).toEqual({ elevation: undefined });
    expect('elevation' in heightField(0)).toBe(true);
  });
});

describe('a height as it is written', () => {
  it('says on the chip which way and how far, in the map\'s unit', () => {
    expect(heightChipText({ elevation: 30 }, FEET)).toBe('↑ 30ft');
    expect(heightChipText({ elevation: -10 }, FEET)).toBe('↓ 10ft');
    expect(heightChipText({ elevation: 4.5 }, METRES)).toBe('↑ 4.5m');
    expect(heightChipText({ elevation: 12 }, { ...FEET, unitType: 'custom', unitName: 'mi', unitDistance: 6 })).toBe('↑ 12 mi');
  });

  it('says nothing for a token on the floor, and nothing where the map measures in range bands', () => {
    expect(heightChipText({}, FEET)).toBe('');
    expect(heightChipText({ elevation: 0 }, FEET)).toBe('');
    expect(heightChipText({ elevation: 30 }, BANDS)).toBe('');
    expect(countsHeight(BANDS)).toBe(false);
    expect(countsHeight({ mode: 'metric', unitDistance: 0 })).toBe(false);
  });

  it('writes a menu\'s value with its sign', () => {
    expect(signedHeight(30, FEET)).toBe('30ft');
    expect(signedHeight(0, FEET)).toBe('0ft');
    expect(signedHeight(-10, FEET)).toBe('−10ft');
  });
});

describe('the height between two ends', () => {
  const heights = new Map([['0,0', 0], ['70,0', 100], ['140,0', 20], ['210,0', -10]]);
  const heightAt = ({ x, y }: { x: number; y: number }): number => heights.get(`${x},${y}`) ?? 0;
  const at = (x: number): { x: number; y: number } => ({ x, y: 0 });

  it('is counted in cells between the first point and the last, either way', () => {
    expect(riseBetweenEnds([at(0), at(140)], heightAt, FEET)).toBe(4);
    expect(riseBetweenEnds([at(140), at(0)], heightAt, FEET)).toBe(4);
    expect(riseBetweenEnds([at(140), at(210)], heightAt, FEET)).toBe(6);
    expect(riseBetweenEnds([at(140), at(140)], heightAt, FEET)).toBe(0);
    expect(riseInCells(-4.5, METRES)).toBe(3);
  });

  it('never asks the corners between them', () => {
    expect(riseBetweenEnds([at(0), at(70), at(140)], heightAt, FEET)).toBe(4);
    expect(riseBetweenEnds([at(0), at(70), at(350)], heightAt, FEET)).toBe(0);
  });

  it('is none for a path of one point, and where the map counts no heights', () => {
    expect(riseBetweenEnds([at(140)], heightAt, FEET)).toBe(0);
    expect(riseBetweenEnds([], heightAt, FEET)).toBe(0);
    expect(riseBetweenEnds([at(0), at(140)], heightAt, BANDS)).toBe(0);
    expect(riseBetweenEnds([at(0), at(140)], () => NaN, FEET)).toBe(0);
  });
});

describe('a token\'s height in a scene file', () => {
  const token = { id: 't', kind: 'character', name: 'Wyvern', x: 10, y: 20, imagePath: 'w.png', elevation: 30, resources: { hp: { current: 4, max: 9 } } };

  it('is written as the token holds it, beside the fields every Atlas reads, and read back the same', () => {
    const file = tokenToFile(token) as Record<string, unknown>;
    expect(file).toMatchObject({ elevation: 30, hp: { current: 4, max: 9 } });
    expect(tokenFromFile(file)).toEqual(token);
    const scene = { objects: { tokens: { t: token } }, tokenSettings: { hiddenResources: [] }, initiative: { entries: [] } };
    expect(sceneFromFile(JSON.parse(JSON.stringify(sceneToFile(scene))) as typeof scene).objects.tokens.t).toEqual(token);
  });

  it('is left out of the file once the token lands', () => {
    const { elevation: _elevation, ...grounded } = token;
    const landed = JSON.parse(JSON.stringify(tokenToFile({ ...token, ...heightField(0) }))) as Record<string, unknown>;
    expect(landed).not.toHaveProperty('elevation');
    expect(tokenFromFile(landed)).toEqual(grounded);
  });
});
