import type { NotePin } from 'src/app/types';
import { mapMarkerScale } from 'src/app/pixi/utils/mapMarkerScale';

/** A map's switches for how its pins respond to zoom; saved with the map. */
export interface PinDisplaySettings {
  /** Pins with a map size grow and shrink with the map; off, every pin keeps a readable screen size. */
  scaleWithMap: boolean;
  /** Pins with a focus range show only inside it; off, every pin shows at every zoom. */
  focusLevels: boolean;
}

export const DEFAULT_PIN_DISPLAY: Readonly<PinDisplaySettings> = { scaleWithMap: true, focusLevels: true };

/** Map sizes stay within these world scales (the size a pin has at zoom 1). */
export const MIN_PIN_MAP_SCALE = 0.05;
export const MAX_PIN_MAP_SCALE = 50;

/** The pin's world scale at this zoom: its map size when it has one and the map allows it. */
export function pinScale(pin: NotePin, zoom: number, settings: PinDisplaySettings): number {
  return settings.scaleWithMap && pin.mapScale !== undefined ? pin.mapScale : mapMarkerScale(zoom);
}

/** Whether the zoom lies inside the pin's focus range (always, when the map ignores focus). */
export function isPinInFocus(pin: NotePin, zoom: number, settings: PinDisplaySettings): boolean {
  if (!settings.focusLevels) return true;
  if (pin.minZoom !== undefined && zoom < pin.minZoom) return false;
  if (pin.maxZoom !== undefined && zoom > pin.maxZoom) return false;
  return true;
}

/** Players see only the pins the GM shows them; the GM sees every pin. */
export function isPinShownTo(pin: NotePin, viewer: 'gm' | 'players'): boolean {
  return viewer === 'gm' || pin.playerVisible === true;
}

/** A map size stepped by a factor, kept in range. */
export function steppedMapScale(scale: number, factor: number): number {
  return Math.min(MAX_PIN_MAP_SCALE, Math.max(MIN_PIN_MAP_SCALE, scale * factor));
}

/** A zoom level as a percentage for menus, e.g. "35%". */
export function zoomLabel(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
