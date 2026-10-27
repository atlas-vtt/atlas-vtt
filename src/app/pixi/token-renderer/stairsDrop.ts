import { t } from '../../i18n';
import { linkChoice, linkLandings, type LinkChoice } from '../../levels/levelLinks';
import { everyLevelObjects } from '../../levels/levelObjects';
import { levelById, resolveLevel, viewedLevelId } from '../../levels/sceneLevels';
import { levelLabel } from '../../react/components/levels/levelEditing';
import { openContextMenuGlobal, type ContextMenuEntry } from '../../react/root/ContextMenuContext';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { endHistoryTransaction, runHistoryTransaction } from '../../stores/history';
import type { TokenPlace } from '../../stores/tokenStacking';
import type { ArtFloors } from '../../levels/levelSurfaces';
import { showNotice } from '../../ui/notice';

type ViewAtlasStore = StoreApi<ViewAtlasState>;

/** Where the GM's pick of a level opens, in window points, and in which document. */
export interface StairsMenuPlace {
  x: number;
  y: number;
  doc?: Document | undefined;
}

/** The level each token stands on now. */
function levelsOf(store: ViewAtlasStore, ids: readonly string[]): Map<string, string | null> {
  const state = store.getState();
  // A token that went to another level is no longer among the objects the view shows.
  const { tokens } = everyLevelObjects(state);
  return new Map(ids.map((id) => [id, resolveLevel(state.levels, tokens[id]?.level)]));
}

/**
 * After tokens went up or down stairs, or fell through an opening: where the token dragged was the
 * only one selected, the view follows it to its level and keeps it selected; otherwise the GM is
 * told which tokens left the level shown, and for where. Tokens in `fell` fell; the others took stairs.
 */
function followClimb(store: ViewAtlasStore, before: Map<string, string | null>, selected: readonly string[], fell: ReadonlySet<string> = new Set()): void {
  const state = store.getState();
  const after = levelsOf(store, [...before.keys()]);
  const climbed = [...before].filter(([id, level]) => after.get(id) !== level);
  if (climbed.length === 0 || !state.levels) return;
  const [first] = climbed;
  const only = climbed.length === 1 && before.size === 1 && selected.length === 1 && selected[0] === first![0];
  if (only) {
    const [id] = first!;
    state.setViewedLevel(after.get(id) ?? null);
    store.getState().setSelection([id]);
    return;
  }
  const byLevel = new Map<string, { took: number; fell: number }>();
  for (const [id] of climbed) {
    const level = after.get(id);
    if (!level || level === viewedLevelId(state)) continue;
    const counts = byLevel.get(level) ?? { took: 0, fell: 0 };
    counts[fell.has(id) ? 'fell' : 'took']++;
    byLevel.set(level, counts);
  }
  for (const [level, { took, fell: fallen }] of byLevel) {
    const target = levelById(state.levels, level);
    if (!target) continue;
    const name = levelLabel(state.levels, target);
    if (took > 0) showNotice(t('levels.stairsTook', { count: took, name }));
    if (fallen > 0) showNotice(t('openings.fell', { count: fallen, name }));
  }
}

/** The menu that asks where tokens dropped into an elevator go: the levels offered, top floor first, and staying. */
function choiceEntries(store: ViewAtlasStore, choice: LinkChoice, take: (level: string) => void): ContextMenuEntry[] {
  const state = store.getState();
  const levels = state.levels ?? [];
  const here = levelById(levels, viewedLevelId(state));
  const at = levels.findIndex((level) => level.id === here?.id);
  const entries: ContextMenuEntry[] = [...choice.targets].reverse().flatMap((id) => {
    const level = levelById(levels, id);
    if (!level) return [];
    const up = levels.indexOf(level) > at;
    const name = levelLabel(levels, level);
    return [{ type: 'item' as const, label: up ? t('levels.stairsGoUp', { name }) : t('levels.stairsGoDown', { name }), icon: up ? 'arrow-up' : 'arrow-down', onClick: () => take(id) }];
  });
  if (here) entries.push({ type: 'item', label: t('levels.stairsStay', { name: levelLabel(levels, here) }), icon: 'x', onClick: () => undefined });
  return entries;
}

/**
 * Puts dragged tokens down (`dropTokens`), inside the drag's open undo step: stairs that lead to one
 * level take the tokens there in the same write. Where tokens land in stairs that offer several
 * levels (an elevator) and `menuAt` says where to ask, a menu asks the GM which; the step stays open
 * until the menu closes, so the drop and the pick are one undo step, and true is returned: the caller
 * must not close the step itself. Without `menuAt` (a pointer that was lost) those tokens stay.
 * `art` is what the view draws of the levels' maps: a token dropped where it shows a level below falls.
 */
export function dropTokensOnStairs(store: ViewAtlasStore, places: readonly TokenPlace[], menuAt: StairsMenuPlace | null, art?: ArtFloors): boolean {
  const state = store.getState();
  const selected = state.selectedIds;
  const choice = menuAt ? linkChoice(linkLandings(state, places)) : null;
  const before = levelsOf(store, places.map(({ id }) => id));
  // Tokens that land in stairs leading to one level take them; any other that changes level fell through an opening.
  const viaStairs = new Set(linkLandings(state, places).filter(({ targets }) => targets.length === 1).map(({ tokenId }) => tokenId));
  state.dropTokens(places, art);
  followClimb(store, before, selected, new Set(places.map(({ id }) => id).filter((id) => !viaStairs.has(id))));
  if (!choice || !menuAt) return false;

  let open = true;
  const take = (level: string): void => {
    const move = (): void => {
      const pickedBefore = levelsOf(store, choice.tokenIds);
      store.getState().moveTokensToLevel(choice.tokenIds, level);
      followClimb(store, pickedBefore, selected);
    };
    // The pick joins the drop's step while the menu holds it open.
    if (open) move();
    else runHistoryTransaction(store, move);
  };
  return openContextMenuGlobal(choiceEntries(store, choice, take), { x: menuAt.x, y: menuAt.y }, {
    doc: menuAt.doc,
    onClose: () => {
      if (!open) return;
      open = false;
      endHistoryTransaction(store);
    },
  });
}
