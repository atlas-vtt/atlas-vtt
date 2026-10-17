import { FuzzySuggestModal, type App, type FuzzyMatch, type TFile } from 'obsidian';
import type { TokenSound } from '../types/audioTypes';
import { ABOVE_ATLAS_DIALOGS } from '../ui/nativeModal';
import { showNotice } from '../ui/notice';
import { t } from '../i18n';
import { MAX_TOKEN_SOUND_BYTES, isSoundFile, soundName } from './tokenSounds';
import { orderSoundFiles } from './soundFileOrder';
import { recentSounds, rememberSound } from './recentSounds';

/**
 * Obsidian's own fuzzy search over the vault's sound files, as its quick switcher looks: rows name
 * the file and its folder, and typing matches the whole path, so a folder's name finds its sounds.
 * Before anything is typed, the `recent` picks come first, then the rest by folder and name.
 * Opened from Edit Token, so it stands above Atlas' dialogs.
 */
export class AudioFileModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly onChoose: (file: TFile) => void, private readonly recent: readonly string[] = []) {
    super(app);
    this.containerEl.addClass(ABOVE_ATLAS_DIALOGS);
    this.setPlaceholder(t('tokenSound.pickPlaceholder'));
    this.emptyStateText = t('tokenSound.noMatch');
  }

  getItems(): TFile[] {
    return orderSoundFiles(this.app.vault.getFiles().filter((file) => isSoundFile(file.path)), this.recent);
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
    el.addClass('mod-complex');
    const content = el.createDiv({ cls: 'suggestion-content' });
    content.createDiv({ cls: 'suggestion-title', text: match.item.basename });
    const folder = match.item.parent?.path;
    if (folder && folder !== '/') content.createDiv({ cls: 'suggestion-note', text: folder });
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}

/**
 * Lets the GM choose a sound file for a token; `onPicked` gets it at full volume, and the picker
 * offers it first next time. A file larger than a token plays is refused with a notice, so it
 * never reaches the token or the recent picks.
 */
export function pickTokenSound(app: App, onPicked: (sound: Required<TokenSound>) => void): void {
  new AudioFileModal(app, (file) => {
    if (file.stat.size > MAX_TOKEN_SOUND_BYTES) {
      showNotice(t('tokenSound.tooLarge', { name: soundName(file.path) }));
      return;
    }
    rememberSound(app, file.path);
    onPicked({ path: file.path, volume: 1 });
  }, recentSounds(app)).open();
}
