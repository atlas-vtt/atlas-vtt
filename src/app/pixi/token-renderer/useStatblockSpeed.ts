import { useMemo } from 'react';
import { chosenSpeed, statblockSpeeds } from '../../creatures/statblockSpeeds';
import { useCreatureIndex } from '../../creatures/useCreatureIndex';
import type { StatblockLink } from './useStatblockSenses';

/**
 * The speed the linked statblock gives a token that has none of its own, in the map's game units:
 * the one the token picked of those its speed line states, else the first. Undefined without a
 * link, while the note is unread, and where it states none. Kept current while the note or the
 * bestiary changes.
 */
export function useStatblockSpeed(link: StatblockLink | null): number | undefined {
  const path = link?.path;
  const paths = useMemo(() => (path ? [path] : []), [path]);
  const creature = useCreatureIndex(link?.app ?? null, paths).get(path ?? '');
  if (!link || !creature) return undefined;
  return chosenSpeed(statblockSpeeds(creature.fields, creature.meanings, link.rules.unit), link.speedKind)?.speed;
}
