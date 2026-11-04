import React, { useCallback, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { cn } from '../../../../../utils/cn';
import { STANDING_LIST } from '../../../../keyboard/tooltipEscape';
import type { DiceSet } from '../../../../types/diceSetTypes';
import { t } from '../../../../i18n';
import { diceSetFacts } from './diceSetFacts';
import { SetDice, setDiceRequests } from './SetDice';
import { gridStep } from './gridKeys';
import { useDieImages } from './useDieImages';

/** One entry of the picker: a set, said as its name and facts unless the entry says it otherwise. */
export interface DiceSetChoice {
  /** What `onPick` gets; the set's id, or another for an entry that stands for something else (the collection's dice). */
  id: string;
  /** Whose dice the entry shows. */
  set: DiceSet;
  /** Shown instead of the set's name: "Collection's dice". */
  title?: string | undefined;
  /** Shown instead of the set's own facts: "Dolmenwood collection · d20". */
  facts?: readonly string[] | undefined;
  /** A badge after the title: "Default". */
  badge?: string | undefined;
}

interface DiceSetPickerProps {
  choices: readonly DiceSetChoice[];
  /** The id of the chosen entry. */
  value: string;
  onPick: (id: string) => void;
  /** How many entries at the top stand apart from the library's sets, under a hairline. */
  leading?: number | undefined;
  /** Shown but not picked: a template from a newer Atlas. */
  disabled?: boolean | undefined;
  labelledBy?: string | undefined;
  label?: string | undefined;
}

/** What the entry says, for screen readers: `Power roll, built-in, 2d10, crits on 19–20, advantage +2`. */
function spokenChoice(choice: DiceSetChoice, facts: readonly string[]): string {
  const marks = [choice.badge, !choice.title && choice.set.builtIn ? t('diceLab.builtIn') : undefined];
  return [choice.title ?? choice.set.name, ...marks, ...facts].filter(Boolean).join(', ');
}

function ChoiceText({ choice, facts }: { choice: DiceSetChoice; facts: readonly string[] }): React.ReactElement {
  return (
    <span className="atlas-dice-picker__text">
      <span className="atlas-dice-picker__title">
        <span className="atlas-dice-picker__name">{choice.title ?? choice.set.name}</span>
        {choice.badge && <span className="atlas-dice-picker__badge">{choice.badge}</span>}
        {!choice.title && choice.set.builtIn && <Lock className="atlas-dice-picker__lock" aria-hidden="true" />}
      </span>
      {facts.length > 0 && (
        <span className="atlas-dice-picker__facts">
          {facts.map((fact, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="atlas-dice-picker__dot">·</span>}
              <span className="atlas-dice-picker__fact">{fact}</span>
            </React.Fragment>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * The dice sets to pick from, each a row with its dice drawn first, then its
 * name and what it does in a few facts (its roll, when it is critical, what
 * advantage does). A listbox: the arrow keys, Home and End move along it,
 * Enter or Space picks, and a pick is never made by moving focus alone, so
 * looking through the list changes nothing.
 */
export function DiceSetPicker({ choices, value, onPick, leading = 0, disabled = false, labelledBy, label }: DiceSetPickerProps): React.ReactElement {
  const [doc, setDoc] = useState<Document | null>(null);
  const chosenAt = Math.max(0, choices.findIndex((choice) => choice.id === value));
  /** The entry that takes Tab into the list: the last focused, else the chosen one. */
  const [focusAt, setFocusAt] = useState<number | null>(null);
  const tabStop = focusAt !== null && focusAt < choices.length ? focusAt : chosenAt;
  const image = useDieImages(choices.flatMap((choice) => setDiceRequests(choice.set)), doc);
  const setList = useCallback((element: HTMLDivElement | null): void => setDoc(element?.ownerDocument ?? null), []);

  const pick = (choice: DiceSetChoice): void => {
    if (!disabled && choice.id !== value) onPick(choice.id);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, index: number): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(choices[index]!);
      return;
    }
    const next = gridStep(event.key, index, choices.length);
    if (next === null) return;
    event.preventDefault();
    setFocusAt(next);
    event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="option"]')[next]?.focus();
  };

  return (
    <div ref={setList} className="atlas-dice-picker" role="listbox"
      aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label} aria-disabled={disabled || undefined} {...STANDING_LIST}>
      {choices.map((choice, index) => {
        const chosen = index === chosenAt && choice.id === value;
        // Measured against what the entry is called: an entry titled otherwise says its roll
        const facts = choice.facts ?? diceSetFacts({ ...choice.set, name: choice.title ?? choice.set.name });
        return (
          <React.Fragment key={choice.id}>
            {index === leading && leading > 0 && <div className="atlas-dice-picker__rule" role="presentation" />}
            <div
              role="option"
              aria-selected={chosen}
              aria-label={spokenChoice(choice, facts)}
              aria-disabled={disabled || undefined}
              tabIndex={index === tabStop ? 0 : -1}
              className={cn('atlas-dice-picker__choice', chosen && 'atlas-selected')}
              onClick={() => pick(choice)}
              onFocus={() => setFocusAt(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <SetDice set={choice.set} image={image} />
              <ChoiceText choice={choice} facts={facts} />
              <Check className="atlas-dice-picker__check" aria-hidden="true" />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
