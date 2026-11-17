import { createDialogShell } from './dialogShell';
import { createAtlasButton } from './atlasButton';
import { t } from '../i18n';

export interface TextInputDialogOptions {
  title: string;
  confirmLabel: string;
  initialValue?: string;
  placeholder?: string;
  /** Confirming an empty field resolves with `''` instead of `null`: empty means something (a name falling back to its note's). */
  allowEmpty?: boolean;
}

/**
 * Small centred dialog with a textarea. Resolves with the trimmed text, or
 * `null` when cancelled or left empty (`''` for empty with `allowEmpty`). Enter confirms, Shift+Enter adds a line.
 */
export function promptForText(options: TextInputDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const close = (result: string | null): void => {
      root.remove();
      resolve(result);
    };
    const { root, dialog, footer } = createDialogShell(options.title, { onDismiss: () => close(null) });

    const textarea = dialog.createEl('textarea', { cls: 'atlas-text-dialog__input' });
    textarea.value = options.initialValue ?? '';
    if (options.placeholder) textarea.placeholder = options.placeholder;

    const confirm = (): void => {
      const text = textarea.value.trim();
      close(text !== '' || options.allowEmpty === true ? text : null);
    };
    createAtlasButton(footer, { text: t('common.cancel'), variant: 'outline', size: 'sm', onClick: () => close(null) });
    createAtlasButton(footer, { text: options.confirmLabel, size: 'sm', onClick: confirm });

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
