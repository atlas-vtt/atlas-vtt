import type { Mood, MoodLayer, MoodMusic, RoomId } from '../sound/soundTypes';
import { MAX_MOOD_LAYERS, ROOM_IDS } from '../sound/soundTypes';
import { readRecordText, recordText, type StoredRecord } from '../services/recordFiles/recordLayout';
import { isFiniteNumber, isRecord } from '../utils/guards';
import { readMoodIcon, readMoodTone } from './moodLook';

/** The mood format this version writes. A file with a higher one comes from a newer Atlas: it is read and never rewritten. */
export const MOOD_FORMAT = 1;

export const DEFAULT_FADE_SECONDS = 4;

/** What a mood file is read within. The file is a note of nobody's checking: a sync tool, a hand, a bundle may have written it. */
export const MOOD_LIMITS = {
  fileChars: 256 * 1024,
  idChars: 200,
  nameChars: 200,
  tracks: 500,
  maxFadeSeconds: 120,
  minLevelDb: -60,
  maxLevelDb: 12,
} as const;

const readLevel = (value: unknown): number =>
  (isFiniteNumber(value) ? Math.max(MOOD_LIMITS.minLevelDb, Math.min(MOOD_LIMITS.maxLevelDb, value)) : 0);

/** A reverb amount, 0 to 1; dry where there is none. */
const readReverb = (value: unknown): { reverb?: number } => (isFiniteNumber(value) && value > 0 ? { reverb: Math.min(1, value) } : {});

/** A room this version knows; another (a newer Atlas') reads as the default. */
const readRoom = (value: unknown): RoomId | undefined => ROOM_IDS.find((id) => id === value);

const isSoundId = (value: unknown): value is string => typeof value === 'string' && value !== '' && value.length <= MOOD_LIMITS.idChars;

/** Anything else is left out: a list that could not be read leaves the music as it is. */
function readMusic(value: unknown): MoodMusic {
  if (value === 'none') return 'none';
  if (!isRecord(value) || !Array.isArray(value.tracks)) return 'keep';
  return {
    tracks: value.tracks.filter(isSoundId).slice(0, MOOD_LIMITS.tracks),
    shuffle: value.shuffle === true,
    levelDb: readLevel(value.levelDb),
    ...((value.repeat === 'one' || value.repeat === 'off') && { repeat: value.repeat }),
    ...readReverb(value.reverb),
  };
}

/** The layers it can read, each sound once, as many as a mood holds. */
function readLayers(value: unknown): MoodLayer[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const layers: MoodLayer[] = [];
  for (const entry of value) {
    if (layers.length === MAX_MOOD_LAYERS) break;
    if (!isRecord(entry) || !isSoundId(entry.sound) || seen.has(entry.sound)) continue;
    seen.add(entry.sound);
    layers.push({ sound: entry.sound, levelDb: readLevel(entry.levelDb), ...readReverb(entry.reverb) });
  }
  return layers;
}

/** The record a mood file holds, or null when it holds none: too long, not JSON, no id. Such a file is read as nothing and left alone. */
export function readStoredMood(text: string): StoredRecord | null {
  if (text.length > MOOD_LIMITS.fileChars) return null;
  return readRecordText(text, (value): value is StoredRecord => isRecord(value) && typeof value.id === 'string' && isSoundId(value.id));
}

export const moodFileText = (stored: StoredRecord): string => recordText(stored, MOOD_FORMAT);

/** Whether a newer Atlas wrote the file, which this one must not rewrite. */
export const isNewerMood = (stored: StoredRecord): boolean => isFiniteNumber(stored.format) && stored.format > MOOD_FORMAT;

/**
 * The mood a record stands for, or null where it has no name or no place in the row. The rest is
 * read as far as it can be, never thrown at; the record keeps what it holds until the mood is saved.
 */
export function moodOf(stored: StoredRecord): Mood | null {
  const { id, name, order, fadeSeconds, music, layers } = stored;
  const icon = readMoodIcon(stored.icon);
  const tone = readMoodTone(stored.tone);
  const room = readRoom(stored.room);
  if (typeof name !== 'string' || name.trim() === '' || !isFiniteNumber(order)) return null;
  return {
    id,
    name: name.slice(0, MOOD_LIMITS.nameChars),
    order,
    fadeSeconds: isFiniteNumber(fadeSeconds) ? Math.max(0, Math.min(MOOD_LIMITS.maxFadeSeconds, fadeSeconds)) : DEFAULT_FADE_SECONDS,
    music: readMusic(music),
    layers: readLayers(layers),
    ...(icon && { icon }),
    ...(tone && { tone }),
    ...(room && { room }),
  };
}
