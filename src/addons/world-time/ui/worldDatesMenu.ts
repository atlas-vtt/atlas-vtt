import type { ContextMenuEntry } from 'src/app/react/root/ContextMenuContext';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from 'src/app/storeFactory';
import type { DatedKind } from '../dating/effectiveDates';
import { worldAppOf } from '../worldApp';
import { WorldDatesModal } from './WorldDatesModal';

/**
 * The "Set dates…" context menu entry. It acts on the
 * selected objects of `kind` when the clicked one is among them, else on the
 * clicked one. Empty in the player view or before the view's world time is set up.
 */
export function worldDatesMenuEntries(store: StoreApi<ViewAtlasState>, kind: DatedKind, clickedId: string): ContextMenuEntry[] {
  const app = worldAppOf(store);
  const state = store.getState();
  if (!app || state.isPlayerView) return [];
  const record = kind === 'pin' ? state.objects.pins : kind === 'token' ? state.objects.tokens : kind === 'text' ? state.objects.texts : state.objects.drawings;
  const selected = state.selectedIds.filter((id) => record[id] !== undefined);
  const ids = selected.includes(clickedId) ? selected : [clickedId];
  return [{
    type: 'item',
    label: ids.length > 1 ? `Set dates of ${ids.length}…` : 'Set dates…',
    icon: 'calendar-clock',
    onClick: () => new WorldDatesModal(app, store, ids.map((id) => ({ kind, id }))).open(),
  }];
}
