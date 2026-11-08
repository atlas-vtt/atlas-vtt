import type { App, TFile } from 'obsidian';
import type { TokenSound } from '../types/audioTypes';
import { pickSoundFile, type FolderChoice } from '../soundLibrary/SoundFolderPicker';
import { isAtlasOwn, isAudioPath } from '../soundLibrary/soundFiles';
import { showNotice } from '../ui/notice';
import { runInBackground } from '../utils/backgroundTask';
import { parentPath } from '../utils/pathUtils';
import { t } from '../i18n';
import { soundName } from './tokenSounds';
import { tokenSoundProblem, tokenSoundSeconds } from './tokenSoundLength';
import { orderSoundFiles } from './soundFileOrder';
import { recentSounds, rememberSound } from './recentSounds';

/**
 * The vault's audio files a token may take, as the sound picker lists them: each named by its
 * file, with its folder below, and matched by its whole path, so a folder's name finds its sounds.
 * Atlas' own folder is left out (its video maps are WebM), but for the sound folders inside it.
 * The `recent` picks come first, then the rest by folder and name.
 */
export function tokenSoundChoices(files: readonly TFile[], recent: readonly string[]): FolderChoice[] {
  const sounds = files.filter((file) => isAudioPath(file.path) && !isAtlasOwn(file.path));
  return orderSoundFiles(sounds, recent).map(({ path }) => {
    const folder = parentPath(path);
    return { label: soundName(path), ...(folder !== '' && { note: folder }), search: path, path };
  });
}

/** Whether a picked file may become a token's sound; says why not where it may not. */
async function mayTake(app: App, file: TFile): Promise<boolean> {
  const problem = tokenSoundProblem(await tokenSoundSeconds(app.vault, file), file.stat.size);
  if (!problem) return true;
  showNotice(t(problem === 'too-long' ? 'tokenSound.tooLong' : 'tokenSound.tooLarge', { name: soundName(file.path) }));
  return false;
}

/**
 * Lets the GM choose a sound file for a token with the Sound library's file picker, raised above
 * Edit Token; `onPicked` gets it at full volume, and the picker offers it first next time. A file
 * too large or too long for a token is refused with a notice, so it never reaches the token or
 * the recent picks.
 */
export function pickTokenSound(app: App, onPicked: (sound: Required<TokenSound>) => void): void {
  const choices = tokenSoundChoices(app.vault.getFiles(), recentSounds(app));
  pickSoundFile(app, choices, t('tokenSound.pickPlaceholder'), (path) => {
    const file = app.vault.getFileByPath(path);
    if (!file) return;
    runInBackground((async (): Promise<void> => {
      if (!(await mayTake(app, file))) return;
      rememberSound(app, path);
      onPicked({ path, volume: 1 });
    })(), 'Adding a token sound');
  }, { aboveDialogs: true });
}
