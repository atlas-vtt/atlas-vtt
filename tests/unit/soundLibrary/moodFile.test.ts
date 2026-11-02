import { describe, expect, it } from 'vitest';
import { MAX_MOOD_LAYERS } from '../../../src/app/sound/soundTypes';
import { getPinIconDefinition, PIN_TONES } from '../../../src/app/types/pinIcons';
import { DEFAULT_MOOD_ICON, moodIcon, moodTone } from '../../../src/app/soundLibrary/moodLook';
import { DEFAULT_FADE_SECONDS, isNewerMood, MOOD_FORMAT, MOOD_LIMITS, moodFileText, moodOf, readStoredMood } from '../../../src/app/soundLibrary/moodFile';

const read = (value: unknown): ReturnType<typeof moodOf> => {
  const stored = readStoredMood(JSON.stringify(value));
  return stored && moodOf(stored);
};

const VALID = { format: 1, id: 'mood-1', name: 'Tavern', order: 2, fadeSeconds: 6, music: { tracks: ['a', 'b'], shuffle: true, levelDb: -6 }, layers: [{ sound: 'c', levelDb: -3 }] };

describe('reading a mood file', () => {
  it('reads a whole mood', () => {
    expect(read(VALID)).toEqual({ id: 'mood-1', name: 'Tavern', order: 2, fadeSeconds: 6, music: { tracks: ['a', 'b'], shuffle: true, levelDb: -6 }, layers: [{ sound: 'c', levelDb: -3 }] });
  });

  it.each([
    ['text that is no JSON', '{ not json'],
    ['a list', '[1, 2]'],
    ['a number', '42'],
    ['null', 'null'],
    ['a mood without an id', JSON.stringify({ name: 'x', order: 1 })],
    ['an empty id', JSON.stringify({ id: '', name: 'x', order: 1 })],
    ['an id that is a number', JSON.stringify({ id: 4, name: 'x', order: 1 })],
    ['a very long file', JSON.stringify({ ...VALID, pad: 'x'.repeat(MOOD_LIMITS.fileChars) })],
  ])('reads %s as nothing, without a throw', (_label, text) => {
    expect(readStoredMood(text)).toBeNull();
  });

  it.each([
    ['no name', { ...VALID, name: undefined }],
    ['a blank name', { ...VALID, name: '   ' }],
    ['a name that is a number', { ...VALID, name: 3 }],
    ['an order that is text', { ...VALID, order: '2' }],
    ['no order', { ...VALID, order: undefined }],
  ])('takes a record with %s for no mood', (_label, value) => {
    expect(read(value)).toBeNull();
  });

  it('reads an icon and a tone it knows, and passes over any other, leaving the file as it is', () => {
    expect(read({ ...VALID, icon: 'inn', tone: 'amber' })).toMatchObject({ icon: 'inn', tone: 'amber' });
    for (const icon of ['nothing-like-it', 7, null, {}, '__proto__', 'toString']) expect(read({ ...VALID, icon })).not.toHaveProperty('icon');
    for (const tone of ['fuchsia', 7, null, {}, 'constructor']) expect(read({ ...VALID, tone })).not.toHaveProperty('tone');
    expect(moodIcon({})).toBe(DEFAULT_MOOD_ICON);
    expect(moodTone({})).toEqual(getPinIconDefinition(DEFAULT_MOOD_ICON).tone);
    expect(moodTone({ icon: 'inn', tone: 'azure' })).toEqual(PIN_TONES.azure);
  });

  it('holds a fade within its bounds, and takes the default where there is none', () => {
    expect(read({ ...VALID, fadeSeconds: 1e9 })?.fadeSeconds).toBe(MOOD_LIMITS.maxFadeSeconds);
    expect(read({ ...VALID, fadeSeconds: -5 })?.fadeSeconds).toBe(0);
    expect(read({ ...VALID, fadeSeconds: 'slow' })?.fadeSeconds).toBe(DEFAULT_FADE_SECONDS);
    expect(read({ ...VALID, fadeSeconds: undefined })?.fadeSeconds).toBe(DEFAULT_FADE_SECONDS);
  });

  it('reads the shapes of music and leaves anything else as it is playing', () => {
    expect(read({ ...VALID, music: 'none' })?.music).toBe('none');
    expect(read({ ...VALID, music: 'keep' })?.music).toBe('keep');
    for (const music of ['loud', 7, null, [], { tracks: 'a' }, { sounds: ['a'] }]) expect(read({ ...VALID, music })?.music).toBe('keep');
  });

  it('takes from a track list only what it can read', () => {
    const music = read({ ...VALID, music: { tracks: ['a', 3, '', null, 'b'], shuffle: 'yes', levelDb: 999 } })?.music;
    expect(music).toEqual({ tracks: ['a', 'b'], shuffle: false, levelDb: MOOD_LIMITS.maxLevelDb });
    const long = read({ ...VALID, music: { tracks: Array.from({ length: 5000 }, (_, n) => `t${n}`) } })?.music;
    expect(long !== 'keep' && long !== 'none' && long?.tracks.length).toBe(MOOD_LIMITS.tracks);
  });

  it('reads at most the layers a mood holds, each sound once', () => {
    const layers = Array.from({ length: 40 }, (_, n) => ({ sound: `s${n}`, levelDb: -n }));
    expect(read({ ...VALID, layers })?.layers).toHaveLength(MAX_MOOD_LAYERS);
    expect(read({ ...VALID, layers: [{ sound: 'a', levelDb: -1 }, { sound: 'a', levelDb: -2 }, { sound: 4 }, 'b', null] })?.layers).toEqual([{ sound: 'a', levelDb: -1 }]);
    expect(read({ ...VALID, layers: 'all' })?.layers).toEqual([]);
    expect(read({ ...VALID, layers: [{ sound: 'a', levelDb: 'loud' }] })?.layers).toEqual([{ sound: 'a', levelDb: 0 }]);
  });

  it('does not take a level that is not finite', () => {
    const stored = readStoredMood(JSON.stringify(VALID))!;
    expect(moodOf({ ...stored, layers: [{ sound: 'a', levelDb: Infinity }] })?.layers).toEqual([{ sound: 'a', levelDb: 0 }]);
  });
});

describe('a mood file of a newer Atlas', () => {
  it('is read, known for what it is, and keeps its number when written', () => {
    const stored = readStoredMood(JSON.stringify({ ...VALID, format: MOOD_FORMAT + 1 }))!;
    expect(moodOf(stored)?.name).toBe('Tavern');
    expect(isNewerMood(stored)).toBe(true);
    expect((JSON.parse(moodFileText(stored)) as { format: number }).format).toBe(MOOD_FORMAT + 1);
  });

  it('a current file is no newer one', () => {
    expect(isNewerMood(readStoredMood(JSON.stringify(VALID))!)).toBe(false);
    expect(isNewerMood(readStoredMood(JSON.stringify({ ...VALID, format: 'ten' }))!)).toBe(false);
  });
});
