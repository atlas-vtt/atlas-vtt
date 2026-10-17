import { MENU_SEPARATOR, type ContextMenuEntry } from './AtlasContextMenu';
import { soundName, tokenSounds } from '../../../audio/tokenSounds';
import { playTokenSound } from '../../../audio/playTokenSound';
import type { TokenSoundPlayer } from '../../../audio/TokenSoundPlayer';
import type { TokenSound } from '../../../types/audioTypes';
import { t } from '../../../i18n';

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
    onClick: () => playTokenSound(player, sound),
  }));
  if (player.isPlaying()) {
    rows.push(MENU_SEPARATOR, { type: 'item', label: t('tokenSound.stop'), onClick: () => player.stopAll() });
  }
  return { type: 'submenu', label: t('tokenSound.play'), icon: 'volume-2', children: rows };
}
