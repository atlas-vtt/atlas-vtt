import type { TableTv } from './tableTvFrame';

/** Holds what players see over the map (widgets, initiative, dice, the freeze badge), turned with the TV. */
export const PLAYER_OVERLAYS_CLASS = 'atlas-player-overlays';

/**
 * Marks the player window for its stylesheet (`player-window.scss`, `image-display.scss`): the
 * body carries the TV's turn, which the canvas, the overlays and a displayed image take.
 */
export function applyTableTvLook(body: HTMLElement, overlays: HTMLElement, tv: TableTv): void {
  const { rotation } = tv;
  body.style.setProperty('--atlas-tv-rotation', `${rotation}deg`);
  body.dataset.tvRotation = String(rotation);
  overlays.toggleClass(`${PLAYER_OVERLAYS_CLASS}--sideways`, rotation === 90 || rotation === 270);
}
