import { createDialogShell } from './dialogShell';
import { t } from '../i18n';

export interface TextInputDialogOptions {
  title: string;
  confirmLabel: string;
  initialValue?: string;
  placeholder?: string;
}

/**
 * Small centred dialog with a textarea. Resolves with the trimmed text, or
 * `null` when cancelled or left empty. Enter confirms, Shift+Enter adds a line.
 */
export function promptForText(options: TextInputDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const { root, dialog } = createDialogShell(options.title);

    const textarea = dialog.createEl('textarea', { cls: 'atlas-text-dialog__input' });
    textarea.value = options.initialValue ?? '';
    if (options.placeholder) textarea.placeholder = options.placeholder;

    const actions = dialog.createDiv({ cls: 'atlas-text-dialog__actions' });
    const cancelButton = actions.createEl('button', { text: t('common.cancel') });
    const confirmButton = actions.createEl('button', { cls: 'mod-cta', text: options.confirmLabel });

    const close = (result: string | null): void => {
      root.remove();
      resolve(result);
    };
    const confirm = (): void => close(textarea.value.trim() || null);

    confirmButton.addEventListener('click', confirm);
    cancelButton.addEventListener('click', () => close(null));
    root.addEventListener('click', (event) => {
      if (event.target === root) close(null);
    });
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        confirm();
      } else if (event.key === 'Escape') {
        close(null);
      }
    });

    textarea.focus();
    textarea.select();
  });
}
