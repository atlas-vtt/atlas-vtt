import { useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { BUILT_IN_DICE_SETS } from '../../gameSystems/builtInDiceSets';
import { diceSetServiceOf } from '../../services/diceSets/collectionDiceSets';
import type { DiceSetService } from '../../services/diceSets/DiceSetService';
import type { DiceSet } from '../../types/diceSetTypes';

export interface DiceSets {
  /** Null while the library's files are not open (no plugin): only the built-in sets are there. */
  service: DiceSetService | null;
  sets: readonly DiceSet[];
}

/** The vault's dice sets, kept current as they are saved, renamed or deleted, here or on another device. */
export function useDiceSets(app: App | undefined): DiceSets {
  const service = useMemo(() => diceSetServiceOf(app), [app]);
  const [sets, setSets] = useState<readonly DiceSet[]>(() => service?.list() ?? BUILT_IN_DICE_SETS);

  useEffect(() => {
    if (!service) return;
    setSets(service.list());
    return service.onChange(() => setSets(service.list()));
  }, [service]);

  return { service, sets };
}
