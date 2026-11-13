import { describe, expect, it } from 'vitest';
import type { RangeBand } from '../../types/collectionSettingsTypes';
import { bandReachChoices, bandReachOf, stepsByBands } from '../reachSteps';

const BANDS: RangeBand[] = [{ name: 'Close', maxSquares: 1 }, { name: 'Near', maxSquares: 6 }, { name: 'Double Near', maxSquares: 12 }, { name: 'Far', maxSquares: 13 }];
const byBands = (rangeBands: RangeBand[] = BANDS): Parameters<typeof bandReachChoices>[0] => ({ mode: 'abstract', rangeBands });

describe('the reaches a map with range bands names', () => {
  it('are its bands with how far each reaches, nearest first', () => {
    expect(bandReachChoices(byBands())).toEqual([{ name: 'Close', cells: 1 }, { name: 'Near', cells: 6 }, { name: 'Double Near', cells: 12 }, { name: 'Far', cells: 13 }]);
    expect(bandReachChoices(byBands([...BANDS].reverse())).map((band) => band.name)).toEqual(['Close', 'Near', 'Double Near', 'Far']);
  });

  it('leave out a band that reaches nowhere, and name bands that end together by the first', () => {
    const typed = [{ name: 'Here', maxSquares: 0 }, { name: 'Half typed', maxSquares: NaN }, { name: 'Near', maxSquares: 6 }, { name: 'Also near', maxSquares: 6 }];
    expect(bandReachChoices(byBands(typed))).toEqual([{ name: 'Near', cells: 6 }]);
  });

  it('are none where the map measures distances or has no bands', () => {
    expect(bandReachChoices({ mode: 'metric', rangeBands: BANDS })).toEqual([]);
    expect(bandReachChoices(byBands([]))).toEqual([]);
    expect(stepsByBands({ mode: 'metric', rangeBands: BANDS })).toBe(false);
  });
});

describe('bandReachOf', () => {
  it('is the band a distance is written as: the first that reaches as far, the farthest past them all', () => {
    const name = (cells: number): string | undefined => bandReachOf(cells, byBands())?.name;
    expect([0, 1, 2, 6, 6.4, 7, 12, 13, 40].map(name)).toEqual(['Close', 'Close', 'Near', 'Near', 'Near', 'Double Near', 'Double Near', 'Far', 'Far']);
    expect(bandReachOf(3, byBands([]))).toBeUndefined();
  });
});
