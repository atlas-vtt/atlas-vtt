import { describe, expect, it } from 'vitest';
import { mixDiffersFrom } from '@/app/soundDirector/mixChange';
import type { Mood } from '@/app/sound/soundTypes';

const known = (id: string): boolean => id !== 'deleted';
const list = (tracks: string[], levelDb = -3, shuffle = false): Mood['music'] => ({ tracks, shuffle, levelDb });

describe('whether the mix is still its mood', () => {
  const mood = { music: list(['a', 'b']), layers: [{ sound: 'rain', levelDb: -6 }] };

  it('holds for the same sounds at the same levels, in any order the copies came', () => {
    expect(mixDiffersFrom(mood, { music: list(['b', 'a']), layers: [{ sound: 'rain', levelDb: -6 }] }, known)).toBe(false);
  });

  it.each([
    ['a layer at another level', { music: list(['a', 'b']), layers: [{ sound: 'rain', levelDb: -7 }] }],
    ['a layer gone', { music: list(['a', 'b']), layers: [] }],
    ['a layer more', { music: list(['a', 'b']), layers: [{ sound: 'rain', levelDb: -6 }, { sound: 'wind', levelDb: 0 }] }],
    ['music at another level', { music: list(['a', 'b'], -9), layers: [{ sound: 'rain', levelDb: -6 }] }],
    ['a track gone', { music: list(['a']), layers: [{ sound: 'rain', levelDb: -6 }] }],
    ['shuffle changed', { music: list(['a', 'b'], -3, true), layers: [{ sound: 'rain', levelDb: -6 }] }],
    ['no music', { music: 'none' as const, layers: [{ sound: 'rain', levelDb: -6 }] }],
  ])('ends with %s', (_label, now) => {
    expect(mixDiffersFrom(mood, now, known)).toBe(true);
  });

  it('does not miss a sound that was deleted, and a mood that keeps the music does not mind it', () => {
    expect(mixDiffersFrom({ music: list(['a', 'deleted']), layers: [{ sound: 'deleted', levelDb: 0 }] }, { music: list(['a']), layers: [] }, known)).toBe(false);
    expect(mixDiffersFrom({ music: 'keep', layers: [] }, { music: list(['z']), layers: [] }, known)).toBe(false);
    expect(mixDiffersFrom({ music: 'none', layers: [] }, { music: 'none', layers: [] }, known)).toBe(false);
  });
});
