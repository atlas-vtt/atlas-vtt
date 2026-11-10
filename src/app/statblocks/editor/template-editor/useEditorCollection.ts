/** The collection the template editor works for. */

import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { AssetService } from '../../../services/AssetService';

/**
 * The collection the editor works for (§7.1): the one it was opened for,
 * else the default collection; the editor offers no way to change it. Until
 * the collections are read it is the one asked for.
 */
export function useEditorCollection(app: App | undefined, requested: string | null): string | null {
  const [known, setKnown] = useState<readonly string[] | null>(null);
  useEffect(() => {
    if (!app) return undefined;
    let current = true;
    AssetService.getInstance(app).getCollections().then(
      (list) => { if (current) setKnown(list.map(({ id }) => id)); },
      (error: unknown) => console.error('[Atlas] Reading the collections failed:', error),
    );
    return () => { current = false; };
  }, [app]);
  if (!app || !known) return requested;
  return requested !== null && known.includes(requested) ? requested : AssetService.getInstance(app).getDefaultCollectionId();
}
