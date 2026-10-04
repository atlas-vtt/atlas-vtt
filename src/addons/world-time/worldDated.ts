import type { WorldTimeSlice } from './store/worldTimeSlice';

/**
 * When a map object exists. Dates use the vault calendar's storage form
 * ("1236", "1236-04", "1240-13-02", "-3000"). An absent end falls back to the
 * linked note's frontmatter (`from`/`to`, or `born`/`died`) unless
 * `dateInherit` is false; an object with no dates shows at every viewing date.
 */
export interface WorldDated {
  from?: string;
  to?: string;
  /** False stops the object from taking dates from its linked note. */
  dateInherit?: boolean;
}

// The add-on's fields on core types exist only while this folder is installed
// (members repeated: an augmentation that only extends would be an empty interface).
declare module 'src/app/types' {
  interface NotePin { from?: string; to?: string; dateInherit?: boolean }
  interface BaseToken { from?: string; to?: string; dateInherit?: boolean }
  interface TextElement { from?: string; to?: string; dateInherit?: boolean }
  interface DrawingStroke { from?: string; to?: string; dateInherit?: boolean }
}

declare module 'src/app/addons/AtlasAddon' {
  interface AddonStateRegistry {
    'world-time': WorldTimeSlice;
  }
}
