import type { AtlasAddon } from 'src/app/addons/AtlasAddon';
import type { PinSearchContext, PinSearchEntry } from 'src/app/addons/hooks/pinHooks';
import { SettingsService } from 'src/app/services/SettingsService';
import type { ViewAtlasState } from 'src/app/storeFactory';
import { mapMarkerScale } from 'src/app/pixi/utils/mapMarkerScale';
import { isPinInFocus, isPinShownTo, pinScale } from './pinDisplay';
import { pinDisplayMenuEntries } from './pinDisplayMenu';
import { initialPinDisplayState, pinDisplayActions, readPinDisplay, type PinDisplaySlice } from './pinDisplayStore';
import { createPinNote, noteFileName } from './pinNoteCreation';
import { pinSettingsOf, pinSettingsSection } from './pinSettings';

declare module 'src/app/types' {
  interface NotePin {
    /** Shown in the player view; pins are the GM's alone unless this is set. */
    playerVisible?: boolean | undefined;
    /** The pin's world scale when it grows and shrinks with the map; undefined keeps a readable screen size. */
    mapScale?: number | undefined;
    /** The pin shows only from this zoom level in (for small places); undefined = at any zoom out. */
    minZoom?: number | undefined;
    /** The pin shows only up to this zoom level (for overview pins); undefined = at any zoom in. */
    maxZoom?: number | undefined;
  }
}

declare module 'src/app/addons/AtlasAddon' {
  interface AddonStateRegistry {
    pins: PinDisplaySlice;
  }
}

/** Offers "Create note" in the pin tool's search when no note has the typed name. */
function createNoteEntry({ app, query, files }: PinSearchContext): PinSearchEntry[] {
  const name = noteFileName(query);
  const taken = files.some((file) => file.extension === 'md' && file.basename.toLowerCase() === name.toLowerCase());
  if (name === '' || taken) return [];
  return [{
    label: `Create note "${name}"`,
    icon: 'file-plus',
    cls: 'pin-create-item',
    pick: async () => (await createPinNote(app, name, pinSettingsOf(SettingsService.forApp(app)).notesFolder)).path,
  }];
}

/**
 * Pins: pins that grow and shrink with the map, zoom ranges in which a pin
 * shows (focus levels), pins shown to players, and creating the note a new pin
 * links to (in the folder set under Settings → Pins). Remove this folder to go
 * back to GM-only pins at a constant screen size.
 */
const pinsAddon: AtlasAddon = {
  id: 'pins',

  settingsSections: (_app, settings) => [pinSettingsSection(settings)],

  store: {
    initialState: initialPinDisplayState,
    actions: (set) => pinDisplayActions(set),
    persist: (state: ViewAtlasState) => ({ pinDisplay: state.pinDisplay }),
    restore: (saved) => ({ pinDisplay: readPinDisplay(saved.pinDisplay) }),
  },

  pinSearchEntries: createNoteEntry,
  pinScale: (pin, zoom, state) => pinScale(pin, zoom, state.pinDisplay),
  pinVisible: (pin, viewer, zoom, state) => isPinShownTo(pin, viewer) && isPinInFocus(pin, zoom, state.pinDisplay),

  objectMenuEntries: (store, kind, id, { zoom }) => {
    const pin = kind === 'pin' ? store.getState().objects.pins[id] : undefined;
    if (!pin || zoom === undefined || store.getState().isPlayerView) return [];
    return pinDisplayMenuEntries(store, pin, zoom, mapMarkerScale(zoom));
  },
};

export default pinsAddon;
