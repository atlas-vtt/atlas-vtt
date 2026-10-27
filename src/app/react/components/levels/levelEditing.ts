import { t } from '../../../i18n';
import { withLevelAdded, withLevelChanged, withLevelDeleted, withLevelRoof, withLevelSight, withLevelsReordered, type LevelScene } from '../../../levels/levelEdits';
import { firstLevelId, viewedLevelId } from '../../../levels/sceneLevels';
import type { ViewAtlasStore } from '../../../storeFactory';
import { getHistoryStore, runUntracked } from '../../../stores/history';
import type { LevelElevation, SceneLevel } from '../../../types/sceneLevelTypes';
import { chooseAction } from '../../../ui/confirmDialog';
import { showNotice } from '../../../ui/notice';

/**
 * Edits of a scene's levels from its settings. Levels are scene settings, like its lighting:
 * no edit of them is an undo step. An edit that also moves objects or the first level's map
 * (reordering past the first level, deleting a level) clears the history, whose steps name the
 * levels as they were.
 */

/** What a level is called: its name, or its place among the scene's levels while it has none. */
export function levelLabel(levels: readonly SceneLevel[], level: SceneLevel): string {
  return level.name?.trim() || t('levels.newName', { n: levels.indexOf(level) + 1 });
}

/** The label of level `id` as the scene names it now, for a message about it. */
function labelOf(store: ViewAtlasStore, id: string): string {
  const levels = store.getState().levels ?? [];
  const level = levels.find((entry) => entry.id === id);
  return level ? levelLabel(levels, level) : id;
}

/**
 * Runs an edit of level `name`'s scene. Every edit works out the whole result before it writes it
 * in one store write, so one that fails has changed nothing; the GM is told, never left with a
 * button that did nothing. Returns whether it was made.
 */
function editLevels(name: string, edit: () => void): boolean {
  try {
    edit();
    return true;
  } catch (error) {
    console.error(`[Atlas] Editing the level ${name} failed:`, error);
    showNotice(t('levels.editFailed', { name }));
    return false;
  }
}

/** Adds a level on top with `background` and shows it; a scene without levels gets its first one too. */
export function addLevel(store: ViewAtlasStore, background: string | null): void {
  const state = store.getState();
  const count = (state.levels?.length || 1) + 1;
  const name = t('levels.newName', { n: count });
  editLevels(name, () => {
    const levels = withLevelAdded(state, { name, background }, t('levels.firstName'));
    runUntracked(store, () => state.setLevels(levels));
    store.getState().setViewedLevel(levels.at(-1)?.id ?? null);
  });
}

/** Renames level `id`, or changes its elevation. */
export function changeLevel(store: ViewAtlasStore, id: string, changes: { name?: string; elevation?: LevelElevation }): void {
  const { levels, setLevels } = store.getState();
  if (!levels) return;
  editLevels(labelOf(store, id), () => runUntracked(store, () => setLevels(withLevelChanged(levels, id, changes))));
}

/**
 * Level `id` sees level `below` through its openings, or not. Seeing every level below again is
 * written as no list at all, so a level added below later is seen too.
 */
export function setLevelSees(store: ViewAtlasStore, id: string, below: string, seen: boolean): void {
  const { levels, setLevels } = store.getState();
  const level = levels?.find((entry) => entry.id === id);
  if (!levels || !level) return;
  const lower = levels.slice(0, levels.indexOf(level)).map((entry) => entry.id);
  const current = level.sees ? lower.filter((entry) => level.sees!.includes(entry)) : lower;
  const next = seen ? [...new Set([...current, below])] : current.filter((entry) => entry !== below);
  const sees = lower.every((entry) => next.includes(entry)) ? undefined : lower.filter((entry) => next.includes(entry));
  runUntracked(store, () => setLevels(withLevelSight(levels, id, { sees })));
}

/** The transparent parts of level `id`'s map are openings to the levels below, or floor. */
export function setLevelOpenArt(store: ViewAtlasStore, id: string, open: boolean): void {
  const { levels, setLevels } = store.getState();
  if (levels) runUntracked(store, () => setLevels(withLevelSight(levels, id, { openArt: open })));
}

/**
 * Draws `foreground` as the roof of level `id` (null: the scene's only level, made where the scene has
 * none), or none; a scene setting like a level's name, never an undo step.
 */
export function setLevelRoof(store: ViewAtlasStore, id: string | null, foreground: string | null): void {
  const state = store.getState();
  const levels = withLevelRoof(state, id, foreground, t('levels.firstName'));
  if (levels) runUntracked(store, () => state.setLevels(levels));
}

/** Shows `background` on level `id`; the first level's is the scene's own background, an edit like any other of it. */
export function changeLevelBackground(store: ViewAtlasStore, id: string, background: string | null): void {
  const state = store.getState();
  if (!state.levels) return;
  editLevels(labelOf(store, id), () => {
    if (id === firstLevelId(state.levels)) state.setBackground(background);
    else runUntracked(store, () => state.setLevels(withLevelChanged(state.levels!, id, { background })));
  });
}

/** Writes an edit that moved objects or the first level's map, and lets go of the history that knew them otherwise. */
function applyScene(store: ViewAtlasStore, before: LevelScene, after: LevelScene): void {
  if (after === before) return;
  runUntracked(store, () => store.getState().applyLevelScene(after));
  if (after.objects !== before.objects || after.background !== before.background) getHistoryStore(store)?.getState().clear();
}

/** Moves level `id` one place up (towards the top floor) or down. */
export function moveLevel(store: ViewAtlasStore, id: string, direction: 1 | -1): void {
  const state = store.getState();
  const ids = (state.levels ?? []).map((level) => level.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to]!, ids[from]!];
  editLevels(labelOf(store, id), () => applyScene(store, state, withLevelsReordered(state, ids)));
}

/**
 * Asks whether the objects of level `id` move to the level next to it or go with it, then deletes
 * the level. A view that showed it shows that neighbour. Returns the neighbour once the level is
 * deleted, else null.
 */
export async function deleteLevel(store: ViewAtlasStore, id: string): Promise<string | null> {
  const levels = store.getState().levels ?? [];
  const index = levels.findIndex((level) => level.id === id);
  const level = levels[index];
  const target = levels[index - 1] ?? levels[index + 1];
  if (!level || !target) return null;
  const choice = await chooseAction<'move' | 'delete'>({
    title: t('levels.deleteTitle', { name: levelLabel(levels, level) }),
    message: [t('levels.deleteBody', { target: levelLabel(levels, target) })],
    choices: [
      { label: t('levels.deleteWithObjects'), value: 'delete', style: 'warning' },
      { label: t('levels.deleteMove', { target: levelLabel(levels, target) }), value: 'move', style: 'cta' },
    ],
  });
  if (!choice) return null;
  const state = store.getState();
  const wasShown = viewedLevelId(state) === id;
  const deleted = editLevels(levelLabel(levels, level), () => applyScene(store, state, withLevelDeleted(state, id, choice === 'move' ? target.id : null)));
  if (!deleted) return null;
  if (wasShown) store.getState().setViewedLevel(target.id);
  return target.id;
}
