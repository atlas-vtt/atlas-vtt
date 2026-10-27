import type { ContextMenuEntry } from '../react/components/context-menu/AtlasContextMenu';
import { openContextMenuGlobal } from '../react/root/ContextMenuContext';
import { linkedMapPath } from '../services/sceneLinks';
import { runInBackground } from '../utils/backgroundTask';
import type { ViewAtlasStore } from '../storeFactory';
import type { NotePin } from '../types';
import type { SceneLevel } from '../types/sceneLevelTypes';
import { hasLevels } from '../levels/sceneLevels';
import { pinSceneLevel } from '../levels/pinSceneLevel';
import { levelLabel } from '../react/components/levels/levelEditing';
import { t } from '../i18n';

/** Reads the levels of the scene a pin links, null where it links none (`linkedSceneLevels`). */
export type PinnedSceneLevels = (pin: NotePin) => Promise<readonly SceneLevel[] | null>;

/**
 * The pin menu's choice of the level its scene opens on, for a pin linking a scene of several
 * levels (`levels`): the level last shown there, or one of them, top floor first. One undo step
 * each. None for a scene of one level.
 */
export function pinSceneLevelEntry(store: ViewAtlasStore, pin: NotePin, levels: readonly SceneLevel[] | null): ContextMenuEntry | null {
  if (!levels || !hasLevels(levels)) return null;
  const chosen = pinSceneLevel(pin, levels);
  const set = (sceneLevel: string | undefined): void => {
    if (sceneLevel !== pin.sceneLevel) store.getState().updateNotePin(pin.id, { sceneLevel });
  };
  return {
    type: 'submenu',
    label: t('pinMenu.openOnLevel'),
    icon: 'layers',
    children: [
      { type: 'item', label: t('pinMenu.levelAsLeft'), checked: chosen === null, onClick: () => set(undefined) },
      ...[...levels].reverse().map((level): ContextMenuEntry => ({
        type: 'item', label: levelLabel(levels, level), checked: chosen === level.id, onClick: () => set(level.id),
      })),
    ],
  };
}

/**
 * Opens a pin's menu of `entries` at `position`: at once for a pin that links no scene, else once
 * the linked scene's levels are read, with the level choice after the first two rows.
 */
export function openPinMenu(store: ViewAtlasStore, pin: NotePin, entries: ContextMenuEntry[], position: { x: number; y: number }, read: PinnedSceneLevels | null | undefined): void {
  if (!read || !linkedMapPath(pin.notePath)) {
    openContextMenuGlobal(entries, position);
    return;
  }
  const withLevels = async (): Promise<void> => {
    const entry = pinSceneLevelEntry(store, pin, await read(pin));
    openContextMenuGlobal(entry ? [...entries.slice(0, 2), entry, ...entries.slice(2)] : entries, position);
  };
  runInBackground(withLevels(), 'Opening a pin\'s menu');
}
