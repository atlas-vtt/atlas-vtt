import { renderAccountMenu, type AccountActions } from './accountMenu.ts';

export { accountActions } from './accountMenu.ts';
import { renderClosingRow, renderUpdateRow } from './closingRow.ts';
import { inviteRow, surfaceHeader, textButton } from './controls.ts';
import { gateEntries, renderCodeRow, renderPausedRow, type GateRowActions } from './gateRows.ts';
import { renderImageRow, type ImageRowActions } from './imageRow.ts';
import type { MenuModel } from './panelModel.ts';
import { addPlayerRow, linkEntries, type AddPlayerActions, type LinkActions } from './prompts.ts';

/** What the menu's buttons do. */
export interface MenuActions extends AccountActions, GateRowActions, ImageRowActions, AddPlayerActions, LinkActions {
  stop(): void;
  /** Shows this map on Atlas's player view, which players online see too. */
  share(): void;
  copy(): Promise<boolean>;
  /** Opens or closes the invite link's QR card. */
  toggleQr(): void;
}

/** The control focused before a redraw, so a redraw keeps it. */
function keep(layer: HTMLElement): () => void {
  const active = layer.doc.activeElement;
  const focus = active !== null && layer.contains(active) ? active.getAttribute('data-focus-key') : null;
  return () => {
    if (focus === null) return;
    // A control that left with the state hands focus to the first one there is now.
    const target = layer.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focus)}"]`) ?? layer.querySelector<HTMLElement>('button:not([disabled]), input');
    target?.focus({ preventScroll: true });
  };
}

/** The menu's width; it never grows wider than the row it hangs from. */
export const MENU_WIDTH = 300;

/**
 * The short-lived menu of a control without players: start a table, or, once it runs, its header
 * (status, "…" with the gates, and Stop), the line of a table that closes for want of access, the line of a pause, the line of a shown image, Copy invite link, the join
 * code, Add player, and Show this map to players while players see another. Nobody is at the table yet, so Stop asks nothing. It turns into the panel when the
 * first player joins.
 */
export function renderMenu(layer: HTMLElement, model: MenuModel, actions: MenuActions): void {
  const restore = keep(layer);
  const redraw = (): void => renderMenu(layer, model, actions);
  layer.empty();
  layer.addClass('atlas-online-menu');
  if (model.kind === 'start') {
    renderAccountMenu(layer, model.account, model.starting, model.lost, actions, model.outdated, model.campaigns);
    return restore();
  }
  surfaceHeader(layer, model.title, model.status, model.status.tone === 'green' ? null : model.status.text, gateEntries(model.gate, actions), () => actions.stop(), null);
  renderClosingRow(layer, model.closing, actions);
  renderUpdateRow(layer, model.updateAfter, actions);
  renderPausedRow(layer, model.gate, actions);
  renderImageRow(layer, model.imageShown, actions);
  if (model.link !== null) inviteRow(layer, () => actions.copy(), { open: model.qr, toggle: () => actions.toggleQr() }, linkEntries(layer, actions, redraw));
  renderCodeRow(layer, model.gate, actions);
  addPlayerRow(layer, actions, redraw);
  if (!model.isShared) {
    const share = textButton(layer, 'Show this map to players', () => actions.share());
    share.dataset.focusKey = 'share';
    share.addClass('atlas-online-corner-button');
  }
  restore();
}
