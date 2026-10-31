import type { TableTvSettings } from './tableTvSettings';

/** Holds what players see over the map (widgets, initiative, dice, the freeze badge), turned with the TV. */
export const PLAYER_OVERLAYS_CLASS = 'atlas-player-overlays';

/**
 * Marks the player window for its stylesheet (`player-window.scss`, `image-display.scss`): the
 * body carries the TV's turn, which the canvas, the overlays and a displayed image take, and the
 * overlay layer where the widgets sit and how large they are.
 */
export function applyTableTvLook(body: HTMLElement, overlays: HTMLElement, { rotation, widgetPosition, widgetScale }: TableTvSettings): void {
  body.style.setProperty('--atlas-tv-rotation', `${rotation}deg`);
  body.dataset.tvRotation = String(rotation);
  overlays.toggleClass(`${PLAYER_OVERLAYS_CLASS}--sideways`, rotation === 90 || rotation === 270);
  overlays.style.setProperty('--atlas-player-widget-scale', String(widgetScale));
  overlays.dataset.widgetPosition = widgetPosition;
}
