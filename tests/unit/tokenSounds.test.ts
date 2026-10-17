import { describe, expect, it } from 'vitest';
import { isSoundFile, soundName, tokenSounds } from '../../src/app/audio/tokenSounds';
import type { TokenSound } from '../../src/app/types/audioTypes';

/** A token's `sounds` as a hand-edited or newer file may hold them. */
const fromFile = (sounds: unknown): { sounds?: TokenSound[] } => ({ sounds: sounds as TokenSound[] });

describe('tokenSounds', () => {
  it('offers none for a token without sounds, or whose sounds are not a list', () => {
    expect(tokenSounds({})).toEqual([]);
    expect(tokenSounds(fromFile('Sounds/roar.mp3'))).toEqual([]);
    expect(tokenSounds(fromFile({ path: 'Sounds/roar.mp3' }))).toEqual([]);
  });

  it('skips entries without a vault path', () => {
    const sounds = [{ path: '' }, { path: 42 }, null, 'Sounds/hiss.mp3', { volume: 1 }, { path: 'Sounds/roar.mp3' }];
    expect(tokenSounds(fromFile(sounds))).toEqual([{ path: 'Sounds/roar.mp3', volume: 1 }]);
  });

  it('plays a sound without a numeric volume at full volume', () => {
    const sounds = [{ path: 'a.mp3' }, { path: 'b.mp3', volume: '0.5' }, { path: 'c.mp3', volume: null }];
    expect(tokenSounds(fromFile(sounds)).map(({ volume }) => volume)).toEqual([1, 1, 1]);
  });

  it('keeps a volume between 0 and 1', () => {
    const sounds = [{ path: 'a.mp3', volume: 0.4 }, { path: 'b.mp3', volume: 3 }, { path: 'c.mp3', volume: -1 }, { path: 'd.mp3', volume: 0 }];
    expect(tokenSounds(fromFile(sounds)).map(({ volume }) => volume)).toEqual([0.4, 1, 0, 0]);
  });

  it('names a sound by its file name without folder or extension', () => {
    expect(soundName('Sounds/Dragons/dragon-roar.mp3')).toBe('dragon-roar');
    expect(soundName('Sounds/war.cry.ogg')).toBe('war.cry');
    expect(soundName('roar')).toBe('roar');
  });

  it('takes the audio files Obsidian plays as sounds, whatever the case of their extension', () => {
    const sounds = ['a.mp3', 'b.WAV', 'c.m4a', 'd.ogg', 'e.oga', 'f.opus', 'g.flac', 'h.webm', 'i.3gp'];
    const others = ['Roar.md', 'roar.png', 'roar.mp4', 'roar', 'mp3', 'Sounds.mp3/roar'];
    expect(sounds.filter(isSoundFile)).toEqual(sounds);
    expect(others.filter(isSoundFile)).toEqual([]);
  });

  it('offers the first five usable sounds', () => {
    const sounds = [{ path: '' }, ...['a', 'b', 'c', 'd', 'e', 'f'].map((name) => ({ path: `${name}.mp3` }))];
    expect(tokenSounds(fromFile(sounds)).map(({ path }) => path)).toEqual(['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3', 'e.mp3']);
  });
});
