import { createDialogShell } from './dialogShell';
import { t } from '../i18n';

export interface ConfirmDialogOptions {
  title: string;
  /** One paragraph per entry. */
  message: string[];
  confirmLabel: string;
  /** Styles the confirm button as a warning, for deletions and overwrites. */
  destructive?: boolean;
  /** Lucide icon before the title. */
  icon?: string | undefined;
  /** Names listed under the first paragraph, such as the items a deletion takes. */
  list?: string[] | undefined;
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
  /**
   * The buttons after Cancel, in order. The last one has focus, unless one of them deletes or
   * overwrites (`warning`): then Cancel has it, so only a deliberate press destroys anything.
   */
  choices: DialogChoice<T>[];
  /** Lucide icon before the title. */
  icon?: string | undefined;
  /** Names listed under the first paragraph, such as the items a deletion takes. */
  list?: string[] | undefined;
}

/**
 * Small centred dialog offering `choices` and Cancel. Resolves the chosen
 * value, or null when cancelled, dismissed via the backdrop or closed with Escape.
 */
export function chooseAction<T>(options: ChoiceDialogOptions<T>): Promise<T | null> {
  return new Promise((resolve) => {
    const close = (value: T | null): void => {
      root.remove();
      resolve(value);
    };

    const { root, dialog, footer } = createDialogShell(options.title, { icon: options.icon, onDismiss: () => close(null) });
    dialog.parentElement?.addClass('atlas-text-dialog--confirm');
    options.message.forEach((paragraph, index) => {
      dialog.createEl('p', { cls: 'atlas-text-dialog__message', text: paragraph });
      if (index === 0 && options.list?.length) {
        const list = dialog.createEl('ul', { cls: 'atlas-text-dialog__list' });
        for (const name of options.list) list.createEl('li', { text: name });
      }
    });

    const cancel = footer.createEl('button', { text: t('common.cancel') });
    cancel.addEventListener('click', () => close(null));
    const buttons = options.choices.map((choice) => {
      const button = footer.createEl('button', { text: choice.label });
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

    const destructive = options.choices.some((choice) => choice.style === 'warning');
    (destructive ? cancel : buttons[buttons.length - 1])?.focus();
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
    icon: options.icon,
    list: options.list,
    choices: [{ label: options.confirmLabel, value: true, style: options.destructive ? 'warning' : 'cta' }],
  });
  return confirmed === true;
}
