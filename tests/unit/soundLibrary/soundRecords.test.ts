import { describe, expect, it } from 'vitest';
import { isAudioPath, isSoundDataPath, MOODS_FOLDER, RECORDS_FOLDER } from '../../../src/app/soundLibrary/soundFiles';
import { MAX_TRIM_DB } from '../../../src/app/sound/codec/soundInfo';
import { defaultSoundKind, soundAfterMove, soundRecordOf, withChanges, type StoredSound } from '../../../src/app/soundLibrary/soundRecords';

// A record an earlier build wrote, with the licence and credit Atlas no longer reads.
const SOUND = {
  id: 'sound-1', name: 'Rain', tags: ['weather'], createdAt: 1, modifiedAt: 2,
  audioPath: 'Music/Rain.mp3', kind: 'ambience', licence: 'cc0', trimDb: -3, credit: 'A. Person',
} as StoredSound;

describe('reading a sound as the engine does', () => {
  it('names the audio as its file', () => {
    expect(soundRecordOf(SOUND)).toEqual({
      id: 'sound-1', name: 'Rain', kind: 'ambience', filePath: 'Music/Rain.mp3', tags: ['weather'], trimDb: -3,
    });
  });

  it('reads what it cannot read as unset', () => {
    const hostile = {
      ...SOUND, kind: 'effect', licence: 'mine', streaming: 'sure', trimDb: 'loud', credit: 4, sourceUrl: {}, loop: { startFrame: 9, endFrame: 3 },
    } as unknown as StoredSound;
    expect(soundRecordOf(hostile)).toEqual({ id: 'sound-1', name: 'Rain', kind: 'music', filePath: 'Music/Rain.mp3', tags: ['weather'] });
    expect(soundRecordOf({ ...SOUND, trimDb: 500 }).trimDb).toBe(MAX_TRIM_DB);
    expect(soundRecordOf({ ...SOUND, trimDb: -500 }).trimDb).toBe(-MAX_TRIM_DB);
  });

  it('reads a loop in frames', () => {
    expect(soundRecordOf({ ...SOUND, loop: { startFrame: 0, endFrame: 48000 } }).loop).toEqual({ startFrame: 0, endFrame: 48000 });
  });
});

describe('a sound\'s kind when nobody chose one', () => {
  it.each([
    ['Forest ambience.mp3', 60, 'ambience'],
    ['tavern_loop.ogg', 120, 'ambience'],
    ['Rain Loop 2.flac', 599, 'ambience'],
    ['Cave Drone.wav', null, 'ambience'],
    ['Forest ambience.mp3', 600, 'music'],
    ['Battle theme.mp3', 60, 'music'],
    ['Battle theme.mp3', null, 'music'],
    ['Bloop.mp3', 30, 'music'],
  ])('%s of %s s is %s', (name, seconds, kind) => {
    expect(defaultSoundKind(name, seconds)).toBe(kind);
  });
});

describe('the files that count', () => {
  it.each(['a.mp3', 'a.WAV', 'a.flac', 'a.ogg', 'a.opus', 'a.m4a', 'a.aac', 'a.webm'])('%s is audio', (path) => {
    expect(isAudioPath(path)).toBe(true);
  });

  it.each(['a.png', 'a.mp4', 'a', 'mp3', 'a.mp3.json'])('%s is none', (path) => {
    expect(isAudioPath(path)).toBe(false);
  });

  it('moods and records are Atlas\' own files, the default import folders are not', () => {
    expect(isSoundDataPath(MOODS_FOLDER)).toBe(true);
    expect(isSoundDataPath(`${RECORDS_FOLDER}/a.json`)).toBe(true);
    expect(isSoundDataPath('atlas-vtt/sounds/music/a.mp3')).toBe(false);
    expect(isSoundDataPath('atlas-vtt/sounds/moods2/a.mp3')).toBe(false);
  });
});

describe('a record changing', () => {
  it('removes a field given as undefined and keeps what it does not know', () => {
    const later = { ...SOUND, stems: 3 };
    const changed = withChanges(later, { trimDb: undefined, credit: 'B' }, 9);
    expect(changed).toMatchObject({ credit: 'B', stems: 3, modifiedAt: 9 });
    expect('trimDb' in changed).toBe(false);
  });

  it('follows a file and a folder, its name only where that was the file\'s, and nothing else', () => {
    expect(soundAfterMove(SOUND, 'Music/Rain.mp3', 'Music/Storm.mp3', 9)).toMatchObject({ audioPath: 'Music/Storm.mp3', name: 'Storm', modifiedAt: 9 });
    expect(soundAfterMove({ ...SOUND, name: 'Mine' }, 'Music/Rain.mp3', 'Music/Storm.mp3', 9)).toMatchObject({ audioPath: 'Music/Storm.mp3', name: 'Mine' });
    expect(soundAfterMove(SOUND, 'Music', 'Audio', 9)).toMatchObject({ audioPath: 'Audio/Rain.mp3', name: 'Rain' });
    expect(soundAfterMove(SOUND, 'Mus', 'Audio', 9)).toBeNull();
  });

  it('where a rename\'s event has moved it already, takes only the kind of a move between roots', () => {
    expect(soundAfterMove(SOUND, 'Elsewhere/Rain.mp3', 'Music/Rain.mp3', 9, 'music')).toMatchObject({ audioPath: 'Music/Rain.mp3', kind: 'music' });
    expect(soundAfterMove(SOUND, 'Elsewhere/Rain.mp3', 'Music/Rain.mp3', 9, 'ambience')).toBeNull();
  });
});
