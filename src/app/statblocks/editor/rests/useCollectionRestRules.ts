import { useEffect, useMemo, useReducer } from 'react';
import type { App } from 'obsidian';
import { collectionResources } from '../../../resources/collectionResources';
import type { ResourceDefinition } from '../../../resources/resourceTypes';
import { AssetService } from '../../../services/AssetService';
import type { ConditionDefinition } from '../../../types/collectionSettingsTypes';

/** What of a collection the recovery editor offers besides the template's own numbers. */
export interface CollectionRestRules {
  /** The resources whose fields a rule restores (HP, Stress). */
  readonly resources: readonly ResourceDefinition[];
  /** The conditions whose numbers a rule steps down (Exhaustion). */
  readonly conditions: readonly ConditionDefinition[];
}

const NONE: CollectionRestRules = { resources: [], conditions: [] };

/**
 * The resources and conditions of the collection the template editor works for, read again when a
 * collection's settings are saved. Rules name template fields and condition ids, so they hold in
 * every collection; this one only decides what the card offers to pick.
 */
export function useCollectionRestRules(app: App | undefined, collectionId: string | null): CollectionRestRules {
  const [revision, refresh] = useReducer((count: number): number => count + 1, 0);
  useEffect(() => {
    if (!app) return undefined;
    const ref = app.workspace.on('atlas-vtt:collection-settings-changed', refresh);
    return () => app.workspace.offref(ref);
  }, [app]);
  return useMemo((): CollectionRestRules => {
    if (!app || collectionId === null) return NONE;
    const settings = AssetService.getInstance(app).getCollectionSettings(collectionId);
    return { resources: collectionResources(settings), conditions: settings.conditions ?? [] };
    // `revision` reads the settings again after they were saved.
  }, [app, collectionId, revision]);
}
