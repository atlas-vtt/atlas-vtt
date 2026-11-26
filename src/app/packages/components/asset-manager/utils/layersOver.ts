/** Layers that stand over the grid: a modal dialog, the window's picker dialogs, a menu, an Obsidian modal. */
const LAYERS = '[aria-modal="true"], .atlas-asset-manager-move-modal, .modal-container, .menu, .atlas-ctx-menu, [role="menu"]';

/**
 * Whether a dialog or menu stands over `el` (one that does not hold it): what lies under it opens no tooltip, though the
 * pointer may rest on it where a menu row was (a card's tooltip once covered the close button of the dialog that row
 * opened).
 */
export function isLayerOpenOver(el: Element): boolean {
  return Array.from(el.ownerDocument.querySelectorAll(LAYERS)).some((layer) => !layer.contains(el));
}
