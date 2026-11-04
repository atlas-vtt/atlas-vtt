import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import type { Campaign } from '../../../campaigns/campaignTypes';
import { AssetService } from '../../../services/AssetService';

/**
 * The collections whose scenes the campaign played, read while `active`; null until they are
 * known. A scene that left the library counts for none.
 */
export function usePlayedCollections(app: App, campaign: Campaign, active: boolean): readonly string[] | null {
  const [collections, setCollections] = useState<readonly string[] | null>(null);
  // The scenes as a key: a play recorded in another scene changes it, one of a scene already played does not.
  const scenes = Object.keys(campaign.used?.scenes ?? {}).sort().join('\n');

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const played = new Set(scenes === '' ? [] : scenes.split('\n'));
    AssetService.getInstance(app).getAssets(undefined, 'scene').then((all) => {
      if (!cancelled) setCollections([...new Set(all.filter((scene) => played.has(scene.id)).map((scene) => scene.collection))]);
    }).catch((error: unknown) => {
      console.error('[usePlayedCollections] Could not list the scenes:', error);
      if (!cancelled) setCollections([]);
    });
    return () => { cancelled = true; };
  }, [app, scenes, active]);

  return collections;
}
