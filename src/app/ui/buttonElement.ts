import { setIcon } from 'obsidian';
import { buttonClasses, type ButtonSize, type ButtonVariant } from '../packages/components/primitives/buttonClasses';

export interface ButtonElementOptions {
  text?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Classes of the caller's own, after Atlas' button classes. */
  cls?: string | readonly string[];
  /** Lucide icon before the text. */
  icon?: string;
  attr?: Record<string, string>;
  onClick?: (event: MouseEvent) => void;
}

/**
 * `Button` for UI built with the DOM: the same element and classes (`btn btn--<variant>`), so the
 * stylesheet draws both alike. It must stand inside `.atlas-vtt-plugin`, as `Button` does.
 */
export function createButton(parent: HTMLElement, options: ButtonElementOptions = {}): HTMLButtonElement {
  const { text, variant, size, cls = [], icon, attr = {}, onClick } = options;
  const button = parent.createEl('button', {
    cls: [...buttonClasses(variant, size), ...(typeof cls === 'string' ? [cls] : cls)],
    attr: { type: 'button', ...attr },
  });
  if (icon) setIcon(button, icon);
  if (text !== undefined) button.appendText(text);
  if (onClick) button.addEventListener('click', onClick);
  return button;
}
