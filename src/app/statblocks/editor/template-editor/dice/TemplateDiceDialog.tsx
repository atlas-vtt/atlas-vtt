import React, { useRef, useState } from 'react';
import type { App } from 'obsidian';
import { defaultDiceSet, findDiceSet } from '../../../../gameSystems/diceSetResolution';
import { t } from '../../../../i18n';
import { Button } from '../../../../packages/components/primitives/button';
import { DiceLabDialog } from '../../../../react/components/collection-settings/dice-lab/DiceLabDialog';
import { critFact } from '../../../../react/components/collection-settings/dice-lab/diceSetFacts';
import { DiceSetPicker, type DiceSetChoice } from '../../../../react/components/collection-settings/dice-lab/DiceSetPicker';
import { InfoMark } from '../../../../react/components/collection-settings/InfoMark';
import { useDiceSets } from '../../../../react/hooks/useDiceSets';
import { diceSetOfCollection } from '../../../../services/diceSets/collectionDiceSets';
import type { DiceSet } from '../../../../types/diceSetTypes';
import { EditorDialog } from '../inspector/EditorDialog';

export interface TemplateDiceDialogProps {
  app: App | undefined;
  /** An element of the editor: the dialog opens in its window. */
  anchor: HTMLElement;
  /** The set the template names; null rolls the collection's dice. */
  diceSetId: string | null;
  /** The collection the editor works for, whose dice the template rolls without a set of its own. */
  collectionId: string | null;
  readOnly: boolean;
  onPick: (id: string | null) => void;
  onClose: () => void;
}

/** The entry for the collection's dice. */
const COLLECTION = '';

/** The first entry: the collection's dice as they are now, `Dolmenwood collection · d20 · crits on a natural 20`. */
function collectionChoice(set: DiceSet, collectionId: string | null): DiceSetChoice {
  const facts = [...(collectionId ? [t('diceLab.ofCollection', { name: collectionId })] : []), set.name, critFact(set)];
  return { id: COLLECTION, set, title: t('diceLab.collectionDice'), facts, badge: t('diceLab.default') };
}

/**
 * Dice rolls… from the capsule's ⋯: which dice a bare bonus ("+6") of the
 * template's statblocks rolls with. The collection's dice by default, shown
 * as they are now, or a set from the vault's library; a pick is one undo step.
 * The dice lab opens over the dialog, so a set can be made or changed and
 * picked without leaving the template.
 */
export function TemplateDiceDialog(props: TemplateDiceDialogProps): React.JSX.Element {
  const { app, anchor, diceSetId, collectionId, readOnly, onPick, onClose } = props;
  const diceSets = useDiceSets(app);
  const [lab, setLab] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);
  const collectionSet = app ? diceSetOfCollection(app, collectionId) : defaultDiceSet();
  // A set the library lacks rolls the collection's dice: the dialog says so by picking that.
  const picked = findDiceSet(diceSets.sets, diceSetId ?? undefined)?.id ?? COLLECTION;
  const choices = [collectionChoice(collectionSet, collectionId), ...diceSets.sets.map((set): DiceSetChoice => ({ id: set.id, set }))];

  return (
    <EditorDialog
      anchor={anchor}
      title={t('templateEditor.dice.title')}
      className="atlas-te-dice"
      onClose={onClose}
      initialFocus={doneRef}
      footer={(
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => setLab(true)}>{t('templateEditor.dice.lab')}</Button>
          <Button ref={doneRef} type="button" variant="default" size="sm" onClick={onClose}>{t('templateEditor.done')}</Button>
        </>
      )}
    >
      {lab && <DiceLabDialog anchor={anchor} diceSets={diceSets} initialId={picked || collectionSet.id || undefined} onClose={() => setLab(false)} />}
      <div className="atlas-te-dialog__field">
        <p className="atlas-te-dice__intro">
          <span>{t('templateEditor.dice.intro')}</span>
          <InfoMark label={t('templateEditor.dice.written')} />
        </p>
        <DiceSetPicker choices={choices} value={picked} leading={1} disabled={readOnly} label={t('templateEditor.dice.title')}
          onPick={(id) => onPick(id === COLLECTION ? null : id)} />
      </div>
    </EditorDialog>
  );
}
