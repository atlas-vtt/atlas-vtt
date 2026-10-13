import type { FantasyStatblocksCreature } from '../../src/app/services/FantasyStatblocksService';

export interface ParsingBestiary {
  /** The bestiary's creatures; a test adds the notes the parse has reached. */
  creatures: FantasyStatblocksCreature[];
  /** Ends the parse, as Fantasy Statblocks does after the last note. */
  finish(): void;
}

/**
 * Installs Fantasy Statblocks as it is while its watcher parses the vault: the bestiary
 * already holds `creatures` (the SRD is there from the start), names can be asked for, and
 * reading a creature by name throws until the parse is done. Remove
 * `window.FantasyStatblocks` afterwards.
 */
export function installParsingBestiary(creatures: FantasyStatblocksCreature[] = []): ParsingBestiary {
  let resolved = false;
  const named = (name: string): FantasyStatblocksCreature | undefined =>
    creatures.find((creature) => creature.name === name);
  Object.assign(window, {
    FantasyStatblocks: {
      getBestiaryCreatures: () => creatures,
      hasCreature: (name: string) => named(name) !== undefined,
      getCreatureFromBestiary: (name: string) => {
        if (!resolved) throw new Error('The bestiary is not fully resolved.');
        const creature = named(name);
        if (!creature) return null;
        const base = typeof creature.extends === 'string' ? named(creature.extends) : undefined;
        return { ...base, ...creature };
      },
      isResolved: () => resolved,
    },
  });
  return { creatures, finish: () => { resolved = true; } };
}
