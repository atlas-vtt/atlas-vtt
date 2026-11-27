/**
 * The layers that stand over the panel, as Obsidian and Atlas draw them: a press inside one is that
 * layer's, never one outside the panel, and while one that takes keys stands, Escape is its too.
 * Obsidian's modals (the command palette, every `Modal`) carry no `aria-modal`, so they are named by class.
 */
const LAYERS: readonly { readonly selector: string; readonly keys: boolean }[] = [
  { selector: '.modal-container', keys: true },
  { selector: '[aria-modal="true"]', keys: true },
  { selector: '.menu', keys: true },
  { selector: '.suggestion-container', keys: true },
  { selector: '.popover', keys: false },
  { selector: '.notice-container', keys: false },
];

const PRESS_LAYERS = LAYERS.map((layer) => layer.selector).join(', ');
const KEY_LAYERS = LAYERS.filter((layer) => layer.keys).map((layer) => layer.selector).join(', ');

/** Whether a press on `target` lands in a layer over the panel. */
export function pressedAbove(target: Partial<Pick<Element, 'closest'>>): boolean {
  return target.closest?.(PRESS_LAYERS) != null;
}

/** Whether a layer that takes keys stands over `panel`: one that is neither the panel's own nor around it. */
export function keysAbove(panel: HTMLElement): boolean {
  return Array.from(panel.ownerDocument.querySelectorAll(KEY_LAYERS)).some((layer) => !layer.contains(panel) && !panel.contains(layer));
}
