import { createDialogShell } from './dialogShell';
import { createAtlasButton } from './atlasButton';
import type { ButtonVariant } from '../packages/components/primitives/buttonClasses';
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

/** The button each choice style takes; a choice without one looks like Cancel. */
export const CHOICE_VARIANTS: Readonly<Record<NonNullable<DialogChoice<unknown>['style']> | 'plain', ButtonVariant>> = {
  cta: 'default',
  warning: 'destructive',
  plain: 'outline',
};

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

    const cancel = createAtlasButton(footer, { text: t('common.cancel'), variant: 'outline', size: 'sm', onClick: () => close(null) });
    const buttons = options.choices.map((choice) =>
      createAtlasButton(footer, { text: choice.label, variant: CHOICE_VARIANTS[choice.style ?? 'plain'], size: 'sm', onClick: () => close(choice.value) }));

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

/** Atlas' button for a choice's style: filled for the recommended one, red for one that deletes or overwrites. */
export function choiceVariant(style: 'cta' | 'warning' | undefined): ButtonVariant {
  if (style === 'cta') return 'default';
  return style === 'warning' ? 'destructive' : 'outline';
}
