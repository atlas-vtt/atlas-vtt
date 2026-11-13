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

/**
 * Notices when everything a player drew on the level a scene shows is gone at once: the GM
 * cleared it (the Draw tool's Clear, a player's entry in the dock). A drawing that player is
 * making just then is no scene object, so no Clear reaches it; whoever follows the players'
 * drawings under way drops it on this word.
 */
export class ClearedPlayers {
  private drawings: unknown = null;
  private texts: unknown = null;
  private readonly counts = new Map<string, number>();

  /** The players who had drawings or texts on the level at the last look and have none now. */
  look(state: SceneState): Set<string> {
    const cleared = new Set<string>();
    if (state.objects.drawings === this.drawings && state.objects.texts === this.texts) return cleared;
    this.drawings = state.objects.drawings;
    this.texts = state.objects.texts;
    const counts = new Map<string, number>();
    for (const { entry } of annotationStack(state)) if (typeof entry.by === 'string' && entry.by !== '') counts.set(entry.by, (counts.get(entry.by) ?? 0) + 1);
    for (const player of this.counts.keys()) if (!counts.has(player)) cleared.add(player);
    this.counts.clear();
    for (const [player, count] of counts) this.counts.set(player, count);
    return cleared;
  }

  /** Another scene: nobody has drawn on it yet. */
  reset(): void {
    this.drawings = this.texts = null;
    this.counts.clear();
  }
}
