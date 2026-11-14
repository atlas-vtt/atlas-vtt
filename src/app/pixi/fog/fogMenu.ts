/**
 * What a right-click on the map offers of its fog: one entry. On fog it is Reveal: the piece
 * Atlas remembers there (an area) where the point lies in one that is hidden, else the body of
 * loose fog under the pointer (`fogBody.ts`). On open ground inside a remembered piece that is
 * revealed it is Hide, which hides that piece again. Nothing anywhere else.
 */
import { areaOutline, fogAreaList } from '../../fog/fogAreas';
import { areaAt, fogBodyAt } from '../../fog/fogBody';
import type { FogCoverage } from '../../fog/fogCoverage';
import { t } from '../../i18n';
import { openContextMenuGlobal, type ContextMenuEntry } from '../../react/root/ContextMenuContext';
import type { ViewAtlasStore } from '../../storeFactory';
import type { Point } from '../../types/visionTypes';
import { viewedFog } from './FogPicture';

type Store = Pick<ViewAtlasStore, 'getState'>;
/** The level's fog as it is committed; null where it cannot be worked out. */
type Coverage = () => FogCoverage | null;

/** The fog's menu at a point: its one entry, and the outlines of what the entry will act on. */
export interface FogMenu {
  readonly entries: ContextMenuEntry[];
  readonly outlines: ReadonlyArray<readonly Point[]>;
}

/** Whether the fog has a menu at the world `point`: it is in fog, or on the open ground of a remembered piece that is revealed. */
export function fogMenuOffered(store: Store, coverage: FogCoverage | null, point: Point): boolean {
  if (!coverage) return false;
  return coverage.covers(point) || areaAt(fogAreaList(viewedFog(store.getState())), point, false) !== null;
}

/** Removes the body of loose fog under `point` as the fog is now, in one undo step. */
function revealBody(store: Store, coverage: Coverage, point: Point): void {
  const fog = coverage();
  if (!fog) return;
  const state = store.getState();
  const body = fogBodyAt(fog.shape, point, fogAreaList(viewedFog(state)));
  state.addFogOperations(body.map((points) => ({ type: 'lasso', isErasing: true, points })));
}

/** The fog's menu at the world `point` of the level shown; null where it has none. */
export function fogMenuAt(store: Store, coverage: Coverage, point: Point): FogMenu | null {
  const fog = coverage();
  if (!fog) return null;
  const areas = fogAreaList(viewedFog(store.getState()));
  const covered = fog.covers(point);
  const piece = areaAt(areas, point, covered);
  if (piece) {
    const entry: ContextMenuEntry = {
      type: 'item',
      label: covered ? t('fog.reveal') : t('fog.hide'),
      icon: covered ? 'eye' : 'eye-off',
      onClick: () => { store.getState().flipFogArea(piece.id); },
    };
    return { entries: [entry], outlines: [areaOutline(piece)] };
  }
  if (!covered) return null;
  const outlines = fogBodyAt(fog.shape, point, areas);
  if (outlines.length === 0) return null;
  return { entries: [{ type: 'item', label: t('fog.reveal'), icon: 'eye', onClick: () => revealBody(store, coverage, point) }], outlines };
}

/**
 * Opens the fog's menu for the world `point` at a screen point. `mark` is told what the entry
 * will act on while the menu is open, and null once it has closed. False where the fog has no
 * menu there.
 */
export function showFogMenu(
  store: Store,
  coverage: Coverage,
  point: Point,
  screen: Point,
  mark: (outlines: ReadonlyArray<readonly Point[]> | null) => void,
): boolean {
  const menu = fogMenuAt(store, coverage, point);
  if (!menu) return false;
  mark(menu.outlines);
  if (!openContextMenuGlobal(menu.entries, screen, { onClose: () => mark(null) })) mark(null);
  return true;
}
