import { describe, expect, it, vi } from 'vitest';
import { boundedCached } from '../../../src/app/dungeons/render/boundedCache';

describe('a bounded cache', () => {
  it('makes a value once, keeps the most recently used and lets the oldest go past its limit', () => {
    const cache = new Map<string, number>();
    const make = vi.fn((n: number) => n);
    for (const key of ['a', 'b', 'c']) boundedCached(cache, key, 2, () => make(key.charCodeAt(0)));
    expect([...cache.keys()]).toEqual(['b', 'c']);
    boundedCached(cache, 'b', 2, () => make(0));
    boundedCached(cache, 'd', 2, () => make(1));
    expect([...cache.keys()]).toEqual(['b', 'd']);
    expect(make).toHaveBeenCalledTimes(4);
  });
});
