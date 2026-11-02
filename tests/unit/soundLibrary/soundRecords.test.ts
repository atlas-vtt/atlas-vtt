import { describe, expect, it } from 'vitest';
import type { SoundAsset } from '../../../src/app/services/AssetService';
import { parseRecordFile, serializeRecord } from '../../../src/app/services/library/recordFile';
import { isRecordFileCandidate } from '../../../src/app/services/library/libraryPaths';
import { ownedPaths, primaryPath, recordFilePath } from '../../../src/app/services/vault-sync/assetFiles';
import { isReservedCollectionPath } from '../../../src/app/services/vault-sync/reservedPaths';
import { isAudioPath } from '../../../src/app/soundLibrary/soundFiles';
import { MAX_TRIM_DB } from '../../../src/app/sound/codec/soundInfo';
import { defaultSoundKind, soundRecordOf } from '../../../src/app/soundLibrary/soundRecords';

const SOUND: SoundAsset = {
  id: 'sound-1', type: 'sound', name: 'Rain', tags: ['weather'], collection: 'Fen', createdAt: 1, modifiedAt: 2,
  audioPath: 'Music/Rain.mp3', kind: 'ambience', licence: 'cc0', streaming: 'unknown', trimDb: -3, credit: 'A. Person',
};

describe('a sound\'s record file', () => {
  it('lies in the collection\'s sounds folder, wherever the audio lies', () => {
    expect(recordFilePath(SOUND)).toBe('atlas-vtt/collections/Fen/sounds/sound-1.json');
    expect(isRecordFileCandidate(recordFilePath(SOUND))).toBe(true);
    expect(primaryPath(SOUND)).toBe('Music/Rain.mp3');
    expect(ownedPaths(SOUND)).toEqual(['Music/Rain.mp3', 'atlas-vtt/collections/Fen/sounds/sound-1.json']);
  });

  it('round-trips the whole record', () => {
    const path = recordFilePath(SOUND);
    expect(parseRecordFile(serializeRecord(SOUND), path)?.record).toEqual(SOUND);
  });

  it('holds a place of the audio but none of its own, and takes its collection from where it lies', () => {
    const moved = 'atlas-vtt/collections/Hills/sounds/sound-1.json';
    const record = parseRecordFile(serializeRecord(SOUND), moved)?.record as SoundAsset;
    expect(record.collection).toBe('Hills');
    expect(record.audioPath).toBe('Music/Rain.mp3');
    expect('filePath' in record).toBe(false);
  });

  it('is no record without an audio path', () => {
    const { audioPath: _gone, ...rest } = SOUND;
    expect(parseRecordFile(serializeRecord(rest as SoundAsset), recordFilePath(SOUND))?.record).toBeNull();
  });
});

describe('reading a sound as the engine does', () => {
  it('names the audio as its file', () => {
    expect(soundRecordOf(SOUND)).toEqual({
      id: 'sound-1', name: 'Rain', kind: 'ambience', filePath: 'Music/Rain.mp3', tags: ['weather'], licence: 'cc0', streaming: 'unknown', trimDb: -3, credit: 'A. Person',
    });
  });

  it('reads what it cannot read as unset', () => {
    const hostile = {
      ...SOUND, kind: 'effect', licence: 'mine', streaming: 'sure', trimDb: 'loud', credit: 4, sourceUrl: {}, loop: { startFrame: 9, endFrame: 3 },
    } as unknown as SoundAsset;
    expect(soundRecordOf(hostile)).toEqual({ id: 'sound-1', name: 'Rain', kind: 'music', filePath: 'Music/Rain.mp3', tags: ['weather'], licence: 'unknown', streaming: 'unknown' });
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

  it('moods are Atlas\' own files, sounds are not', () => {
    expect(isReservedCollectionPath('atlas-vtt/collections/Fen/moods/a.json')).toBe(true);
    expect(isReservedCollectionPath('atlas-vtt/collections/Fen/sounds/a.mp3')).toBe(false);
    expect(isRecordFileCandidate('atlas-vtt/collections/Fen/moods/a.json')).toBe(false);
  });
});
