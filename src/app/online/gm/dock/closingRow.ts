import { textButton } from './controls.ts';

import { UPDATE_AFTER_TEXT } from '../gmLevel.ts';

export interface ClosingRowActions {
  /** Opens the account page of the website, where access to online play comes from. */
  openAccountPage(): void;
  /** Opens Atlas's page in Obsidian, where Obsidian installs the update. */
  update(): void;
}

/**
 * Under a surface's header while the relay has said that the table closes because its account may no
 * longer host: when, in the GM's own time, and the way to the account page. The line goes when the
 * relay takes the word back.
 */
export function renderClosingRow(layer: HTMLElement, closing: string | null, actions: ClosingRowActions): void {
  if (closing === null) return;
  const row = layer.createDiv({ cls: 'atlas-online-closing', attr: { role: 'status' } });
  row.createSpan({ cls: 'atlas-online-closing__text', text: closing });
  textButton(row, 'Account page', () => actions.openAccountPage()).dataset.focusKey = 'account-page';
}

/** Under a surface's header while the relay let this Atlas in although it needs a newer one: players sit at the table, so the game goes on. */
export function renderUpdateRow(layer: HTMLElement, show: boolean, actions: ClosingRowActions): void {
  if (!show) return;
  const row = layer.createDiv({ cls: 'atlas-online-closing', attr: { role: 'status' } });
  row.createSpan({ cls: 'atlas-online-closing__text', text: UPDATE_AFTER_TEXT });
  textButton(row, 'Update', () => actions.update()).dataset.focusKey = 'update';
}
