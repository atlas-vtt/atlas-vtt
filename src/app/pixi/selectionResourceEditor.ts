/** The popover in which the GM types one change for a resource of every selected token. */

import { t } from '../i18n';
import { parseResourceInput } from '../resources/resourceInput';
import { createValueField, openValuePopover, type ValuePopover } from './valuePopover';

export interface SelectionResourceEditorOptions {
  /** Element the point is measured against (the Pixi canvas). */
  anchorEl: HTMLElement;
  /** Where the menu was opened, in client pixels: the popover hangs below it. */
  at: { x: number; y: number };
  resourceName: string;
  /** How many of the selected tokens hold the resource. */
  count: number;
  /** The amount to add to each token's value; negative takes it away. */
  onCommit: (amount: number) => void;
  onClose?: () => void;
}

/**
 * Opens the popover. It takes only a change, which starts with its sign (`-8`, `+5`, `-9/2` for
 * halved damage: `parseResourceInput`): a number alone would set every token to it, which an
 * area's damage never means, so it is refused.
 */
export function openSelectionResourceEditor({ anchorEl, at, resourceName, count, onCommit, onClose }: SelectionResourceEditorOptions): ValuePopover {
  const rect = anchorEl.getBoundingClientRect();
  const label = t('resource.changeSelection', { label: resourceName, count });
  return openValuePopover({
    anchorEl,
    anchor: { x: at.x - rect.left, top: at.y - rect.top, bottom: at.y - rect.top },
    label,
    className: 'atlas-token-value-editor--selection',
    onClose: () => onClose?.(),
    build: (root, close) => {
      root.createSpan({ cls: 'atlas-token-value-editor__label', text: label });
      const input = createValueField(root, t('resource.changeAmount', { label: resourceName }), '', 'atlas-token-value-editor__input--wide');
      input.placeholder = t('resource.changePlaceholder');
      return {
        first: input,
        isDirty: () => input.value.trim() !== '',
        commit: () => {
          const typed = parseResourceInput(input.value);
          input.toggleAttribute('aria-invalid', typed?.relative !== true);
          if (typed?.relative !== true) {
            input.focus();
            return false;
          }
          onCommit(typed.amount);
          close();
          return true;
        },
      };
    },
  });
}

/**
 * The selection's popover of one map view: at most one at a time, opened once the menu that chose
 * it has closed, and closed with the view (`close`).
 */
export class SelectionResourceEditing {
  private popover: ValuePopover | null = null;
  private pending: number | null = null;

  constructor(private readonly anchorEl: HTMLElement) {}

  /**
   * Opens the popover in a task of its own: it is chosen inside the menu, whose focus trap takes
   * focus back from anything focused while the menu is still open, so the field would lose it.
   */
  open(options: Omit<SelectionResourceEditorOptions, 'anchorEl' | 'onClose'>): void {
    this.close();
    this.pending = this.anchorEl.win.setTimeout(() => {
      this.pending = null;
      const popover = openSelectionResourceEditor({
        ...options,
        anchorEl: this.anchorEl,
        onClose: () => { if (this.popover === popover) this.popover = null; },
      });
      this.popover = popover;
    }, 0);
  }

  close(): void {
    if (this.pending !== null) this.anchorEl.win.clearTimeout(this.pending);
    this.pending = null;
    const popover = this.popover;
    this.popover = null;
    popover?.close();
  }
}
