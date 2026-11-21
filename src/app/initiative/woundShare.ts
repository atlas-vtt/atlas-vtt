import type { ResourceDefinition, ResourceValue } from '../resources/resourceTypes';

/**
 * How much of its life a combatant has lost, from 0 (unhurt) to 1, for the red that rises in its initiative card
 * (`initiative-wound`): of the resources that defeat it (hit points), the one furthest spent. Null where none tells,
 * so the card shows no red at all.
 */
export function woundShare(values: readonly { definition: Pick<ResourceDefinition, 'direction'>; value: ResourceValue }[]): number | null {
  let share: number | null = null;
  for (const { definition, value } of values) {
    if (value.max <= 0 || definition.direction === 'static') continue;
    const used = definition.direction === 'fills' ? value.current / value.max : 1 - value.current / value.max;
    share = Math.max(share ?? 0, Math.min(1, Math.max(0, used)));
  }
  return share;
}
