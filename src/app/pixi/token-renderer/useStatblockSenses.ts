import { useMemo } from 'react';
import type { App } from 'obsidian';
import { inheritedSensesOf, type InheritedSenses } from '../../creatures/creatureSenses';
import type { SenseRules } from '../../creatures/tokenSensesResolver';
import { useCreatureIndex } from '../../creatures/useCreatureIndex';

/** The statblock a token links, and what its senses line is read with. */
export interface StatblockLink {
  app: App;
  /** Vault path of the statblock note. */
  path: string;
  /** The senses of the map's collection and what it measures in (`mapSenseRules`). */
  rules: SenseRules;
  /** Which of the statblock's speeds the token moves by (`BaseToken.speedKind`); unset is the first. */
  speedKind?: string | undefined;
}

/**
 * What the linked statblock says about senses, whatever the token has of its own: the senses a
 * token follows while it has none, the phrases that name no sense of the collection, and whether
 * the creature is blind beyond its senses. Null without a link, while the note is unread, and
 * when it says nothing about senses. Kept current while the note or the bestiary changes.
 */
export function useStatblockSenses(link: StatblockLink | null): InheritedSenses | null {
  const path = link?.path;
  const paths = useMemo(() => (path ? [path] : []), [path]);
  const creatures = useCreatureIndex(link?.app ?? null, paths);
  if (!link) return null;
  // Asked as for a token without senses of its own: what the statblock gives.
  return inheritedSensesOf({ statblockPath: link.path }, creatures.get(link.path), link.rules.definitions, link.rules.unit);
}
