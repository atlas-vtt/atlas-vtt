import { readRecordText, recordText, type StoredRecord } from '../services/recordFiles/recordLayout';
import { clampTrim } from '../sound/codec/soundInfo';
import type { SoundKind, SoundRecord } from '../sound/soundTypes';
import { isFiniteNumber, isRecord } from '../utils/guards';
import { isWithin, movedRelative, nameOfRelative, stemOf } from './soundPaths';

/** Under this length a file named like a loop is ambience. */
const AMBIENCE_MAX_SECONDS = 10 * 60;
const LOOP_LOOKING_NAME = /\b(loops?|looped|looping|ambien[ct]e?|ambient|atmos|atmosphere|soundscape|drone|room ?tone)\b|[_-]loop/i;


/** A sound's kind when nobody chose one: ambience for a short file named like a loop, music otherwise. An unknown length leaves the name to decide. */
export function defaultSoundKind(fileName: string, seconds: number | null): SoundKind {
  const short = seconds === null || seconds < AMBIENCE_MAX_SECONDS;
  return short && LOOP_LOOKING_NAME.test(fileName) ? 'ambience' : 'music';
}

function readLoop(value: unknown): SoundRecord['loop'] {
  if (!isRecord(value)) return undefined;
  const { startFrame, endFrame } = value;
  return isFiniteNumber(startFrame) && isFiniteNumber(endFrame) && startFrame >= 0 && endFrame > startFrame ? { startFrame, endFrame } : undefined;
}

/**
 * A file's record as a vault file holds it: what the engine reads as a `SoundRecord`, whose `filePath` is
 * `audioPath`, with every field a newer Atlas may have added.
 */
export type StoredSound = StoredRecord & Omit<SoundRecord, 'id' | 'filePath'> & {
  /** A vault path, or for a file in a root outside the vault that root and the path below it (`soundPaths.ts`). */
  audioPath: string;
  createdAt: number;
  modifiedAt: number;
};

/** The record format this version writes. A file with a higher one comes from a newer Atlas: it is read and never rewritten. */
export const SOUND_RECORD_FORMAT = 1;

/** What a record file is read within: a sync tool or a hand may have written it. */
const RECORD_FILE_CHARS = 64 * 1024;

/** The record a file holds, or null when it holds none. Such a file is read as nothing and left alone. */
export function readStoredSound(text: string): StoredSound | null {
  if (text.length > RECORD_FILE_CHARS) return null;
  return readRecordText(text, (value): value is StoredSound => isRecord(value) && typeof value.id === 'string' && value.id !== '' && typeof value.audioPath === 'string' && value.audioPath !== '' && typeof value.name === 'string');
}

export const soundFileText = (stored: StoredSound): string => recordText(stored, SOUND_RECORD_FORMAT);

/** Whether a newer Atlas wrote the file, which this one must not rewrite. */
export const isNewerSound = (stored: StoredRecord): boolean => isFiniteNumber(stored.format) && stored.format > SOUND_RECORD_FORMAT;

/**
 * A sound's record as the engine and the tab read it. A record file arrives unchecked, so what
 * cannot be read here reads as unset; the file keeps what it holds, for the version that wrote it.
 */
export function soundRecordOf(stored: StoredSound): SoundRecord {
  const { id, name, audioPath, audioSize, tags, kind, trimDb } = stored;
  const loop = readLoop(stored.loop);
  return {
    id,
    name,
    kind: kind === 'ambience' ? 'ambience' : 'music',
    filePath: audioPath,
    ...(isFiniteNumber(audioSize) && { audioSize }),
    tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string') : [],
    ...(loop && { loop }),
    ...(isFiniteNumber(trimDb) && { trimDb: clampTrim(trimDb) }),
  };
}

/** Fields to change on a sound; `undefined` removes the field. */
export type SoundChanges = { [K in keyof StoredSound]?: StoredSound[K] | undefined };

/** `stored` with `changes`, keeping what this version does not know. */
export function withChanges(stored: StoredSound, changes: SoundChanges, now: number): StoredSound {
  const next: StoredSound = { ...stored, modifiedAt: now };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) Reflect.deleteProperty(next, key);
    else Reflect.set(next, key, value);
  }
  return next;
}

/** A record once its file or folder moved: its path, its name where that was the file's, and its kind where it changed root. Null where the move has nothing to do with it. */
export function soundAfterMove(stored: StoredSound, from: string, to: string, now: number, kind: SoundKind = stored.kind): StoredSound | null {
  const moved = movedRelative(stored.audioPath, from, to);
  // A record the vault's rename event has reached already takes the kind alone.
  if (moved === null && !isWithin(to, stored.audioPath)) return null;
  if (moved === null && stored.kind === kind) return null;
  const named = moved !== null && stored.audioPath === from && stored.name === stemOf(nameOfRelative(from));
  return { ...stored, audioPath: moved ?? stored.audioPath, kind, ...(named && { name: stemOf(nameOfRelative(to)) }), modifiedAt: now };
}
