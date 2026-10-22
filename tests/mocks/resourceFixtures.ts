import type { StoreApi } from 'zustand';
import type { TokenControlsUI } from '../../src/app/pixi/TokenControlsUI';
import type { ResourceSlot } from '../../src/app/pixi/token-renderer/resources/ResourceStack';
import { wheelSlot } from '../../src/app/pixi/token-renderer/resources/wheelGeometry';
import { HP_RESOURCE, STRESS_RESOURCE } from '../../src/app/resources/resourceDefinitions';
import type { ResourceDefinition, VisibleResource } from '../../src/app/resources/resourceTypes';
import { shapeOf, visibleResources } from '../../src/app/resources/visibleResources';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import { barDimensions } from '../../src/app/styles/designTokens';

export const HP: ResourceDefinition = { ...HP_RESOURCE };
export const STRESS: ResourceDefinition = { ...STRESS_RESOURCE };
export const STR: ResourceDefinition = { ...HP_RESOURCE, key: 'str', name: 'STR', field: 'stats.0', color: '#dc2626', defeatedWhenSpent: false };
export const AMMO: ResourceDefinition = { ...HP_RESOURCE, key: 'ammo', name: 'Ammo', field: 'ammo', color: '#f59e0b', defeatedWhenSpent: false };
/** A value that never changes in play, such as an armour class. */
export const ARMOR: ResourceDefinition = { ...HP_RESOURCE, key: 'armor', name: 'Armor', field: 'ac', direction: 'static', color: '#94a3b8', defeatedWhenSpent: false };

/** Where the token UI draws `resources`: bars stacked from 2 units below the token, wheels in their own places. */
export function resourceSlots(resources: readonly VisibleResource[]): ResourceSlot[] {
  const { width, height, gap } = barDimensions.token;
  let bar = 0;
  return resources.map(({ definition, slot }) => (shapeOf(slot) === 'bar'
    ? { key: definition.key, kind: 'bar', top: 2 + bar++ * (height + gap), left: -width / 2, width, height }
    : wheelSlot(definition.key, slot)));
}

/** Gives the controls the definitions and the layout a token UI would report. */
export function wireControls(controls: TokenControlsUI, store: StoreApi<ViewAtlasState>, definitions: readonly ResourceDefinition[]): void {
  controls.resourceDefsProvider = () => definitions;
  controls.slotsProvider = (tokenId) => {
    const token = store.getState().objects.tokens[tokenId];
    return token ? resourceSlots(visibleResources(token, definitions, 'dm')) : [];
  };
}
