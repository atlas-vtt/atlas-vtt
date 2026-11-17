import { Modal, type App } from 'obsidian';
import { t } from '../i18n';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../ui/nativeModal';
import type { ButtonVariant } from '../packages/components/primitives/buttonClasses';
import type { OriginalsChoice } from './SoundRoots';
import { createAtlasButton } from '../ui/atlasButton';

export interface ConversionConsentOptions {
  folderName: string;
  fileCount: number;
  canTrash: boolean;
  canWrite: boolean;
  /** The GM's choice; null where the modal was closed any other way, which unlinks the folder. */
  onChoose(choice: OriginalsChoice | null): void;
}

/** Asks once whether Atlas may convert a linked folder in place, and what becomes of the originals. */
export class ConversionConsentModal extends Modal {
  private answered = false;

  constructor(app: App, private readonly options: ConversionConsentOptions) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, options } = this;
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'atlas-sound-consent');
    const folder = options.folderName;
    if (!options.canWrite) {
      this.setTitle(folder);
      contentEl.createEl('p', { text: t('audio.consent.noWrite', { folder }) });
      const row = contentEl.createDiv({ cls: 'modal-button-container' });
      createAtlasButton(row, { text: t('audio.consent.ok'), size: 'sm', onClick: () => this.close() });
      return;
    }
    this.setTitle(t('audio.consent.title', { folder }));
    contentEl.createEl('p', { text: t('audio.consent.body', { folder, count: options.fileCount }) });
    if (!options.canTrash) contentEl.createEl('p', { text: t('audio.consent.noTrash'), cls: 'setting-item-description' });
    const row = contentEl.createDiv({ cls: 'modal-button-container' });
    if (options.canTrash) this.choice(row, t('audio.consent.trash'), 'trash', 'default');
    this.choice(row, t('audio.consent.keep'), 'keep', options.canTrash ? 'outline' : 'default');
    createAtlasButton(row, { text: t('common.cancel'), variant: 'outline', size: 'sm', onClick: () => this.close() });
  }

  onClose(): void {
    this.contentEl.empty();
    this.answer(null);
  }

  private choice(row: HTMLElement, text: string, value: OriginalsChoice, variant: ButtonVariant): void {
    createAtlasButton(row, {
      text,
      variant,
      size: 'sm',
      onClick: () => {
        this.answer(value);
        this.close();
      },
    });
  }

  private answer(choice: OriginalsChoice | null): void {
    if (this.answered) return;
    this.answered = true;
    this.options.onChoose(choice);
  }
}
