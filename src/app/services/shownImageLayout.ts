import { isRecord } from '../utils/guards';

/** How much of the player view, each way, a shown picture may fill: at least and at most. */
export const MIN_SHOWN_IMAGE_SIZE = 0.25;
export const MAX_SHOWN_IMAGE_SIZE = 1;

/** Where on the player view a shown picture sits, as the players see it. */
export const SHOWN_IMAGE_PLACES = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const;
export type ShownImagePlace = typeof SHOWN_IMAGE_PLACES[number];

export interface ShownImageLayout {
  size: number;
  place: ShownImagePlace;
}

/** The picture as players saw it before it could be placed: centred, at most nine tenths of the view each way. */
export const DEFAULT_SHOWN_IMAGE_LAYOUT: ShownImageLayout = { size: 0.9, place: 'center' };

/** `value` if it is a size a picture may have, else undefined. */
export function shownImageSize(value: unknown): number | undefined {
  return typeof value === 'number' && value >= MIN_SHOWN_IMAGE_SIZE && value <= MAX_SHOWN_IMAGE_SIZE ? value : undefined;
}

/** The layout as stored; a size out of range or an unknown place reads as the default's. */
export function readShownImageLayout(stored: unknown): ShownImageLayout {
  if (!isRecord(stored)) return DEFAULT_SHOWN_IMAGE_LAYOUT;
  return {
    ...stored,
    size: shownImageSize(stored.size) ?? DEFAULT_SHOWN_IMAGE_LAYOUT.size,
    place: SHOWN_IMAGE_PLACES.find((known) => known === stored.place) ?? DEFAULT_SHOWN_IMAGE_LAYOUT.place,
  };
}

/** Puts `layout` on a shown picture's overlay, for its stylesheet (`image-display.scss`). */
export function applyShownImageLayout(overlay: HTMLElement, layout: ShownImageLayout): void {
  overlay.style.setProperty('--atlas-image-zone', String(layout.size));
  overlay.dataset.place = layout.place;
}
