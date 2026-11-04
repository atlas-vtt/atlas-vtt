import type { ResourceDefinition } from '../../resources/resourceTypes';
import type { TokenVitals } from '../../services/statblockVitalsSync';
import type { StatblockPortrait } from './shared/tokenPortrait';

/** Where a statblock shows: a pane or the note (`full`), the hover preview, a DM screen feed. */
export type SheetVariant = 'full' | 'hover' | 'feed';

/**
 * `view` hides blocks whose fields are empty. `editing` (the statblock pane and
 * the template editor) shows a prompt in their place instead, so an empty
 * statblock reads like a page with blanks.
 */
export type SheetMode = 'view' | 'editing';

/** The token a statblock is shown for (the DM screen, a token's hover preview). */
export interface StatblockTokenContext extends Pick<TokenVitals, 'id' | 'name' | 'imagePath' | 'resources'> {
  /** The resources of its collection, where known: a number one of them reads is that resource, never one the template tracks. */
  definitions?: readonly ResourceDefinition[] | undefined;
  /** The token's art, resolved to a URL (`useTokenPortrait`); it replaces the Image block's art. */
  art?: StatblockPortrait | undefined;
}
