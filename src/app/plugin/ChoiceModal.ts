import { App, Modal } from 'obsidian';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../ui/nativeModal';
import { t } from '../i18n';

export interface ChoiceModalButton<T> {
  text: string;
  value: T;
  variant?: 'cta' | 'warning';
}

export interface ChoiceModalOptions<T> {
  title: string;
  /** One paragraph per entry. */
  message: string[];
  /** Muted helper text shown below the message. */
  hint?: string;
  buttons: ChoiceModalButton<T>[];
}

/**
 * Modal that asks the user to pick one of several actions.
 * Resolves with the picked value, or `null` when dismissed.
 */
export class ChoiceModal<T> extends Modal {
  private choice: T | null = null;
  private resolveChoice: ((choice: T | null) => void) | null = null;

  constructor(app: App, private readonly options: ChoiceModalOptions<T>) {
    super(app);
  }

  public prompt(): Promise<T | null> {
    return new Promise((resolve) => {
      this.resolveChoice = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl, options } = this;
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES);
    this.setTitle(options.title);

    for (const paragraph of options.message) {
      contentEl.createEl('p', { text: paragraph });
    }
    if (options.hint) {
      contentEl.createEl('p', { text: options.hint, cls: 'setting-item-description' });
    }

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    for (const button of options.buttons) {
      const buttonEl = buttonContainer.createEl('button', { text: button.text });
      if (button.variant) buttonEl.addClass(`mod-${button.variant}`);
      buttonEl.addEventListener('click', () => {
        this.choice = button.value;
        this.close();
      });
    }
    buttonContainer
      .createEl('button', { text: t('common.cancel') })
      .addEventListener('click', () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolveChoice?.(this.choice);
    this.resolveChoice = null;
  }
}
