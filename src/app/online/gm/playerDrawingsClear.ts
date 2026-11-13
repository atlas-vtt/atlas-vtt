import { annotationStack } from '../../annotations/annotationStack';
import type { SceneState, SceneStore } from './atlasView.ts';

/** The ids of the drawings and texts `player` made on the level a scene shows, as the Draw tool's own Clear reads its level: every entry, also one no reader shows. */
export function drawnBy(state: SceneState, player: string): string[] {
  return annotationStack(state).filter(({ entry }) => entry.by === player).map(({ id }) => id);
}

/**
 * Removes every drawing and text `player` made on the level the scene shows, locked ones too, as
 * the Draw tool's Clear removes the players': one write, so one undo step. Other levels keep
 * theirs. The number removed; none while the store takes no write (the GM works on another scene).
 */
export function clearDrawnBy(store: SceneStore, player: string): number {
  const ids = drawnBy(store.getState(), player);
  if (ids.length === 0) return 0;
  const gone = new Set(ids);
  store.setState((draft: SceneState & { selectedIds?: string[] }) => {
    for (const id of gone) {
      delete draft.objects.drawings[id];
      delete draft.objects.texts[id];
    }
    if (draft.selectedIds?.some((id) => gone.has(id))) draft.selectedIds = draft.selectedIds.filter((id) => !gone.has(id));
  });
  return ids.length;
}
