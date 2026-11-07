import { useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { CATALOG_CREATURE_FILTERS } from '../../../../creatures/creatureFieldCatalog';
import { collectionCreatureFilters } from '../../../../creatures/creatureFilterDefinitions';
import type { AssetService } from '../../../../services/AssetService';
import type { CreatureFilterDefinition } from '../../../../types/creatureFilterTypes';
import { useSystemPresets } from '../../../../react/hooks/useSystemPresets';
import { useRoleTemplates } from '../../../../react/components/collection-settings/useRoleTemplates';
import { collectionStatblockRoles } from '../../../../statblocks/roles/collectionStatblockRoles';

/**
 * The creature filters a collection offers, its statblock templates' among them, kept current as
 * its settings are saved and its templates change.
 */
export function useCollectionFilterDefinitions(
  app: App,
  assetService: AssetService | null,
  collectionId: string,
): readonly CreatureFilterDefinition[] {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const ref = app.workspace.on('atlas-vtt:collection-settings-changed', (changed) => {
      if (changed === collectionId) setRevision((value) => value + 1);
    });
    return () => app.workspace.offref(ref);
  }, [app, collectionId]);

  // `revision` stands for the collection settings, which are read here.
  const settings = useMemo(() => assetService?.getCollectionSettings(collectionId) ?? null, [assetService, collectionId, revision]);
  const { presets } = useSystemPresets(app);
  const roles = useMemo(() => (settings ? collectionStatblockRoles(settings, presets) : []), [settings, presets]);
  const templates = useRoleTemplates(app, roles, settings !== null);

  return useMemo(
    () => (settings ? collectionCreatureFilters(settings, templates) : CATALOG_CREATURE_FILTERS),
    [settings, templates],
  );
}
