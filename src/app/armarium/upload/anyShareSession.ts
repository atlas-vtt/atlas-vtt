import type { ItemShareSession } from './ItemShareSession';
import type { ShareSession } from './ShareSession';

/** A share the dialog shows: of a collection, or of one Atlas file. */
export type AnyShareSession = ShareSession | ItemShareSession;
