import type { AddonImmerSet } from 'src/app/addons/AtlasAddon';
import { isRecord } from 'src/app/services/assetMetadataGuards';
import { DEFAULT_PIN_DISPLAY, type PinDisplaySettings } from './pinDisplay';

/** The map's pin display switches, saved with the map. */
export interface PinDisplaySlice {
  pinDisplay: PinDisplaySettings;
  setPinDisplay: (changes: Partial<PinDisplaySettings>) => void;
}

export function initialPinDisplayState(): Pick<PinDisplaySlice, 'pinDisplay'> {
  return { pinDisplay: { ...DEFAULT_PIN_DISPLAY } };
}

export function pinDisplayActions(set: AddonImmerSet): Pick<PinDisplaySlice, 'setPinDisplay'> {
  return {
    setPinDisplay: (changes) => set((draft) => {
      draft.pinDisplay = { ...draft.pinDisplay, ...changes };
      // Pins are sized and shown through hooks that read these switches
      draft.addonRevision += 1;
    }),
  };
}

/** A map's saved switches; missing or broken ones take the defaults. */
export function readPinDisplay(value: unknown): PinDisplaySettings {
  const saved = isRecord(value) ? value : {};
  return {
    scaleWithMap: typeof saved.scaleWithMap === 'boolean' ? saved.scaleWithMap : DEFAULT_PIN_DISPLAY.scaleWithMap,
    focusLevels: typeof saved.focusLevels === 'boolean' ? saved.focusLevels : DEFAULT_PIN_DISPLAY.focusLevels,
  };
}
