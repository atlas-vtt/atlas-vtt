import type { App } from 'obsidian';
import type { MoodMusic } from '../sound/soundTypes';
import type { ActiveMood } from './soundMix';
import type { MoodMix } from './tableSound';

export type DeviceStorage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;

/** Facts of this device, never synced: which output it plays on, and what it played last. */
const OUTPUT_KEY = 'atlas-vtt:sound-output';
const LAST_MIX_KEY = 'atlas-vtt:sound-last';
const SEND_TO_PLAYERS_KEY = 'atlas-vtt:sound-send-players';
const LICENCE_NOTE_KEY = 'atlas-vtt:sound-licence-note';

export interface StoredOutput {
  id: string;
  label: string;
}

/** What a device played last, which one press brings back: nothing plays by itself. */
export interface LastMix {
  mood: ActiveMood | null;
  mix: MoodMix;
}

const isText = (value: unknown): value is string => typeof value === 'string';

function read(storage: DeviceStorage, key: string): unknown {
  try {
    return storage.loadLocalStorage(key);
  } catch (error) {
    console.error('[Atlas] Could not read a sound setting of this device', error);
    return null;
  }
}

function write(storage: DeviceStorage, key: string, value: unknown): void {
  try {
    storage.saveLocalStorage(key, value);
  } catch (error) {
    console.error('[Atlas] Could not save a sound setting of this device', error);
  }
}

export function loadOutput(storage: DeviceStorage): StoredOutput | null {
  const value = read(storage, OUTPUT_KEY);
  if (typeof value !== 'object' || value === null) return null;
  const { id, label } = value as Partial<Record<keyof StoredOutput, unknown>>;
  return isText(id) && id !== '' ? { id, label: isText(label) ? label : '' } : null;
}

/** Null is the system's default output. */
export function saveOutput(storage: DeviceStorage, output: StoredOutput | null): void {
  write(storage, OUTPUT_KEY, output);
}

/** Whether this device sends its sound to players: off where phones at the table would echo the speaker. */
export const loadSendToPlayers = (storage: DeviceStorage): boolean => read(storage, SEND_TO_PLAYERS_KEY) !== false;
export const saveSendToPlayers = (storage: DeviceStorage, on: boolean): void => write(storage, SEND_TO_PLAYERS_KEY, on);

/** The first sound that goes up on this device says what must hold for it, once. */
export function licenceNoteDue(storage: DeviceStorage): boolean {
  if (read(storage, LICENCE_NOTE_KEY) === true) return false;
  write(storage, LICENCE_NOTE_KEY, true);
  return true;
}

function readMusic(value: unknown): MoodMusic | null {
  if (value === 'keep' || value === 'none') return value;
  if (typeof value !== 'object' || value === null) return null;
  const { tracks, shuffle, levelDb, repeat } = value as Record<string, unknown>;
  return Array.isArray(tracks) && tracks.every(isText) && typeof levelDb === 'number' ? { tracks, shuffle: shuffle === true, levelDb, ...((repeat === 'one' || repeat === 'off') && { repeat }) } : null;
}

export function loadLastMix(storage: DeviceStorage): LastMix | null {
  const value = read(storage, LAST_MIX_KEY);
  if (typeof value !== 'object' || value === null) return null;
  const { mood, mix } = value as Partial<Record<keyof LastMix, Record<string, unknown>>>;
  if (!mix) return null;
  const music = readMusic(mix.music);
  if (!music || !Array.isArray(mix.layers) || typeof mix.fadeSeconds !== 'number') return null;
  const layers = (mix.layers as unknown[]).flatMap((layer) => {
    if (typeof layer !== 'object' || layer === null) return [];
    const { sound, levelDb } = layer as Record<string, unknown>;
    return isText(sound) && typeof levelDb === 'number' ? [{ sound, levelDb }] : [];
  });
  const active = mood && isText(mood.id) ? { id: mood.id } : null;
  return { mood: active, mix: { fadeSeconds: mix.fadeSeconds, music, layers } };
}

/** Null when a mix was ended on purpose: there is nothing to bring back. */
export function saveLastMix(storage: DeviceStorage, last: LastMix | null): void {
  write(storage, LAST_MIX_KEY, last);
}
