/** Popover below a token's resource bar for editing its current and maximum values. */

import { t } from '../i18n';
import { applyResourceInput } from '../resources/resourceInput';
import type { ResourceValue } from '../resources/resourceTypes';
import { createValueField, openValuePopover, type BarAnchor, type ValuePopover } from './valuePopover';

export type { BarAnchor } from './valuePopover';
export type { ResourceValue } from '../resources/resourceTypes';

export interface ResourceEditorOptions {
  /** Element the anchor is measured against (the Pixi canvas). */
  anchorEl: HTMLElement;
  anchor: BarAnchor;
  value: ResourceValue;
  resourceLabel: string;
  onCommit: (value: ResourceValue) => void;
  onClose: () => void;
}

export type ResourceEditor = ValuePopover;

/**
 * Opens the editor under the bar. Each field takes a number, or a change that starts with its sign
 * (`-10-5`, `-9/2`: `applyResourceInput`). Enter or clicking outside applies valid values, Escape
 * discards, Tab switches fields and the arrow keys step the focused value (Shift for tens).
 */
export function openResourceEditor({ anchorEl, anchor, value, resourceLabel, onCommit, onClose }: ResourceEditorOptions): ResourceEditor {
  return openValuePopover({
    anchorEl,
    anchor,
    label: t('resource.edit', { label: resourceLabel }),
    onClose,
    build: (root, close) => {
      const currentInput = createValueField(root, t('resource.current', { label: resourceLabel }), String(value.current));
      root.createSpan({ cls: 'atlas-token-value-editor__separator', text: '/' });
      const maxInput = createValueField(root, t('resource.max', { label: resourceLabel }), String(value.max));

      const parse = (): ResourceValue | null => {
        const withMax = applyResourceInput(maxInput.value, value, 'max');
        const next = withMax && applyResourceInput(currentInput.value, withMax, 'current');
        maxInput.toggleAttribute('aria-invalid', !withMax);
        currentInput.toggleAttribute('aria-invalid', !!withMax && !next);
        return next;
      };
      return {
        first: currentInput,
        commit: () => {
          const next = parse();
          if (!next) {
            (maxInput.hasAttribute('aria-invalid') ? maxInput : currentInput).focus();
            return false;
          }
          onCommit(next);
          close();
          return true;
        },
        isDirty: () => currentInput.value !== String(value.current) || maxInput.value !== String(value.max),
        onKey: (e) => {
          const input = [currentInput, maxInput].find((field) => field === e.target);
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && input) {
            e.preventDefault();
            stepInput(input, (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
          }
        },
      };
    },
  });
}

function stepInput(input: HTMLInputElement, delta: number): void {
  const parsed = /^\d+$/.exec(input.value.trim());
  if (!parsed) return;
  input.value = String(Math.max(0, Number(parsed[0]) + delta));
  input.select();
}
