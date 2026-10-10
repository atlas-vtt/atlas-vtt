import { Notice } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import { t } from '../i18n';

/** How long the offer stays: long enough to read and reach, short enough not to stand in the way of a map that has no grid. */
const OFFER_MS = 12000;

/**
 * Tells the GM that a new scene's map showed no grid, which is why none is drawn, and offers the
 * grid alignment in the same notice: a map whose grid went unseen is one click from being aligned.
 */
export function offerGridAlignment(store: StoreApi<ViewAtlasState>): void {
  const message = createFragment();
  message.append(`${t('map.noGridFound')} `);
  const link = createEl('a', { text: t('map.alignGrid'), href: '#' });
  message.append(link);
  const notice = new Notice(message, OFFER_MS);
  link.addEventListener('click', (event) => {
    event.preventDefault();
    store.getState().setGridAlignmentOpen(true);
    notice.hide();
  });
}
