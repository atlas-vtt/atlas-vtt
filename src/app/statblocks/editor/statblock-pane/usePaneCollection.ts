import { useEffect, useMemo, useReducer, useState } from 'react';
import type { App } from 'obsidian';
import { useSystemPresets } from '../../../react/hooks/useSystemPresets';
import type { StatblockRole } from '../../model/roleTypes';
import { GENERIC_STATBLOCK_ROLES } from '../../roles/collectionStatblockRoles';
import { collectionRoles, resolveCollectionContext, type CollectionContext } from '../collectionContext';

export interface PaneCollection {
  /** Null until the asset index has been read. */
  context: CollectionContext | null;
  roles: readonly StatblockRole[];
}

/**
 * The collection the pane works for (§7.1) and its statblock roles. The
 * resolved collection is handed back (`onResolved`) so the view state keeps
 * it; the roles follow the collection's settings as they are saved.
 */
export function usePaneCollection(app: App, notePath: string, requested: string | null, onResolved: (id: string) => void): PaneCollection {
  const [context, setContext] = useState<CollectionContext | null>(null);
  const [revision, refresh] = useReducer((count: number): number => count + 1, 0);
  const { presets } = useSystemPresets(app);

  useEffect(() => {
    const ref = app.workspace.on('atlas-vtt:collection-settings-changed', refresh);
    return () => app.workspace.offref(ref);
  }, [app]);

  useEffect(() => {
    let cancelled = false;
    resolveCollectionContext(app, notePath, requested).then(
      (resolved) => {
        if (cancelled) return;
        setContext(resolved);
        if (resolved.collectionId !== requested) onResolved(resolved.collectionId);
      },
      (error: unknown) => console.error('[Atlas] Reading the collections for the statblock pane failed:', error),
    );
    return () => { cancelled = true; };
  }, [app, notePath, requested, onResolved, revision]);

  const roles = useMemo(
    () => (context ? collectionRoles(app, context.collectionId, presets) : GENERIC_STATBLOCK_ROLES),
    // `revision` reads the collection's settings again after they were saved.
    [app, context, presets, revision],
  );
  return { context, roles };
}
