import { createDialogShell } from './dialogShell';
import { t } from '../i18n';

export interface ConfirmDialogOptions {
  title: string;
  /** One paragraph per entry. */
  message: string[];
  confirmLabel: string;
  /** Styles the confirm button as a warning, for deletions and overwrites. */
  destructive?: boolean;
}

export interface DialogChoice<T> {
  label: string;
  value: T;
  /** `cta` marks the recommended choice, `warning` one that deletes or overwrites. */
  style?: 'cta' | 'warning';
}

export interface ChoiceDialogOptions<T> {
  title: string;
  /** One paragraph per entry. */
  message: string[];
  /** The buttons after Cancel, in order; the last one has focus. */
  choices: DialogChoice<T>[];
}

/**
 * Small centred dialog offering `choices` and Cancel. Resolves the chosen
 * value, or null when cancelled, dismissed via the backdrop or closed with Escape.
 */
export function chooseAction<T>(options: ChoiceDialogOptions<T>): Promise<T | null> {
  return new Promise((resolve) => {
    const { root, dialog } = createDialogShell(options.title);
    dialog.addClass('atlas-text-dialog--confirm');
    for (const paragraph of options.message) {
      dialog.createEl('p', { cls: 'atlas-text-dialog__message', text: paragraph });
    }

    const close = (value: T | null): void => {
      root.remove();
      resolve(value);
    };

    const actions = dialog.createDiv({ cls: 'atlas-text-dialog__actions' });
    actions.createEl('button', { text: t('common.cancel') }).addEventListener('click', () => close(null));
    const buttons = options.choices.map((choice) => {
      const button = actions.createEl('button', { text: choice.label });
      if (choice.style) button.addClass(`mod-${choice.style}`);
      button.addEventListener('click', () => close(choice.value));
      return button;
    });

    root.addEventListener('click', (event) => {
      if (event.target === root) close(null);
    });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(null);
      }
    });

    buttons[buttons.length - 1]?.focus();
  });
}

/**
 * Small centred yes/no dialog. Resolves `true` when confirmed and `false` when
 * cancelled, dismissed via the backdrop or closed with Escape.
 */
export async function confirmAction(options: ConfirmDialogOptions): Promise<boolean> {
  const confirmed = await chooseAction({
    title: options.title,
    message: options.message,
    choices: [{ label: options.confirmLabel, value: true, style: options.destructive ? 'warning' : 'cta' }],
  });
  return confirmed === true;
}
