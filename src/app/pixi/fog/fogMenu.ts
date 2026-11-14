/**
 * What a right-click on the map offers of its fog. On fog, whatever painted it: Reveal and
 * Delete, which both act on the whole body of fog under the pointer (`fogBody.ts`: fog that
 * touches is one). Delete erases it for good; Reveal erases it and remembers it (`fogAreas.ts`).
 * On the open ground of fog that was revealed so: Hide, which brings that fog back, and Delete,
 * which forgets it. Nothing anywhere else.
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

/** The fog's menu at a point: its entries, and the outlines of what they act on. */
export interface FogMenu {
  readonly entries: ContextMenuEntry[];
  readonly outlines: ReadonlyArray<readonly Point[]>;
}

/** Whether the fog has a menu at the world `point`: it is in fog, or on the open ground of fog that was revealed and is remembered. */
export function fogMenuOffered(store: Store, coverage: FogCoverage | null, point: Point): boolean {
  if (!coverage) return false;
  return coverage.covers(point) || areaAt(fogAreaList(viewedFog(store.getState())), point) !== null;
}

/** The body of fog under `point` as the fog is now. */
function bodyNow(coverage: Coverage, point: Point): Point[] | null {
  const fog = coverage();
  return fog ? fogBodyAt(fog.shape, point) : null;
}

const entry = (label: string, icon: string, onClick: () => void): ContextMenuEntry => ({ type: 'item', label, icon, onClick });
/** Delete comes last, told apart as what it is. */
const remove = (onClick: () => void): ContextMenuEntry => ({ type: 'item', label: t('common.delete'), icon: 'trash-2', destructive: true, onClick });

/** The fog's menu at the world `point` of the level shown; null where it has none. */
export function fogMenuAt(store: Store, coverage: Coverage, point: Point): FogMenu | null {
  const fog = coverage();
  if (!fog) return null;
  if (fog.covers(point)) {
    const body = fogBodyAt(fog.shape, point);
    if (!body) return null;
    return {
      entries: [
        entry(t('fog.reveal'), 'eye', () => {
          const now = bodyNow(coverage, point);
          if (now) store.getState().revealFogGround([now]);
        }),
        remove(() => {
          const now = bodyNow(coverage, point);
          if (now) store.getState().addFogOperation({ type: 'lasso', isErasing: true, points: now });
        }),
      ],
      outlines: [body],
    };
  }
  const revealed = areaAt(fogAreaList(viewedFog(store.getState())), point);
  if (!revealed) return null;
  return {
    entries: [
      entry(t('fog.hide'), 'eye-off', () => { store.getState().hideFogArea(revealed.id); }),
      remove(() => { store.getState().forgetFogArea(revealed.id); }),
    ],
    outlines: [areaOutline(revealed)],
  };
}

/**
 * Opens the fog's menu for the world `point` at a screen point. `mark` is told what its entries
 * act on while the menu is open, and null once it has closed. False where the fog has no menu there.
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
