/**
 * Which map objects are hidden or ghosted (drawn faintly for the GM only), by
 * object id. Any add-on can contribute a mask under its own source key; the
 * renderers read the combined `objectMask`. Never saved.
 */
export interface ObjectMask {
  hidden: Record<string, true>;
  ghost: Record<string, true>;
}

export const EMPTY_OBJECT_MASK: Readonly<ObjectMask> = Object.freeze({ hidden: Object.freeze({}), ghost: Object.freeze({}) });

export type ObjectMaskState = 'visible' | 'ghost' | 'hidden';

export function objectMaskStateOf(mask: ObjectMask, id: string): ObjectMaskState {
  if (mask.hidden[id]) return 'hidden';
  return mask.ghost[id] ? 'ghost' : 'visible';
}

/** Hidden wins over ghost; an object any source hides is hidden. */
export function combineObjectMasks(sources: Readonly<Record<string, ObjectMask>>): ObjectMask {
  const masks = Object.values(sources);
  if (masks.length === 0) return EMPTY_OBJECT_MASK;
  if (masks.length === 1) return masks[0]!;
  const combined: ObjectMask = { hidden: {}, ghost: {} };
  for (const mask of masks) Object.assign(combined.hidden, mask.hidden);
  for (const mask of masks) {
    for (const id of Object.keys(mask.ghost)) if (!combined.hidden[id]) combined.ghost[id] = true;
  }
  return combined;
}
