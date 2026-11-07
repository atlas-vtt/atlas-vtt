import type { TFile, Vault } from 'obsidian';
import { readAudioSecondsAt } from '../soundLibrary/audioDuration';

/**
 * The longest sound a token plays: far longer than any effect, and short enough that decoding it
 * stays within the player's memory (three minutes of stereo are about 70 MB of samples).
 */
export const MAX_TOKEN_SOUND_SECONDS = 180;

/** How long a sound file plays, from its metadata alone, as the Sound library reads it; null when it cannot be told. */
export function tokenSoundSeconds(vault: Vault, file: TFile): Promise<number | null> {
  return readAudioSecondsAt(vault.getResourcePath(file));
}

/** Whether a sound is too long for a token. A length that cannot be told is left to the byte limit. */
export function isTooLong(seconds: number | null): boolean {
  return seconds !== null && seconds > MAX_TOKEN_SOUND_SECONDS;
}
