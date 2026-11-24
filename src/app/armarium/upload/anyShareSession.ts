import type { ItemShareSession } from './ItemShareSession';
import type { MusicShareSession } from './MusicShareSession';
import type { ShareSession } from './ShareSession';

/** A share the dialog shows: of a collection, of one Atlas file, or of music. */
export type AnyShareSession = ShareSession | ItemShareSession | MusicShareSession;
