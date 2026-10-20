import { combineObjectMasks, EMPTY_OBJECT_MASK, type ObjectMask } from '../addons/objectMask';

/** Store state core keeps for add-ons (`src/addons/*`); derived, never saved. */
export interface AddonSlice {
  /** Objects add-ons hide or ghost, combined over all sources (see `addons/objectMask.ts`). */
  objectMask: ObjectMask;
  objectMaskSources: Record<string, ObjectMask>;
  /** Sets (or with null removes) one source's mask. */
  setObjectMask: (source: string, mask: ObjectMask | null) => void;
  /**
   * Bumped when something add-on hooks read changed outside the map objects
   * (a map-wide display switch, the scene's light), so renderers that consult
   * those hooks redraw. Add-on actions bump it in the same update.
   */
  addonRevision: number;
  bumpAddonRevision: () => void;
}

type AddonState = Pick<AddonSlice, 'objectMask' | 'objectMaskSources' | 'addonRevision'>;
type ImmerSet = (fn: (draft: AddonState) => void) => void;

export function createInitialAddonState(): AddonState {
  return { objectMask: EMPTY_OBJECT_MASK, objectMaskSources: {}, addonRevision: 0 };
}

export function createAddonActions(set: ImmerSet): Pick<AddonSlice, 'setObjectMask' | 'bumpAddonRevision'> {
  return {
    setObjectMask: (source, mask) => set((draft) => {
      const sources = { ...draft.objectMaskSources };
      if (mask) sources[source] = mask;
      else delete sources[source];
      draft.objectMaskSources = sources;
      draft.objectMask = combineObjectMasks(sources);
    }),
    bumpAddonRevision: () => set((draft) => {
      draft.addonRevision += 1;
    }),
  };
}
