import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { AtlasUIContext, type AtlasUIContextValue } from '../../../react/root/AtlasUIContext';
import { DiceRollDisplay, type DiceRollSubscription } from '../../../react/components/dice/DiceRollDisplay';
import { diceSetOfCollection } from '../../../services/diceSets/collectionDiceSets';
import type { OffMapRolls } from '../../../services/statblockRolls';
import { rollingRules } from '../../../gameSystems/diceSets';
import { rollDiceFormula, rollingWith } from '../../../tools/DiceTool';
import type { DiceRollResult } from '../../../types/diceTypes';
import { OffMapRollsContext } from '../../render/shared/offMapRolls';
import { offlineDiceInputs } from '../../../services/offlineDiceInputs';

type RollListener = (result: DiceRollResult, options: { muted: boolean }) => void;
interface ShownRoll {
  result: DiceRollResult;
  muted: boolean;
}

export interface PaneDiceRollsProps {
  app: App;
  /** The pane's collection, whose dice rules roll while no map is open. */
  collectionId: string | null;
  children: React.ReactNode;
}

/**
 * The rolls of the statblock beside its note that no map on screen shows
 * (`statblockRolls.ts`): rolled by the collection's dice set (or the template's) while no map is
 * open, and thrown at the top of the pane by the dice display maps use, so a
 * click on a die is always seen. A map on screen shows its own rolls. The
 * display mounts with the first roll: dice stages hold graphics memory, and
 * most notes are read without rolling.
 */
export function PaneDiceRolls({ app, collectionId, children }: PaneDiceRollsProps): React.JSX.Element {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [rolled, setRolled] = useState(false);
  const listeners = useRef(new Set<RollListener>());
  /** Rolls made before the display listened: the first one mounts it. */
  const waiting = useRef<ShownRoll[]>([]);
  const collection = useRef(collectionId);
  useLayoutEffect(() => {
    collection.current = collectionId;
  });

  const offMap = useMemo((): OffMapRolls => ({
    roll: (formula, source, options) => {
      const { rules, shown } = rollingWith(diceSetOfCollection(app, collection.current), options?.set);
      const result = rollDiceFormula(formula, rules, offlineDiceInputs(), shown, options?.advantage);
      return result && { ...result, source };
    },
    rollingDice: (set) => rollingRules(rollingWith(diceSetOfCollection(app, collection.current), set).rules),
    show: (result, muted) => {
      if (listeners.current.size === 0) {
        waiting.current.push({ result, muted });
        setRolled(true);
        return;
      }
      for (const listener of listeners.current) listener(result, { muted });
    },
  }), [app]);
  const subscribe = useCallback<DiceRollSubscription>((onRoll) => {
    listeners.current.add(onRoll);
    for (const { result, muted } of waiting.current.splice(0)) onRoll(result, { muted });
    return () => { listeners.current.delete(onRoll); };
  }, []);
  const ui = useMemo((): AtlasUIContextValue => ({ app, view: null, pixiApp: null, renderer: null }), [app]);

  return (
    <OffMapRollsContext.Provider value={offMap}>
      {children}
      <div ref={setHost} className="atlas-sb-pane-rolls" />
      {host && rolled && (
        <AtlasUIContext.Provider value={ui}>
          <DiceRollDisplay container={host} subscribe={subscribe} cardSounds />
        </AtlasUIContext.Provider>
      )}
    </OffMapRollsContext.Provider>
  );
}
