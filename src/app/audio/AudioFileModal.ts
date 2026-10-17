import { FuzzySuggestModal, type App, type FuzzyMatch, type TFile } from 'obsidian';
import type { TokenSound } from '../types/audioTypes';
import { ABOVE_ATLAS_DIALOGS } from '../ui/nativeModal';
import { showNotice } from '../ui/notice';
import { t } from '../i18n';
import { MAX_TOKEN_SOUND_BYTES, isSoundFile, soundName } from './tokenSounds';

/**
 * Obsidian's own fuzzy search over the vault's sound files, as its quick switcher looks: rows name
 * the file and its folder. Opened from Edit Token, so it stands above Atlas' dialogs.
 */
export class AudioFileModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly onChoose: (file: TFile) => void) {
    super(app);
    this.containerEl.addClass(ABOVE_ATLAS_DIALOGS);
    this.setPlaceholder(t('tokenSound.pickPlaceholder'));
    this.emptyStateText = t('tokenSound.noMatch');
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter((file) => isSoundFile(file.path));
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
 * Lets the GM choose a sound file for a token; `onPicked` gets it at full volume. A file larger
 * than a token plays is refused with a notice, so it never reaches the token.
 */
export function pickTokenSound(app: App, onPicked: (sound: Required<TokenSound>) => void): void {
  new AudioFileModal(app, (file) => {
    if (file.stat.size > MAX_TOKEN_SOUND_BYTES) {
      showNotice(t('tokenSound.tooLarge', { name: soundName(file.path) }));
      return;
    }
    onPicked({ path: file.path, volume: 1 });
  }).open();
}
