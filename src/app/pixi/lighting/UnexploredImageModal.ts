import { FuzzySuggestModal, type App, type TFile } from 'obsidian';
import { isVaultImage } from '../../utils/vaultImage';
import { t } from '../../i18n';

/**
 * Picks the scene's fog map for never-seen areas from every image in the vault, Atlas' own folder
 * included: a fog map is usually made from a map that was imported there.
 */
class UnexploredImageModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly onChoose: (path: string) => void) {
    super(app);
    this.setPlaceholder(t('sceneLight.unexploredImagePlaceholder'));
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter(isVaultImage).sort((a, b) => a.path.localeCompare(b.path));
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file.path);
  }
}

/** Opens the picker; `onChoose` gets the vault path of the image picked. */
export function pickUnexploredImage(app: App, onChoose: (path: string) => void): void {
  new UnexploredImageModal(app, onChoose).open();
}
