import type { ViewAtlasState } from '../storeFactory';
import type { NotePin } from '../types';
import type { PinSearchContext, PinSearchEntry, PinViewer } from './hooks/pinHooks';
import { installedAddons } from './addonRegistry';

/** Pin calls core makes into add-ons; without add-ons the defaults apply. */

export function addonPinSearchEntries(context: PinSearchContext): PinSearchEntry[] {
  return installedAddons().flatMap((addon) => addon.pinSearchEntries?.(context) ?? []);
}

export function addonPinScale(pin: NotePin, zoom: number, state: ViewAtlasState): number | undefined {
  for (const addon of installedAddons()) {
    const scale = addon.pinScale?.(pin, zoom, state);
    if (scale !== undefined) return scale;
  }
  return undefined;
}

export function addonPinVisible(pin: NotePin, viewer: PinViewer, zoom: number, state: ViewAtlasState): boolean | undefined {
  for (const addon of installedAddons()) {
    const visible = addon.pinVisible?.(pin, viewer, zoom, state);
    if (visible !== undefined) return visible;
  }
  return undefined;
}
