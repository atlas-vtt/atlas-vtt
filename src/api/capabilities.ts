import type { AtlasCapability } from './types/common';

/** The capabilities whose groups have landed; `has()` answers from this list only. */
export const LANDED_CAPABILITIES: readonly AtlasCapability[] = ['views', 'presentation', 'rules', 'settings', 'storage'];
