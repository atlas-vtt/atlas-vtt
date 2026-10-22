import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type { AnyAsset } from '../types';
import { spawnAndClose, spawnEncounterTokens, spawnSelectedTokens, spawnTokenAsset, type SpawnContext } from '../utils/tokenSpawnService';
import { SPAWN_MULTIPLE_COUNTS } from '../utils/spawnCount';
import { t } from '../../../../i18n';

/**
 * The asset menu's ways to bring an encounter or tokens into the open scene: onto the map, onto it
 * and into the initiative tracker (a fight), or into the tracker beside the map. `onClose` closes
 * the asset manager as soon as the tokens are in the GM's hand to be placed, or once added.
 */
export function spawnMenuEntries(asset: AnyAsset, selectedAssets: AnyAsset[], spawnCtx: SpawnContext, onClose: () => void): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];
  const spawn = (run: (ctx: SpawnContext) => Promise<string[]>): (() => Promise<void>) => async (): Promise<void> => {
    await spawnAndClose(spawnCtx, onClose, run);
  };

  // ── Spawn Encounter ───────────────────────────────────────────
  if (asset.type === 'encounters') {
    entries.push({
      type: 'item',
      label: t('am.menu.spawnEncounter'),
      icon: 'target',
      onClick: spawn((ctx) => spawnEncounterTokens(ctx, asset)),
    });
    // A fight: placed as above and every creature in the tracker; or the tracker alone, beside the map
    entries.push({
      type: 'item',
      label: t('am.menu.startFight'),
      icon: 'swords',
      onClick: spawn((ctx) => spawnEncounterTokens(ctx, asset, 'fight')),
    });
    entries.push({
      type: 'item',
      label: t('am.menu.encounterBeside'),
      icon: 'list-plus',
      onClick: spawn((ctx) => spawnEncounterTokens(ctx, asset, 'beside')),
    });
  }

  // ── Spawn Token(s) on Map ─────────────────────────────────────
  if (asset.type === 'tokens') {
    const spawnCount = selectedAssets.filter((a) => a.type === 'tokens').length;
    entries.push({
      type: 'item',
      label: spawnCount > 1 ? t('am.menu.spawnTokens', { count: spawnCount }) : t('am.menu.spawn'),
      icon: 'map-pin',
      onClick: spawn((ctx) => spawnSelectedTokens(ctx, selectedAssets)),
    });
    if (spawnCount <= 1) {
      entries.push({
        type: 'submenu',
        label: t('am.menu.spawnMultiple'),
        icon: 'copy-plus',
        children: SPAWN_MULTIPLE_COUNTS.map((count) => ({
          type: 'item' as const,
          label: t('am.menu.nTokens', { count }),
          onClick: spawn((ctx) => spawnTokenAsset(ctx, asset, count)),
        })),
      });
    }
    // Into the initiative tracker without a place on the map, each copy a combatant of its own
    if (spawnCount > 1) {
      entries.push({
        type: 'item',
        label: t('am.menu.addTokensToInitiative', { count: spawnCount }),
        icon: 'list-plus',
        onClick: spawn((ctx) => spawnSelectedTokens(ctx, selectedAssets, 'beside')),
      });
    } else {
      entries.push({
        type: 'submenu',
        label: t('am.menu.addToInitiative'),
        icon: 'list-plus',
        children: [1, ...SPAWN_MULTIPLE_COUNTS].map((count) => ({
          type: 'item' as const,
          label: t('am.menu.nTokens', { count }),
          onClick: spawn((ctx) => spawnTokenAsset(ctx, asset, count, 'beside')),
        })),
      });
    }
  }

  return entries;
}
