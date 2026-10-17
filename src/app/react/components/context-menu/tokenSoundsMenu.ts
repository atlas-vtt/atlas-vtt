import { MENU_SEPARATOR, type ContextMenuEntry } from './AtlasContextMenu';
import { soundName, tokenSounds } from '../../../audio/tokenSounds';
import type { PlayOutcome, TokenSoundPlayer } from '../../../audio/TokenSoundPlayer';
import type { TokenSound } from '../../../types/audioTypes';
import { showNotice } from '../../../ui/notice';
import { t } from '../../../i18n';

/** What the GM is told when a sound did not play; nothing when it played or was stopped. */
const PROBLEMS: Record<PlayOutcome, ((name: string) => string) | null> = {
  played: null,
  stopped: null,
  missing: (name) => t('tokenSound.missing', { name }),
  'too-large': (name) => t('tokenSound.tooLarge', { name }),
  unreadable: (name) => t('tokenSound.unreadable', { name }),
  unavailable: () => t('tokenSound.unavailable'),
};

async function playAndReport(player: TokenSoundPlayer, sound: Required<TokenSound>): Promise<void> {
  const problem = PROBLEMS[await player.play(sound)];
  if (problem) showNotice(problem(soundName(sound.path)));
}

/**
 * "Play sound" for one token: a row per sound, named by its file, and Stop sounds below them while
 * any token's sound plays. Only the right-clicked token's sounds, never the rest of the selection:
 * a click plays one sound. None for a token without sounds.
 */
export function tokenSoundsSubmenu(player: TokenSoundPlayer, token: { sounds?: TokenSound[] }): ContextMenuEntry | null {
  const sounds = tokenSounds(token);
  if (sounds.length === 0) return null;
  const rows: ContextMenuEntry[] = sounds.map((sound) => ({
    type: 'item',
    label: soundName(sound.path),
    onClick: () => playAndReport(player, sound),
  }));
  if (player.isPlaying()) {
    rows.push(MENU_SEPARATOR, { type: 'item', label: t('tokenSound.stop'), onClick: () => player.stopAll() });
  }
  return { type: 'submenu', label: t('tokenSound.play'), icon: 'volume-2', children: rows };
}
