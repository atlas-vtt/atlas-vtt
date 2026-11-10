import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { onMapRulesChange } from '../../services/mapRules';

/**
 * A number that changes whenever the rules a map plays by may have changed (`onMapRulesChange`):
 * a collection's settings were saved, another campaign system applies, a user preset changed, or
 * the asset index, which says which collection the map is in, has loaded.
 */
export function useMapRulesRevision(app: App | null | undefined): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!app) return;
    return onMapRulesChange(app, 'any', () => setRevision((value) => value + 1));
  }, [app]);

  return revision;
}
