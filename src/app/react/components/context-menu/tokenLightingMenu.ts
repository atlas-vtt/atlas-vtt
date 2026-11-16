import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../../storeFactory';
import type { ContextMenuEntry } from './AtlasContextMenu';
import { emissionOf, lightPresetOf } from '../../../lighting/lightPresetChoice';
import type { LightPresetDefinition } from '../../../types/lightPresetTypes';
import { t } from '../../../i18n';
import { lightPresetName } from '../../../lighting/lightPresetNames';

/**
 * Vision and carried light for `tokenId` and the rest of `targets` (the selection it belongs to),
 * each change one undo step. The clicked token decides what the menu shows as current; the
 * lights offered are `presets`, those of the map's collection.
 */
export function tokenLightingEntries(
  store: StoreApi<ViewAtlasState>,
  tokenId: string,
  targets: readonly string[],
  presets: readonly LightPresetDefinition[],
): ContextMenuEntry[] {
  const tokens = store.getState().objects.tokens;
  const token = tokens[tokenId];
  if (!token) return [];
  const sees = token.vision?.enabled ?? false;
  // A custom light ticks nothing: it is neither none nor one of the presets.
  const current = token.light ? lightPresetOf(token.light, presets) ?? 'custom' : null;

  const option = (label: string, preset: LightPresetDefinition | null): ContextMenuEntry => ({
    type: 'item',
    label,
    checked: current === preset,
    onClick: () => store.getState().updateTokens(
      targets.map((id) => ({ id, changes: { light: preset ? emissionOf(preset) : undefined } })),
    ),
  });

  return [
    {
      type: 'item',
      label: t('vision.toggle'),
      icon: 'scan-eye',
      checked: sees,
      onClick: () => store.getState().updateTokens(
        targets.map((id) => ({ id, changes: { vision: { ...tokens[id]?.vision, enabled: !sees } } })),
      ),
    },
    {
      type: 'submenu',
      label: t('vision.carryLight'),
      icon: 'flame',
      children: [option(t('common.none'), null), ...presets.map((preset) => option(lightPresetName(preset), preset))],
    },
  ];
}
