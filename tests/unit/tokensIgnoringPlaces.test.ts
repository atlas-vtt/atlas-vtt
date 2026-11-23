import { describe, expect, it } from 'vitest';
import { onlyPlacesDiffer } from '../../src/app/react/hooks/useTokensIgnoringPlaces';
import type { TokenEntity } from '../../src/app/types';

const token = (id: string, extra: Partial<TokenEntity> = {}): TokenEntity =>
  ({ id, kind: 'token', x: 0, y: 0, imagePath: `${id}.png`, conditions: [], ...extra }) as unknown as TokenEntity;

describe('onlyPlacesDiffer', () => {
  const a = token('a');
  const b = token('b');
  const before = { a, b };

  it('takes a move for no change', () => {
    expect(onlyPlacesDiffer(before, { a: { ...a, x: 70, y: 140 }, b })).toBe(true);
  });

  it('sees every other change', () => {
    expect(onlyPlacesDiffer(before, { a: { ...a, x: 70, imagePath: 'other.png' }, b })).toBe(false);
    expect(onlyPlacesDiffer(before, { a: { ...a, conditions: ['prone'] }, b })).toBe(false);
    expect(onlyPlacesDiffer(before, { a: { ...a, layer: 2 } as TokenEntity, b })).toBe(false);
    expect(onlyPlacesDiffer(before, { a })).toBe(false);
    expect(onlyPlacesDiffer(before, { a, c: b })).toBe(false);
  });
});
