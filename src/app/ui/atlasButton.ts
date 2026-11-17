import { setIcon, type Setting } from 'obsidian';
import { buttonClasses, type ButtonSize, type ButtonVariant } from '../packages/components/primitives/buttonClasses';

export interface AtlasButtonOptions {
  text?: string;
  /** Lucide icon, before the text or alone. */
  icon?: string;
  /** Names a button without text for screen readers. */
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  cls?: string[];
  onClick?: (event: MouseEvent) => void;
}

/**
 * Atlas' button built with the DOM: the classes and look of the React `Button`, so it must stand
 * inside `.atlas-vtt-plugin`. Never Obsidian's `ButtonComponent` or a bare `<button>`.
 */
export function createAtlasButton(parent: HTMLElement, options: AtlasButtonOptions): HTMLButtonElement {
  const button = parent.createEl('button', {
    cls: [...buttonClasses(options.variant, options.size), ...(options.cls ?? [])],
    attr: { type: 'button' },
  });
  if (options.icon) setIcon(button, options.icon);
  if (options.text) button.appendText(options.text);
  if (options.label) button.setAttribute('aria-label', options.label);
  if (options.onClick) button.addEventListener('click', options.onClick);
  return button;
}

/**
 * Atlas' button in a row of Obsidian's settings, in place of `addButton` and `addExtraButton`. Its
 * host lends it Atlas' scope and leaves the row's layout to it; an icon button's label is shown as
 * Obsidian's tooltip there, like every other control in the settings.
 */
export function addSettingButton(setting: Setting, options: AtlasButtonOptions): HTMLButtonElement {
  const host = setting.controlEl.createSpan({ cls: 'atlas-vtt-plugin atlas-setting-control' });
  const iconOnly = options.icon !== undefined && options.text === undefined;
  return createAtlasButton(host, { variant: iconOnly ? 'ghost' : 'outline', size: iconOnly ? 'icon' : 'sm', ...options });
}
