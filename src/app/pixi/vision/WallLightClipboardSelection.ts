import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { levelObjects } from '../../levels/levelObjects';

/** Keeps light selection in the shared store so map clipboard shortcuts can read it. */
export class WallLightClipboardSelection {
  private selected = new Set<string>();
  private readonly unsubscribe: () => void;

  constructor(private readonly store: StoreApi<ViewAtlasState>, private readonly onChange: (ids: string[]) => void) {
    this.sync();
    this.unsubscribe = store.subscribe((state, previous) => {
      if (state.selectedIds !== previous.selectedIds) this.sync();
    });
  }

  set(ids: string[]): void {
    this.store.getState().setSelection(ids);
  }

  clear(ids: readonly string[]): void {
    const remove = new Set(ids);
    this.store.getState().setSelection(this.store.getState().selectedIds.filter((id) => !remove.has(id)));
  }

  private sync(): void {
    const state = this.store.getState();
    const ids = state.selectedIds.filter((id) => !!levelObjects(state).lights[id]);
    const next = new Set(ids);
    if (next.size === this.selected.size && [...next].every((id) => this.selected.has(id))) return;
    this.selected = next;
    this.onChange(ids);
  }

  destroy(): void {
    this.unsubscribe();
  }
}
