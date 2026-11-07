import type { TFile, Vault } from 'obsidian';
import { readAudioSecondsAt } from '../soundLibrary/audioDuration';
import { MAX_TOKEN_SOUND_BYTES } from './tokenSounds';

/**
 * The longest sound a token plays: far longer than any effect, and short enough that decoding it
 * stays within the player's memory (three minutes of stereo are about 70 MB of samples).
 */
export const MAX_TOKEN_SOUND_SECONDS = 180;

/** How long a sound file plays, from its metadata alone, as the Sound library reads it; null when it cannot be told. */
export function tokenSoundSeconds(vault: Vault, file: TFile): Promise<number | null> {
  return readAudioSecondsAt(vault.getResourcePath(file));
}

/**
 * Why a file cannot be a token's sound, or null where it can. Its length decides, since that is
 * what decoding it costs, whatever its format: a short high-resolution WAV is large and fine. Only
 * where the length cannot be told does the file's size stand in for it.
 */
export function tokenSoundProblem(seconds: number | null, bytes: number): 'too-long' | 'too-large' | null {
  if (seconds !== null) return seconds > MAX_TOKEN_SOUND_SECONDS ? 'too-long' : null;
  return bytes > MAX_TOKEN_SOUND_BYTES ? 'too-large' : null;
}
