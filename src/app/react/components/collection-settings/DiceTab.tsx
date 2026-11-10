/**
 * DiceTab — The dice set a bare bonus of the collection rolls with, picked
 * from the vault's library, and the way into the dice lab, where the library's
 * sets are made.
 */

import React, { useId, useRef, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { COLLECTION_DICE_ID } from '../../../gameSystems/diceSetResolution';
import { Button } from '../../../packages/components/primitives/button';
import type { DiceSet } from '../../../types/diceSetTypes';
import type { DiceSets } from '../../hooks/useDiceSets';
import { t } from '../../../i18n';
import { DiceLabDialog } from './dice-lab/DiceLabDialog';
import { DiceSetPicker, type DiceSetChoice } from './dice-lab/DiceSetPicker';
import { InfoMark } from './InfoMark';

interface DiceTabProps {
  /** What the collection rolls now: its pick, its own stored dice, or its system's. */
  diceSet: DiceSet;
  diceSets: DiceSets;
  onPick: (set: DiceSet) => void;
}

/** The sets to pick from, after the collection's own dice where it rolls dice no set of the library rolls. */
export function diceSetChoices(current: DiceSet, sets: readonly DiceSet[]): DiceSetChoice[] {
  const choices = sets.map((set): DiceSetChoice => ({ id: set.id, set }));
  if (current.id !== COLLECTION_DICE_ID) return choices;
  return [{ id: COLLECTION_DICE_ID, set: current, title: t('diceLab.ownDice') }, ...choices];
}

export function DiceTab({ diceSet, diceSets, onPick }: DiceTabProps): React.ReactElement {
  const labelId = useId();
  const labButton = useRef<HTMLButtonElement>(null);
  const [labOpen, setLabOpen] = useState(false);
  const choices = diceSetChoices(diceSet, diceSets.sets);

  return (
    <>
      <div className="atlas-csm-field">
        <span id={labelId} className="atlas-csm-label">{t('diceLab.defaultDice')}</span>
        <DiceSetPicker
          choices={choices}
          value={diceSet.id}
          leading={diceSet.id === COLLECTION_DICE_ID ? 1 : 0}
          labelledBy={labelId}
          onPick={(id) => {
            const set = diceSets.sets.find((entry) => entry.id === id);
            if (set) onPick(set);
          }}
        />
        <p className="atlas-csm-hint">{t('diceLab.defaultDiceHint')}</p>
      </div>

      <div className="atlas-dice-lab__entry">
        <span className="atlas-csm-label-row">
          <span className="atlas-csm-label">{t('diceLab.sets')}</span>
          <InfoMark label={t('diceLab.shared')} />
        </span>
        <Button ref={labButton} variant="outline" size="sm" onClick={() => setLabOpen(true)}>
          <FlaskConical aria-hidden="true" />
          {t('diceLab.open')}
        </Button>
      </div>
      {labOpen && labButton.current && (
        <DiceLabDialog anchor={labButton.current} diceSets={diceSets} initialId={diceSet.id || undefined} onClose={() => setLabOpen(false)} />
      )}
    </>
  );
}
