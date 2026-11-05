import { describe, expect, it } from 'vitest';
import type { Mood } from '@/app/sound/soundTypes';
import type { SoundDirector } from '@/app/soundDirector/SoundDirector';
import { moodsMatching } from '@/app/react/components/dm-screen/sound/library/MoodMatches';

const mood = (id: string, name: string, sounds: string[]): Mood => ({ id, name, layers: sounds.map((sound) => ({ sound, levelDb: 0 })), music: 'keep', fadeSeconds: 4 } as unknown as Mood);
const NAMES: Record<string, string> = { a: 'Raiders at Dawn', b: 'Steady Rain', c: 'Dark Cave' };
const director = { shelf: { recordsOf: (m: Mood) => m.layers.map((layer) => ({ name: NAMES[layer.sound] ?? '' })) } } as unknown as SoundDirector;
const MOODS = [mood('1', 'Goblin Ambush', ['c']), mood('2', 'Tavern Night', ['b']), mood('3', 'Battle on the shore', ['a'])];

describe('the moods a search finds', () => {
  it('match by their name, in their own order', () => {
    expect(moodsMatching(MOODS, 'goblin', director).map((one) => one.id)).toEqual(['1']);
  });

  it('match by a sound they hold', () => {
    expect(moodsMatching(MOODS, 'rain', director).map((one) => one.id)).toEqual(['2']);
    expect(moodsMatching(MOODS, 'raid', director).map((one) => one.id)).toEqual(['3']);
  });

  it('are none for an empty search', () => {
    expect(moodsMatching(MOODS, '', director)).toEqual([]);
  });
});
