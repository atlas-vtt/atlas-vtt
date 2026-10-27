import { MAX_LIGHT_ZONES } from '../../lighting/lightZones';
import { showNotice } from '../../ui/notice';
import { t } from '../../i18n';
import { MAX_LEVEL_SURFACES } from '../../levels/levelSurfaces';

/**
 * Tells the GM that this map is drawn without dynamic lighting; `canRetry` when the engine was
 * held back because its last start never finished, which switching lighting off and on overrides.
 */
export function showLightingUnavailableNotice(canRetry: boolean): void {
  const retry = canRetry ? ' Switch dynamic lighting off and on to try again.' : '';
  showNotice(`Dynamic lighting could not run on this graphics device. Atlas shows line of sight without light and shadow.${retry}`, 15000);
}

/** Tells the GM that undo or redo changed the explored memory, when the canvas does not show it. */
export function showExploredTravelNotice(undone: boolean): void {
  showNotice(undone ? 'Undid an edit of the explored memory.' : 'Redid an edit of the explored memory.');
}

/** Tells the GM that the map holds as many light zones as it may, when another is begun. */
export function showZonesFullNotice(): void {
  showNotice(`A map can have ${MAX_LIGHT_ZONES} light zones. Delete one to draw another.`);
}

/** Tells the GM that the level shown holds as many openings and floors as it may, when another is begun. */
export function showSurfacesFullNotice(): void {
  showNotice(t('openings.full', { count: MAX_LEVEL_SURFACES }));
}
