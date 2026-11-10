import { useMemo } from 'react';
import { useCreatureIndex } from '../../creatures/useCreatureIndex';
import type { ResourceDefinition, ResourceValue } from '../../resources/resourceTypes';
import { startingResources } from '../../resources/statblockResourceValues';
import type { StatblockLink } from './useStatblockSenses';

const NO_DEFAULTS: Record<string, ResourceValue> = {};

/**
 * What the linked statblock gives each resource, read through the resolver, so renamed keys and
 * the template's meanings count (a Draw Steel monster's Stamina is its hit points). Empty without
 * a link and while the note is unread; kept current while the note changes.
 */
export function useStatblockResourceDefaults(link: StatblockLink | null, definitions: readonly ResourceDefinition[]): Record<string, ResourceValue> {
  const path = link?.path;
  const paths = useMemo(() => (path ? [path] : []), [path]);
  const creatures = useCreatureIndex(link?.app ?? null, paths);
  const creature = path ? creatures.get(path) : undefined;
  return useMemo(
    () => (creature ? startingResources(creature.fields, definitions, creature.meanings) : NO_DEFAULTS),
    [creature, definitions],
  );
}
