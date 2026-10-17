import type { TokenSound } from '../types/audioTypes';
import { showNotice } from '../ui/notice';
import { t } from '../i18n';
import { soundName } from './tokenSounds';
import type { PlayOutcome, TokenSoundPlayer } from './TokenSoundPlayer';

/** What the GM is told when a sound did not play; nothing when it played or was stopped. */
const PROBLEMS: Record<PlayOutcome, ((name: string) => string) | null> = {
  played: null,
  stopped: null,
  missing: (name) => t('tokenSound.missing', { name }),
  'too-large': (name) => t('tokenSound.tooLarge', { name }),
  unreadable: (name) => t('tokenSound.unreadable', { name }),
  unavailable: () => t('tokenSound.unavailable'),
};

/** Plays a token's sound, and tells the GM why when it cannot play. */
export async function playTokenSound(player: TokenSoundPlayer, sound: Required<TokenSound>): Promise<void> {
  const problem = PROBLEMS[await player.play(sound)];
  if (problem) showNotice(problem(soundName(sound.path)));
}
