import type { TemplateBlock, TemplateField } from '../../model/templateTypes';
import type { BlockChrome, BlockDecoration } from '../../render/blockChrome';
import { blockDescription } from './blockNames';
import { primaryOf, type BlockSelection } from './selection';

/** Set on a block frame the template editor dresses; the canvas styles and finds blocks by it. */
export const SELECTED_ATTRIBUTE = 'data-te-selected';

/**
 * How the template editor dresses the card's blocks (§7.6) through the
 * renderer's seam. Only attributes: selection is a CSS outline, focus a roving
 * `tabIndex` (the primary block is the canvas's one tab stop), and every other
 * piece of chrome (tags, the label input, the `+` line, the toolbar) floats in
 * layers of its own, so no block measures differently with chrome than without.
 */
export function editorChrome(selection: BlockSelection, fields: readonly TemplateField[]): BlockChrome {
  const selected = new Set(selection);
  const primary = primaryOf(selection);
  return {
    decorate(block: TemplateBlock): BlockDecoration {
      const isSelected = selected.has(block.id);
      return {
        tabIndex: block.id === primary ? 0 : -1,
        role: 'group',
        attributes: {
          [SELECTED_ATTRIBUTE]: isSelected ? (block.id === primary ? 'primary' : 'sibling') : undefined,
          'aria-roledescription': 'block',
          'aria-label': blockDescription(block, fields),
          'aria-current': isSelected ? 'true' : undefined,
        },
      };
    },
  };
}

/** A block's frame in the canvas. */
export function blockFrame(container: ParentNode, id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-block-id="${id.replace(/["\\]/g, '\\$&')}"]`);
}

/** The innermost block a DOM node lies in, within `container`. */
export function frameAt(node: EventTarget | null, container: HTMLElement): HTMLElement | null {
  const element = node as { closest?: (selector: string) => Element | null } | null;
  if (typeof element?.closest !== 'function') return null;
  const frame = element.closest('[data-block-id]');
  return frame?.instanceOf(HTMLElement) && container.contains(frame) ? frame : null;
}
