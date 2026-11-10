import { createContext } from 'react';
import type { OffMapRolls } from '../../../services/statblockRolls';

/**
 * Where the statblocks drawn inside show the rolls no map on screen shows
 * (`statblockRolls.ts`): the statblock beside its note. Elsewhere (the hover
 * preview, the DM screen) a map is on screen and none is given.
 */
export const OffMapRollsContext = createContext<OffMapRolls | null>(null);
