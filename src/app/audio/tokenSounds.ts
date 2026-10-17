import type { TokenSound } from '../types/audioTypes';
import { isFiniteNumber, isRecord } from '../utils/guards';

/** How many sounds a token offers in its menu. */
export const MAX_TOKEN_SOUNDS = 5;

/** The largest sound file a token plays: far longer than any effect, short of what stalls Obsidian while it decodes. */
export const MAX_TOKEN_SOUND_BYTES = 20 * 1024 * 1024;

/** A stored volume read for playing: unset or not a number is full volume, anything else held to 0–1. */
function volumeOf(raw: unknown): number {
  return isFiniteNumber(raw) ? Math.min(1, Math.max(0, raw)) : 1;
}

/**
 * The sounds a token offers, in its own order: the first `MAX_TOKEN_SOUNDS` entries that name a
 * vault file, each with the volume it plays at. A map file arrives unchecked (a hand edit, a
 * newer Atlas), so entries that are no sound are passed over and left in the file as they are.
 */
export function tokenSounds(token: { sounds?: TokenSound[] }): Required<TokenSound>[] {
  const stored: unknown = token.sounds;
  if (!Array.isArray(stored)) return [];
  const sounds: Required<TokenSound>[] = [];
  for (const entry of stored) {
    if (!isRecord(entry) || typeof entry.path !== 'string' || entry.path === '') continue;
    sounds.push({ path: entry.path, volume: volumeOf(entry.volume) });
    if (sounds.length === MAX_TOKEN_SOUNDS) break;
  }
  return sounds;
}
